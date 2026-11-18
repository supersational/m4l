"""Test the deployed relay in an isolated room, without touching a Live set."""
import os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
ARTIFACTS=ROOT/'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
import json
import subprocess
from pathlib import Path
from uuid import uuid4
from websockets.exceptions import ConnectionClosedError
from websockets.sync.client import connect

HERE = ROOT
base = json.loads((HERE / 'config.json').read_text())['worker']

def receive(ws, kind, **fields):
    for _ in range(30):
        message = json.loads(ws.recv(timeout=5))
        if message.get('type') == kind and all(message.get(k) == v for k, v in fields.items()):
            return message
    raise AssertionError(f'Missing {kind} {fields}')


def main():
    session = json.loads(subprocess.check_output(['curl', '--fail', '--silent',
        '--show-error', '--max-time', '15', '-X', 'POST', base + '/api/session']))
    endpoint = base.replace('https:', 'wss:') + '/api/ws/' + session['room']
    clients = []
    report = {}
    try:
        host = connect(endpoint + '?role=host', close_timeout=1)
        clients.append(host)
        host.send(json.dumps({'token': session['hostToken']}))
        receive(host, 'welcome', controllers=0)
        receive(host, 'presence', controllers=0)
        report['initial_zero'] = True
        phones = []
        for count in (1, 2):
            phone = connect(endpoint + '?role=control', close_timeout=1)
            clients.append(phone)
            phones.append(phone)
            phone.send(json.dumps({'token': session['controlToken']}))
            receive(phone, 'welcome', controllers=count)
            receive(host, 'presence', controllers=count)
        report['one_and_two_authenticated_controllers'] = True
        rejected = connect(endpoint + '?role=control', close_timeout=1)
        clients.append(rejected)
        rejected.send(json.dumps({'token': 'incorrect-test-key'}))
        try:
            rejected.recv(timeout=5)
            raise AssertionError('Invalid authentication accepted')
        except Exception as exc:
            assert getattr(getattr(exc, 'rcvd', None), 'code', None) == 1008, type(exc).__name__
        phones.pop().close()
        receive(host, 'presence', controllers=1)
        report['invalid_auth_not_counted'] = True
        report['close_decrements'] = True
        new_host = connect(endpoint + '?role=host', close_timeout=1)
        clients.append(new_host)
        new_host.send(json.dumps({'token': session['hostToken']}))
        receive(new_host, 'welcome', controllers=1)
        receive(new_host, 'presence', controllers=1)
        report['host_reconnect_reads_existing_count'] = True
        phones.pop().close()
        receive(new_host, 'presence', controllers=0)
        report['last_disconnect_returns_zero'] = True
        # An unknown room behaves like a room deleted after expiration. A
        # rejected HTTP upgrade would hide the reason from a browser.
        expired = base.replace('https:', 'wss:') + f'/api/ws/{uuid4()}?role=control'
        with connect(expired, close_timeout=1) as controller:
            try:
                controller.recv(timeout=5)
                raise AssertionError('Expired room sent data to the controller')
            except ConnectionClosedError as exc:
                assert exc.rcvd is not None and exc.rcvd.code == 1008
        report['expired_link_returns_browser_close_code'] = True
        report['passed'] = True
    finally:
        for client in reversed(clients):
            client.close()
    (ARTIFACTS / 'verification_presence.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
