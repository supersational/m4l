"""Exercise the acceptance client's real receiving thread with a controlled socket."""
import importlib.util
import json
from pathlib import Path
import queue
import sys
import time
import types
import unittest
from unittest.mock import patch

HARNESS = Path(__file__).resolve().parents[2]/'harness'
sys.path.insert(0, str(HARNESS))
spec = importlib.util.spec_from_file_location('convergence_runner', HARNESS/'run-convergence.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class Socket:
    def __init__(self):
        self.incoming = queue.Queue()
        self.sent = []
        self.closed = False

    def __iter__(self): return self

    def __next__(self):
        packet = self.incoming.get()
        if packet is None:
            raise StopIteration
        return json.dumps(packet)

    def send(self, raw):
        packet = json.loads(raw)
        self.sent.append(packet)
        if 'token' in packet:
            self.incoming.put({'type': 'state', 'state': {'epoch': 'fixture', 'value': 0}})
        else:
            # Deliberately duplicate ACKs. A full waiter must not kill the reader.
            reply = {'type': 'result', 'id': packet['id'], 'ok': True, 'result': .7}
            self.incoming.put(reply)
            self.incoming.put(reply)
            self.incoming.put({'type': 'state', 'state': {'epoch': 'fixture', 'value': .7}})

    def close(self):
        self.closed = True
        self.incoming.put(None)


class ProtocolClient(unittest.TestCase):
    def wait(self, predicate):
        deadline = time.monotonic()+1
        while not predicate():
            if time.monotonic() >= deadline:
                self.fail('Receiver deadline exceeded')
            time.sleep(.001)

    def test_auth_origin_ack_and_cleanup_both_transports(self):
        for scheme in ('http', 'https'):
            socket, calls = Socket(), []
            module = types.ModuleType('websockets.sync.client')
            def connect(url, **kwargs):
                calls.append((url, kwargs))
                return socket
            module.connect = connect
            with patch.dict(sys.modules, {'websockets.sync.client': module}):
                evidence = runner.Evidence()
                client = runner.Client('A', scheme+'://example.test:1234/s/fixture#private', evidence)
                try:
                    self.wait(lambda: client.snapshot() is not None)
                    copied = client.snapshot()
                    copied['value'] = 99
                    self.assertEqual(client.snapshot()['value'], 0, 'snapshot must be independent')
                    self.assertEqual(client.call('parameter', target=10, value=.7), .7)
                    self.wait(lambda: client.snapshot()['value'] == .7)
                    self.assertIsNone(client.failure, 'duplicate ACK must not kill receiving')
                    self.assertEqual(client.pending, {})
                    self.assertEqual(socket.sent[0], {'token': 'private'})
                    self.assertEqual(calls[0][1]['origin'], scheme+'://example.test:1234')
                    self.assertTrue(calls[0][0].startswith('wss:' if scheme=='https' else 'ws:'))
                    self.assertNotIn('private', json.dumps(evidence.events))
                finally:
                    client.close()
                self.assertTrue(socket.closed)
                self.assertFalse(client.thread.is_alive())

    def test_invalid_link_refused_before_connect(self):
        module = types.ModuleType('websockets.sync.client')
        module.connect = lambda *a, **k: self.fail('Invalid URL opened a socket')
        with patch.dict(sys.modules, {'websockets.sync.client': module}):
            for url in ('http://example.test/s/fixture', 'ftp://example.test/s/fixture#key', 'http://example.test/other/fixture#key'):
                with self.assertRaises(ValueError):
                    runner.Client('A', url, runner.Evidence())


if __name__ == '__main__': unittest.main()
