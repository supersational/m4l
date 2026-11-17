#!/usr/bin/env python3
"""Bounded JSONL native Live stimuli/readback. No caller-supplied Python is executed.

Default permits reads only. --allow-live-edits enables allowlisted mutations on
Lab Audio/Lab MIDI after checking both fixture markers for every request.
devicePath is [device_index, chain_index, device_index, ...], e.g. [0] or [1,0,2].
Each input produces {id, ok, result} or {id, ok:false, error:{code,message}}.
"""
import argparse
import json
import math
import sys
import time
from live_oracle import LiveOracle

TRACKS = ('Lab Audio', 'Lab MIDI')
DEVICES = ('Utility', 'Auto Filter', 'Echo', 'EQ Eight')
DETAILS = '''
def clip_details(c):
    return dict(name=c.name, midi=bool(c.is_midi_clip), playing=bool(c.is_playing),
                recording=bool(c.is_recording), length=float(c.length),
                start=float(c.start_time), end=float(c.end_time),
                loopStart=float(c.loop_start), loopEnd=float(c.loop_end))
def slot_details(slot,index):
    result=dict(index=index,hasClip=bool(slot.has_clip),name=None,playing=False,recording=False,length=None)
    if slot.has_clip:result.update(clip_details(slot.clip))
    return result
def device_details(devices, prefix=(), depth=0):
    result=[]
    for index,d in enumerate(devices[:128]):
        path=prefix+(index,)
        result.append(dict(devicePath=list(path),name=d.name,className=d.class_name))
        if depth<4 and d.can_have_chains:
            for chain_index,chain in enumerate(d.chains[:32]):
                result.extend(device_details(chain.devices,path+(chain_index,),depth+1))
    return result
dict(tracks=[dict(index=i,name=t.name,devices=device_details(t.devices),
      clips=[slot_details(slot,j) for j,slot in enumerate(t.clip_slots)],
      arrangement=[clip_details(c) for c in getattr(t,'arrangement_clips',())])
      for i,t in enumerate(song.tracks)],
     scenes=[dict(index=i,name=s.name) for i,s in enumerate(song.scenes)],sceneCount=len(song.scenes))
'''

GUARD = """
if any(len([t for t in song.tracks if t.name==name])!=1 for name in ('Lab Audio','Lab MIDI')):
    raise ValueError('Dedicated fixture markers are missing or ambiguous')
"""


def number(value, low, high):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Numeric value is invalid or outside the supported range')
    return value


def boolean(value):
    if type(value) is not bool:
        raise ValueError('Expected a JSON boolean')
    return value


def target(request, device=False):
    track = request.get('track')
    if track not in TRACKS:
        raise ValueError('Track must be Lab Audio or Lab MIDI')
    code = GUARD + f"\nt=next(t for t in song.tracks if t.name=={track!r})\n"
    if device:
        path = request.get('devicePath')
        if not isinstance(path, list) or not 1 <= len(path) <= 9 or len(path) % 2 != 1 or any(type(i) is not int or not 0 <= i < 256 for i in path):
            raise ValueError('devicePath must be an odd array of bounded device/chain indices')
        code += f'd=t.devices[{path[0]}]\n'
        for chain, index in zip(path[1::2], path[2::2]):
            code += f'd=d.chains[{chain}].devices[{index}]\n'
    return code


PARAMETERS = """[dict(index=i,name=p.name,value=float(p.value),min=float(p.min),max=float(p.max),
    quantized=bool(p.is_quantized),enabled=bool(p.is_enabled),display=str(p))
    for i,p in enumerate(d.parameters)]"""


