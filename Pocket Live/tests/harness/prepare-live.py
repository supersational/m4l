#!/usr/bin/env python3
"""Inspect or prepare the disposable Pocket Live acceptance fixture.

Default is read-only. --allow-live-edits builds/loads the current QA controller
on Lab Audio, retaining Lab MIDI's reference devices. --reset additionally
recreates the whole unsaved fixture; no Set is ever saved by this helper.
QA output stays in ignored test artifacts, outside the release folder.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback
from live_oracle import LiveOracle

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
PLACES_NAME = os.environ.get('POCKET_LIVE_PLACES_NAME', ROOT.parent.name)
PLACES_ROOT = Path(os.environ.get('POCKET_LIVE_PLACES_ROOT', ROOT.parent)).expanduser().resolve()


def prepare_device(runtime):
    if runtime == ROOT:
        qa = ARTIFACTS / 'PocketLiveAcceptance.amxd'
    else:
        qa = runtime / 'PocketLiveAcceptance.amxd'
    try:
        qa.relative_to(ROOT.parent)
    except ValueError as error:
        raise ValueError('QA runtime must be inside the development checkout') from error
    qa.parent.mkdir(parents=True, exist_ok=True)
    portable = runtime / 'Pocket Live.amxd'
    if os.environ.get('POCKET_LIVE_RELEASE_PACKAGE'):
        import shutil
        shutil.copyfile(portable, qa)
        return qa
    command = [sys.executable, str(ROOT/'build.py'), '--output', str(qa),
               '--resource-root', str(runtime)]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180)
    if result.returncode or not qa.is_file():
        log = ARTIFACTS / 'prepare-live-build.log'
        log.write_text(result.stdout + result.stderr)
        log.chmod(0o600)
        raise RuntimeError('QA build failed; inspect tests/artifacts/prepare-live-build.log')
    return qa


def load_device(kernel, qa, track):
    from time import monotonic, sleep

    parts = qa.relative_to(PLACES_ROOT).parts
    code = f"""
target=next(t for t in song.tracks if t.name=={track!r})
root=next(folder for folder in application.browser.user_folders if folder.name=={PLACES_NAME!r})
for part in {parts[:-1]!r}:
    root=next(child for child in root.children if child.name==part)
item=next(child for child in root.children if child.name in ({qa.name!r},{qa.stem!r}) and child.is_loadable)
def load_fixture(t=target, device=item):
    song.view.selected_track=t
    if len(t.devices): song.view.select_device(t.devices[-1])
    application.browser.load_item(device)
