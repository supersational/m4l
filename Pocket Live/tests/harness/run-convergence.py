#!/usr/bin/env python3
"""Three protocol clients versus independent Live. Not a real-browser test.

Read-only by default. Local and Cloud use the same cases; pass a private JSON
session file containing {"url": "http(s)://host/s/room#key"}. Never put keys in CLI.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import queue
import sys
import threading
import time
import uuid
from urllib.parse import urlparse
from acceptance import Evidence, differences, project_remote, wait_converged
from live_oracle import LiveOracle


class PrerequisiteError(RuntimeError):
    pass


class Client:
    def __init__(self, name, url, evidence):
        from websockets.sync.client import connect
        parsed = urlparse(url)
        parts = parsed.path.strip('/').split('/')
        if parsed.scheme not in ('http', 'https') or len(parts) != 2 or parts[0] != 's' or not parsed.fragment:
            raise ValueError('Invalid private session URL')
        self.name, self.evidence = name, evidence
        self.state = None
        self.failure = None
        self.pending = {}
        self.lock = threading.Lock()
        self.stopping = False
        origin = parsed.scheme + '://' + parsed.netloc
        endpoint = ('wss' if parsed.scheme == 'https' else 'ws') + '://' + parsed.netloc + '/api/ws/' + parts[1] + '?role=control'
        self.ws = connect(endpoint, origin=origin, open_timeout=4, close_timeout=1, max_size=2**21)
        self.ws.send(json.dumps({'token': parsed.fragment}))
        self.thread = threading.Thread(target=self.receive, daemon=True)
        self.thread.start()
        evidence.add('connect', client=name)

    def receive(self):
        try:
            for raw in self.ws:
                message = json.loads(raw)
                with self.lock:
                    if message.get('type') == 'state':
                        self.state = message['state']
                    elif message.get('type') == 'connection' and not message.get('online'):
                        raise RuntimeError('Host offline')
                    elif message.get('type') == 'result':
                        waiter = self.pending.get(message.get('id'))
                        if waiter:
                            try:
                                waiter.put_nowait(message)
                            except queue.Full:
                                pass  # Duplicate ACK must not kill reception.
        except Exception:
            if not self.stopping:
                self.failure = 'Client connection failed'
        finally:
            if not self.stopping and self.failure is None:
                self.failure = 'Client disconnected'

    def snapshot(self):
        if self.failure:
            raise RuntimeError(self.failure)
        with self.lock:
            return None if self.state is None else json.loads(json.dumps(self.state))

    def call(self, op, **fields):
        state = self.snapshot()
        if state is None:
            raise RuntimeError('No client state')
        ident = str(uuid.uuid4())
        waiter = queue.Queue(maxsize=1)
        with self.lock:
            self.pending[ident] = waiter
        self.evidence.add('command', client=self.name, op=op)
        try:
            self.ws.send(json.dumps(dict(type='command', id=ident, epoch=state['epoch'], op=op, **fields)))
            response = waiter.get(timeout=5)
            if not response.get('ok'):
                raise RuntimeError('Command rejected')
            return response.get('result')
        finally:
            with self.lock:
                self.pending.pop(ident, None)

    def close(self):
        self.stopping = True
        self.ws.close()
        self.thread.join(timeout=2)
        if self.thread.is_alive():
            raise RuntimeError('Receiver failed to stop')
        self.evidence.add('disconnect', client=self.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session-file', type=Path, required=True)
    parser.add_argument('--allow-live-edits', action='store_true', help='Opt in to tempo-only tests in a disposable lab set')
    parser.add_argument('--report', type=Path, default=Path(__file__).resolve().parents[1]/'artifacts'/'convergence.json')
    args = parser.parse_args()
    evidence, clients, oracle, initial = Evidence(), [], None, None
    cases, started, changed = [], False, False
    status, code = 'blocked', 2

    def observe():
        states = {'Live': oracle.read()}
        for client in clients:
            raw = client.snapshot()
            # Empty is a mismatch until first snapshot, never a skipped client.
            states[client.name] = {} if raw is None else project_remote(raw)
        return states

    def case(name, expected=None):
        evidence.add('case-start', case=name)
        try:
            result = wait_converged(observe, expected=expected)
        except Exception:
            cases.append({'id': name, 'status': 'failed'})
            raise
        cases.append({'id': name, 'status': 'passed', 'observations': result['observations']})
        evidence.add('case-end', case=name, status='passed', observations=result['observations'])
        return result['state']

    try:
        session = json.loads(args.session_file.read_text())
        url = session['url']
        if session.get('expires') is not None and session['expires'] < time.time()*1000:
            raise PrerequisiteError('session-expired')
        oracle = LiveOracle()
        initial = oracle.read()
        if args.allow_live_edits:
            names = {t['name'] for t in initial['tracks'] if t['kind'] == 'track'}
            if not {'Lab MIDI', 'Lab Audio'} <= names:
                raise RuntimeError('Disposable Lab MIDI/Lab Audio fixture required')
            if initial['playing'] or initial['record']:
                raise RuntimeError('Stop playback/recording before tempo tests')
        for name in ('A', 'B', 'C'):
            clients.append(Client(name, url, evidence))
        started = True
        case('join-current-native-state')
        clients[0].call('refresh')
        case('refresh-preserves-shared-state')
        old = clients.pop()
        old.close()
        clients.append(Client('C', url, evidence))
        case('rejoin-current-native-state')
        if args.allow_live_edits:
            changed = True  # Even a failed ACK may have applied in Live.
            expected = json.loads(json.dumps(initial))
            expected['tempo'] = 123.75 if abs(initial['tempo']-123.75) > .01 else 127.25
            clients[0].call('song_set', property='tempo', value=expected['tempo'])
            case('write-reaches-native-and-three-clients', expected)
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(client.call, 'song_set', property='tempo', value=value)
                           for client, value in zip(clients, (115.25, 138.5))]
                for future in futures:
                    future.result(timeout=6)
            converged = case('concurrent-tempo-writes-converge')
            if min(abs(converged['tempo']-v) for v in (115.25, 138.5)) > 1e-5:
                raise AssertionError('Concurrent result was neither accepted intent')
            clients[2].call('song_set', property='tempo', value=expected['tempo'])
            case('explicit-final-write-wins', expected)
        status, code = 'passed', 0
    except Exception as error:
        status, code = ('failed', 1) if started else ('blocked', 2)
        # Exception strings may contain private websocket URLs; record type only.
        evidence.add('failure', status=status, error=str(error) if isinstance(error, PrerequisiteError) else type(error).__name__)
        if isinstance(error, TimeoutError):
            print(str(error), file=sys.stderr)  # Comparator only emits field paths.
    finally:
        if changed and clients and oracle:
            try:
                current = oracle.read()
                original_tracks = [(t['kind'], t['name']) for t in initial['tracks']]
                current_tracks = [(t['kind'], t['name']) for t in current['tracks']]
                if original_tracks != current_tracks:
                    raise RuntimeError('Fixture changed; automatic restore refused')
                clients[0].call('song_set', property='tempo', value=initial['tempo'])
                case('restore-original-tempo', initial)
            except Exception as error:
                status, code = 'failed', 1
                evidence.add('restore-failed', error=type(error).__name__)
        for client in clients:
            try:
                client.close()
            except Exception as error:
                status, code = 'failed', 1
                evidence.add('cleanup-failed', error=type(error).__name__)
        if oracle:
            oracle.close()
        evidence.write(args.report, status=status, kind='protocol-clients-vs-native-live', cases=cases,
                       limitations=['No real browser or phone input', 'No clip/parameter detail or external MIDI assertions',
                                    'No network fault injection in this runner', 'Kernel must not be used concurrently by other tools'])
    print(f'{status.upper()}: {len(cases)} cases completed. Report: {args.report}')
    return code


if __name__ == '__main__':
    raise SystemExit(main())
