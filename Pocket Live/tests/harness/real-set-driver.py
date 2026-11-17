#!/usr/bin/env python3
"""Typed JSONL native access for testing Pocket Live against any real Set.

Unlike native-driver.py this does not require the Lab fixture, so its mutations
are few, explicitly reversible (the caller restores them) and never save the Set.
"""
import json
import sys
from live_oracle import LiveOracle

OPS = {
    'state': lambda k, a: dict(k.exec(
        "dict(path=song.file_path if hasattr(song,'file_path') else '',scenes=len(song.scenes),"
        "clips=sum(1 for t in song.tracks for s in t.clip_slots if s.has_clip),"
        "arrangement=sum(len(t.arrangement_clips) for t in song.tracks))", depth=3)),
    'set_tempo': lambda k, a: k.exec(f"song.tempo={float(a['value'])}\nTrue"),
    'set_mute': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].mute={bool(a['value'])}\nTrue"),
    'set_volume': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].mixer_device.volume.value={float(a['value'])}\nTrue"),
    'fire': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].clip_slots[{int(a['slot'])}].fire()\nTrue"),
    'stop_track': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].stop_all_clips()\nTrue"),
    'scene_name': lambda k, a: k.exec(f"song.scenes[{int(a['scene'])}].name"),
    'scene_rename': lambda k, a: k.exec(f"song.scenes[{int(a['scene'])}].name={str(a['name'])!r}\nTrue"),
    'fire_scene': lambda k, a: k.exec(f"song.scenes[{int(a['scene'])}].fire()\nTrue"),
    'device_param': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].devices[{int(a['device'])}].parameters[{int(a['param'])}].value"),
    'set_device_param': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].devices[{int(a['device'])}].parameters[{int(a['param'])}].value={float(a['value'])}\nTrue"),
    'add_return': lambda k, a: k.exec("song.create_return_track()\nlen(song.return_tracks)"),
    'add_scene': lambda k, a: k.exec("song.create_scene(-1)\nlen(song.scenes)"),
    'stop_clips': lambda k, a: k.exec("song.stop_all_clips(False)\nsong.stop_playing()\nTrue"),
    'rename': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].name={str(a['name'])!r}\nTrue"),
    'track_color': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].color"),
    'set_color': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].color={int(a['value'])}\nTrue"),
    'device_on': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].devices[{int(a['device'])}].parameters[0].value={float(a['value'])}\nTrue"),
    'clip_name': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].clip_slots[{int(a['slot'])}].clip.name"),
    'clip_rename': lambda k, a: k.exec(f"song.tracks[{int(a['track'])}].clip_slots[{int(a['slot'])}].clip.name={str(a['name'])!r}\nTrue"),
    'stop': lambda k, a: k.exec("song.stop_playing()\nTrue"),
    # Duplicating a track must never clone a running controller.
    'remove_qa': lambda k, a: k.exec(
        "[t.delete_device(i) for t in song.tracks for i in reversed(range(len(t.devices))) "
        "if t.devices[i].name.startswith('PocketLiveAcceptance')]\nTrue"),
    # One duplicate per call keeps each Kernel command short.
    'duplicate': lambda k, a: k.exec(f"song.duplicate_track({int(a['track'])})\nlen(song.tracks)"),
    'delete': lambda k, a: k.exec(f"song.delete_track({int(a['track'])})\nlen(song.tracks)"),
}


def main():
    oracle = LiveOracle(timeout=30)
    try:
        for line in sys.stdin:
            request = json.loads(line)
            try:
                if request['op'] == 'read':
                    result = oracle.read()
                else:
                    result = OPS[request['op']](oracle.kernel, request)
                print(json.dumps({'id': request['id'], 'ok': True, 'result': result}), flush=True)
            except Exception as error:
                print(json.dumps({'id': request['id'], 'ok': False, 'error': str(error)[:300]}), flush=True)
    finally:
        oracle.close()


if __name__ == '__main__':
    main()