kernel.schedule_message(1,load_fixture)
True
"""
    deadline = monotonic() + 12
    while True:
        try:
            kernel.exec(code)
            break
        except Exception as error:
            if not str(error).startswith('StopIteration:'):
                raise
            if monotonic() >= deadline:
                raise RuntimeError('QA patch not visible in Live. Add the development checkout to Places.') from error
            sleep(.25)
    deadline = monotonic() + 10
    while monotonic() < deadline:
        devices = kernel.exec(f"[d.name for d in next(t for t in song.tracks if t.name=={track!r}).devices]", depth=3)
        if any(name.startswith(qa.stem) for name in devices):
            return devices
        sleep(.1)
    raise RuntimeError('Live did not confirm that the QA patch loaded')


def reset_fixture(oracle):
    # Explicit destructive reset only. Keep two existing tracks where possible
    # because Live requires at least one track throughout some delete operations.
    count = oracle.kernel.exec('len(song.tracks)')
    scene_count = oracle.kernel.exec('len(song.scenes)')
    if count > 256 or scene_count > 512:
        raise ValueError('Refusing fixture reset beyond 256 tracks or 512 scenes')
    oracle.kernel.exec('song.stop_playing()\nsong.record_mode=False\nTrue')
    # Repeated small bounded calls avoid one large command timing out after it
    # partially mutated the Set. Markers are applied only after track recreation.
    oracle.kernel.exec("song.create_audio_track(-1)\nsong.tracks[-1].name='Pocket Acceptance staging'\nTrue")
    count = oracle.kernel.exec('len(song.tracks)')
    for index in reversed(range(count - 1)):
        oracle.kernel.exec(f'song.delete_track({index})\nTrue')
    oracle.kernel.exec("song.tracks[0].name='Lab Audio'\nsong.create_midi_track(-1)\nsong.tracks[-1].name='Lab MIDI'\nTrue")
    return_count = oracle.kernel.exec('len(song.return_tracks)')
    for index in reversed(range(return_count)):
        oracle.kernel.exec(f'song.delete_return_track({index})\nTrue')
    scene_count = oracle.kernel.exec('len(song.scenes)')
    while scene_count > 8:
        oracle.kernel.exec(f'song.delete_scene({scene_count-1})\nTrue')
        scene_count -= 1
    while scene_count < 8:
        oracle.kernel.exec('song.create_scene(-1)\nTrue')
        scene_count += 1
    oracle.kernel.exec('song.tempo=120.0\nsong.metronome=False\nTrue')


def fixture(oracle):
    data = oracle.read()
    names = [track['name'] for track in data['tracks'] if track['kind'] == 'track']
    if names.count('Lab Audio') != 1 or names.count('Lab MIDI') != 1:
        raise ValueError('Expected unique Lab Audio and Lab MIDI fixture markers; use --reset only for the disposable unsaved Set')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-live-edits', action='store_true')
    parser.add_argument('--reset', action='store_true', help='Explicitly replace current unsaved Set contents with a disposable two-track/eight-scene fixture')
    parser.add_argument('--transport', choices=('cloud', 'local'), default='cloud')
    parser.add_argument('--runtime-root', type=Path, help='Prepared transport-specific QA support directory (build.py --resource-root)')
    parser.add_argument('--track', help='Load on this track of any open Set instead of requiring the Lab fixture')
    parser.add_argument('--timeout', type=float, default=8)
    args = parser.parse_args()
    if args.reset and not args.allow_live_edits:
        parser.error('--reset requires --allow-live-edits')
    if not 0 < args.timeout <= 30:
        parser.error('--timeout must be greater than zero and at most 30 seconds')
    oracle = None
    try:
        if args.allow_live_edits:
            runtime = args.runtime_root.resolve() if args.runtime_root else ROOT
            config_file = runtime/'config.json'
            if not config_file.is_file():
                raise ValueError('Prepared runtime config.json is missing')
            mode = json.loads(config_file.read_text()).get('mode', 'cloud')
            if mode != args.transport:
                raise ValueError('Prepared runtime mode does not match --transport; prepare the isolated runtime first')
        oracle = LiveOracle(timeout=args.timeout)
        if not args.allow_live_edits:
            print(json.dumps({'ok': True, 'readOnly': True, 'state': oracle.read()}, allow_nan=False))
            return 0
        if args.reset:
            reset_fixture(oracle)
        if not args.track:
            fixture(oracle)
        host = args.track or 'Lab Audio'
        qa = prepare_device(runtime)
        # Only replace the QA controller; reference devices, clips and any other
        # devices on either fixture track survive the normal idempotent setup.
        indices = oracle.kernel.exec(f"t=next(t for t in song.tracks if t.name=={host!r})\n[i for i,d in enumerate(t.devices) if d.name.startswith('PocketLiveAcceptance')]", depth=3)
        for index in reversed(indices):
            oracle.kernel.exec(f"t=next(t for t in song.tracks if t.name=={host!r})\nt.delete_device({index})\nTrue")
        devices = load_device(oracle.kernel, qa, host)
        print(json.dumps({'ok': True, 'readOnly': False, 'transport': args.transport,
                          'qaDevice': str(qa), 'devices': devices, 'state': oracle.read() if args.track else fixture(oracle)}, allow_nan=False))
        return 0
    except Exception as error:
        # Native errors may include evaluated source and paths. JSON output is
        # intentionally stable and does not expose credentials from the bridge.
        # Keep the real cause privately; it was otherwise impossible to diagnose.
        artifacts = ROOT/'tests'/'artifacts'
        artifacts.mkdir(parents=True, exist_ok=True)
        log = artifacts/'prepare-live-error.log'
        log.write_text(traceback.format_exc())
        log.chmod(0o600)
        safe = str(error) if type(error) in (ValueError, RuntimeError) else 'Fixture preparation failed or timed out; inspect Live and the private build log'
        print(json.dumps({'ok': False, 'error': safe}), flush=True)
        return 1
    finally:
        if oracle:
            oracle.close()


if __name__ == '__main__':
    raise SystemExit(main())
