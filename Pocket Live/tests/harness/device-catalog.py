"""Verify Pocket Live's Add Device catalog against a running Ableton Live."""
import argparse
import json
from pathlib import Path
import re
import uuid

from live_oracle import LiveOracle

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--temporary-tracks", action="store_true",
                        help="Append two temporary tracks in the stopped Set and remove them after the run")
    args = parser.parse_args()
    if not args.temporary_tracks:
        parser.error("Use --temporary-tracks for the native insertion run.")
    source = (ROOT / "web/app.js").read_text()
    catalog = json.loads(re.search(r"const catalog=(\{.*?\});", source, re.S)[1])
    oracle = LiveOracle(timeout=12)
    kernel = oracle.kernel
    marker = "Pocket Live Catalog QA " + uuid.uuid4().hex[:8]
    selections = "[*song.tracks, *song.return_tracks, song.master_track]"
    selected = None
    failures = []
    total = 0
    try:
        version = kernel.exec(
            "assert not (song.is_playing or song.record_mode or song.session_record), 'Stop playback and recording first'\n"
            "'.'.join(str(x) for x in (application.get_major_version(), application.get_minor_version(), application.get_bugfix_version()))"
        )
        selected = kernel.exec(f"{selections}.index(song.view.selected_track)")
        print("Live", version, flush=True)
        for kind in ("audio", "midi"):
            kernel.exec(f"song.create_{kind}_track(-1)\nsong.tracks[-1].name={marker + ' ' + kind!r}\nTrue")
        for category, names in catalog.items():
            target = marker + (" audio" if category == "Audio effects" else " midi")
            for name in names:
                total += 1
                result = kernel.exec(f"""
t=next(t for t in song.tracks if t.name=={target!r})
assert len(t.devices)==0
result=None
try:
    t.insert_device({name!r})
    if len(t.devices)==1:
        result={{'ok': True, 'name': t.devices[0].name, 'class': t.devices[0].class_name}}
    else:
        result={{'ok': False, 'error': 'Expected one device, got '+str(len(t.devices))}}
except Exception as exc:
    result={{'ok': False, 'error': str(exc)}}
finally:
    for i in reversed(range(len(t.devices))):
        t.delete_device(i)
result
""", depth=3)
                print(f"{category} / {name}: {result.get('name') if result['ok'] else result['error']}", flush=True)
                if not result["ok"]:
                    failures.append(name)
    finally:
        try:
            kernel.exec(f"""
for i in reversed(range(len(song.tracks))):
    if song.tracks[i].name in ({marker + ' audio'!r}, {marker + ' midi'!r}):
        song.delete_track(i)
if {selected!r} is not None:
    song.view.selected_track={selections}[{selected or 0}]
True
""")
        finally:
            oracle.close()
    print(f"{total - len(failures)}/{total} catalog entries inserted. Failures: {failures}")
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
