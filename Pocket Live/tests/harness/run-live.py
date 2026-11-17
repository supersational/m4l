"""Explicit entry point for legacy checks which may edit the active Live Set."""
import argparse, os, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--suite', choices=['smoke', 'extended', 'reliability', 'relay-payload'], default='smoke')
p.add_argument('--allow-live-edits', action='store_true', help='Acknowledge that the dedicated lab set is open and this check may edit it')
a = p.parse_args()
if not a.allow_live_edits:
    p.error('Open a dedicated lab set, then pass --allow-live-edits. No Live connection was opened.')
sys.path.insert(0, str(ROOT))
from client import Remote
r = Remote()
try:
    names = {t['name'] for t in r.state['tracks']}
    if not {'Lab MIDI', 'Lab Audio'} <= names:
        raise SystemExit('Refusing: expected Lab MIDI and Lab Audio marker tracks in a dedicated lab set.')
    if a.suite == 'reliability' and r.state['sceneCount'] != 8:
        raise SystemExit('Reliability fixture requires exactly eight scenes.')
finally:
    r.close()
files = {'smoke': 'sync/legacy-smoke.py', 'extended': 'structure/legacy-extended.py', 'reliability': 'concurrency/legacy-reliability.py', 'relay-payload': 'performance/relay-payload.py'}
env = dict(os.environ, POCKET_LIVE_ALLOW_TEST_EDITS='1')
try:
    result = subprocess.run([sys.executable, str(ROOT/'tests/acceptance'/files[a.suite])], cwd=ROOT, env=env, timeout=180)
except subprocess.TimeoutExpired:
    raise SystemExit('Live check timed out; inspect the lab set before another run. Cleanup may be incomplete.')
raise SystemExit(result.returncode)
