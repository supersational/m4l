"""Shared evidence and convergence primitives. No connection is opened on import."""
import json
import math
import threading
import time
from pathlib import Path


def differences(expected, actual, path='$', tolerance=1e-5):
    """Compare explicit projections; missing fields, order and types matter."""
    if type(expected) is not type(actual):
        if (type(expected) in (int, float) and type(actual) in (int, float)
                and math.isfinite(expected) and math.isfinite(actual)
                and abs(expected - actual) <= tolerance):
            return []
        return [path + ': type/value mismatch']
    if isinstance(expected, dict):
        result = []
        for key in sorted(expected.keys() | actual.keys()):
            child = path + '.' + key
            if key not in expected or key not in actual:
                result.append(child + ': missing/unexpected field')
            else:
                result.extend(differences(expected[key], actual[key], child, tolerance))
        return result
    if isinstance(expected, list):
        result = [] if len(expected) == len(actual) else [path + ': length mismatch']
        for index, (left, right) in enumerate(zip(expected, actual)):
            result.extend(differences(left, right, f'{path}[{index}]', tolerance))
        return result
    if type(expected) in (int, float):
        equal = math.isfinite(expected) and math.isfinite(actual) and abs(expected - actual) <= tolerance
    else:
        equal = expected == actual
    return [] if equal else [path + ': value mismatch']


def project_remote(state):
    """Supported common musical subset, independent of Max IDs and local UI."""
    fields = ('tempo', 'playing', 'record', 'metronome', 'loop', 'loopStart', 'loopLength', 'signature', 'sceneCount')
    result = {key: state[key] for key in fields}  # Missing fields must fail.
    result['tracks'] = []
    for track in state['tracks']:
        item = {key: track[key] for key in ('kind', 'name', 'mute', 'solo', 'arm')}
        item.update(volume=track['volume']['value'], pan=track['pan']['value'],
                    sends=[p['value'] for p in track['sends']],
                    devices=[{'name': d['name'], 'className': d['className'], 'on': d['on']} for d in track['devices']])
        result['tracks'].append(item)
    return result


def wait_converged(observe, *, expected=None, timeout=10, stable_for=.5,
                   interval=.1, clock=time.monotonic, sleep=time.sleep):
    """Require repeated agreement with independent Live, not a single lucky poll.

    observe returns {'Live': projection, 'A': projection, ...}. Sequential native
    reads can straddle mutations; comparison repeats until the state is stable.
    A permanently changing but universally matching state is not settled.
    """
    deadline = clock() + timeout
    stable_since, previous, last = None, None, ['No observations']
    observations = 0
    while clock() < deadline:
        states = observe()
        if 'Live' not in states or len(states) < 2:
            raise ValueError('Independent Live and at least one client are required')
        oracle = states['Live']
        last = differences(expected, oracle, '$.expected') if expected is not None else []
        for name, state in states.items():
            if name != 'Live':
                last.extend(differences(oracle, state, '$.' + name))
        observations += 1
        if not last:
            if previous is None or differences(previous, oracle):
                stable_since = clock()
                previous = json.loads(json.dumps(oracle, allow_nan=False))
            if clock() - stable_since >= stable_for:
                return {'observations': observations, 'state': oracle}
        else:
            stable_since, previous = None, None
        sleep(min(interval, max(0, deadline-clock())))
    raise TimeoutError('Convergence deadline exceeded: ' + '; '.join(last[:12]))


class Evidence:
    """Allowlisted event fields avoid leaking session URLs, tokens or audio paths."""
    def __init__(self):
        self.start = time.monotonic()
        self.events = []
        self.lock = threading.Lock()

    def add(self, kind, **fields):
        allowed = {'client', 'case', 'op', 'status', 'durationMs', 'observations', 'error', 'count'}
        if fields.keys() - allowed:
            raise ValueError('Unapproved trace field')
        # Only callers' fixed diagnostics belong in error; never log transport exceptions/URLs.
        with self.lock:
            self.events.append({'ms': round((time.monotonic()-self.start)*1000), 'kind': kind, **fields})

    def write(self, file, **summary):
        file = Path(file)
        file.parent.mkdir(parents=True, exist_ok=True)
        payload = {'schema': 1, **summary, 'events': self.events}
        file.write_text(json.dumps(payload, indent=2, allow_nan=False) + '\n')
        file.chmod(0o600)
