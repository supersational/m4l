#!/usr/bin/env python3
"""Export independent native values for comparison with actual rendered browsers.

No Pocket Live connection or browser automation. Optional native tempo stimulus
is restricted to the disposable lab fixture and requires explicit opt-in.
"""
import argparse
import json
from pathlib import Path
from live_oracle import LiveOracle

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'artifacts'/'browser-native.json')
parser.add_argument('--set-tempo',type=float)
parser.add_argument('--allow-live-edits',action='store_true')
a=parser.parse_args()
if a.set_tempo is not None and (not a.allow_live_edits or not 20<=a.set_tempo<=999):
    parser.error('Native stimulus requires --allow-live-edits and a tempo from 20–999')
oracle=LiveOracle()
try:
    state=oracle.read()
    if a.set_tempo is not None:
        names={t['name'] for t in state['tracks'] if t['kind']=='track'}
        if not {'Lab Audio','Lab MIDI'}<=names:raise RuntimeError('Disposable lab fixture required')
        oracle.kernel.exec(f'song.tempo={a.set_tempo!r}\nsong.tempo')
        state=oracle.read()
    projection={k:state[k] for k in ('tempo','playing','metronome')}
    projection['tracks']=[{k:t[k] for k in ('name','volume','pan','mute','solo','arm')} for t in state['tracks']]
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(projection,indent=2)+'\n');a.output.chmod(0o600)
    print(json.dumps(projection))
finally:oracle.close()