def execute(oracle, request, allow_edits):
    operation = request.get('op')
    if operation == 'snapshot':
        return oracle.read()
    if operation == 'detail_snapshot':
        return {'state': oracle.read(), **oracle.kernel.exec(GUARD + DETAILS, depth=20),
                'limits': {'devicesPerChain': 128, 'chainsPerDevice': 32, 'nestedChainDepth': 4, 'parametersPerDevice': 1024}}
    if operation == 'parameters':
        return oracle.kernel.exec(target(request, True) + PARAMETERS, depth=6)
    if operation not in ('parameter', 'tempo', 'mixer', 'transport', 'device_insert'):
        raise ValueError('Unsupported operation')
    if not allow_edits:
        raise PermissionError('Mutations require --allow-live-edits')
    if operation == 'parameter':
        code = target(request, True)
        parameter = request.get('parameter')
        if type(parameter) is int and 0 <= parameter < 1024:
            code += f'p=d.parameters[{parameter}]\n'
        elif isinstance(parameter, str) and 1 <= len(parameter) <= 128:
            code += f"matches=[p for p in d.parameters if p.name=={parameter!r}]\nif len(matches)!=1:raise ValueError('Parameter name missing or ambiguous')\np=matches[0]\n"
        else:
            raise ValueError('Parameter must be an index or exact name')
        value = number(request.get('value'), -1e12, 1e12)
        code += f"value={value!r}\nif not p.is_enabled or not p.min<=value<=p.max:raise ValueError('Parameter disabled or value outside native range')\np.value=value\ndict(value=float(p.value),display=str(p))"
        return oracle.kernel.exec(code, depth=4)
    if operation == 'tempo':
        value = number(request.get('value'), 20, 999)
        return oracle.kernel.exec(GUARD + f'\nsong.tempo={value!r}\nfloat(song.tempo)')
    if operation == 'mixer':
        code = target(request)
        prop = request.get('property')
        if prop in ('mute', 'solo', 'arm'):
            value = boolean(request.get('value'))
            code += f't.{prop}={value!r}\nbool(t.{prop})'
        elif prop in ('volume', 'pan', 'send'):
            value = number(request.get('value'), -1, 1)
            parameter = {'volume': 'volume', 'pan': 'panning'}.get(prop)
            if prop == 'send':
                index = request.get('send')
                if type(index) is not int or not 0 <= index < 32:
                    raise ValueError('Send index must be an integer from 0 to 31')
                parameter = f'sends[{index}]'
            code += f"p=t.mixer_device.{parameter}\nvalue={value!r}\nif not p.min<=value<=p.max:raise ValueError('Mixer value outside native range')\np.value=value\nfloat(p.value)"
        else:
            raise ValueError('Unsupported mixer property')
        return oracle.kernel.exec(code)
    if operation == 'transport':
        prop = request.get('property')
        value = boolean(request.get('value'))
        if prop == 'playing':
            code = 'song.start_playing()' if value else 'song.stop_playing()'
            return oracle.kernel.exec(GUARD + '\n' + code + '\nbool(song.is_playing)')
        if prop not in ('record', 'metronome', 'loop'):
            raise ValueError('Unsupported transport property')
        attribute = 'record_mode' if prop == 'record' else prop
        return oracle.kernel.exec(GUARD + f'\nsong.{attribute}={value!r}\nbool(song.{attribute})')
    # Browser loading is scheduled on Live's main loop and confirmed by readback.
    name = request.get('name')
    if name not in DEVICES:
        raise ValueError('Device name is not in the native fixture allowlist')
    code = target(request)
    existing = oracle.kernel.exec(code + f"[i for i,d in enumerate(t.devices) if d.class_name=={dict(zip(DEVICES, ('StereoGain','AutoFilter','Echo','Eq8')))[name]!r} or d.name=={name!r}]", depth=3)
    if existing:
        return {'devicePath': [existing[0]], 'inserted': False}
    before = oracle.kernel.exec(code + 'len(t.devices)')
    load = code + f"""
queue=[(application.browser.audio_effects,0)]
item=None
visited=0
while queue and visited<1200:
    node,depth=queue.pop(0)
    visited+=1
    if node.name=={name!r} and node.is_loadable:
        item=node
        break
    if depth<5:queue.extend((child,depth+1) for child in node.children)
if item is None:raise ValueError('Native device browser item was not found')
def load_fixture_device(target=t,browser_item=item):
    song.view.selected_track=target
    if target.devices:song.view.select_device(target.devices[-1])
    application.browser.load_item(browser_item)
kernel.schedule_message(1,load_fixture_device)
True
"""
    oracle.kernel.exec(load)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        count = oracle.kernel.exec(code + 'len(t.devices)')
        if count > before:
            return {'devicePath': [before], 'inserted': True}
        time.sleep(.1)
    raise TimeoutError('Device insertion not confirmed before deadline')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-live-edits', action='store_true')
    parser.add_argument('--timeout', type=float, default=5)
    args = parser.parse_args()
    if not 0 < args.timeout <= 30:
        parser.error('--timeout must be greater than zero and at most 30 seconds')
    oracle = None
    try:
        oracle = LiveOracle(timeout=args.timeout)
        while True:
            line = sys.stdin.buffer.readline(65537)
            if not line:
                break
            request_id = None
            try:
                if len(line) > 65536:
                    # Exit rather than interpreting the remaining bytes as another request.
                    raise ValueError('Request exceeds 64 KiB')
                request = json.loads(line)
                if not isinstance(request, dict):
                    raise ValueError('Expected a JSON object')
                request_id = request.get('id')
                if type(request_id) not in (str, int, type(None)) or isinstance(request_id, str) and len(request_id) > 128:
                    request_id = None
                    raise ValueError('Request ID must be a short string or integer')
                result = execute(oracle, request, args.allow_live_edits)
                response = {'id': request_id, 'ok': True, 'result': result}
            except Exception as error:
                # Kernel errors may contain submitted source or local paths. Never relay them.
                local = type(error) in (ValueError, PermissionError)
                response = {'id': request_id, 'ok': False, 'error': {'code': 'INVALID_REQUEST' if type(error) is ValueError else 'READ_ONLY' if type(error) is PermissionError else 'NATIVE_FAILURE', 'message': str(error) if local else 'Native operation failed or timed out; inspect the dedicated Live fixture'}}
            print(json.dumps(response, allow_nan=False), flush=True)
            if len(line) > 65536:
                return 2
    except Exception:
        print(json.dumps({'id': None, 'ok': False, 'error': {'code': 'UNAVAILABLE', 'message': 'Native driver unavailable or another Kernel runner holds the lock'}}), flush=True)
        return 1
    finally:
        if oracle:
            oracle.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
