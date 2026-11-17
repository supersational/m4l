#!/usr/bin/env python3
"""Capture live device inventories, scaffold browser profiles and audit bindings."""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text())


def write(path, text):
    path = Path(path)
    if path.exists():
        raise ValueError(f'Refusing to overwrite {path}; choose a new output path')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def spec_for(inventory, name):
    return dict(id=name, className=inventory['className'], bindings=[
        {k: p[k] for k in ('name', 'min', 'max', 'quantized', 'items')}
        for p in inventory['parameters']], nativeOnly=[])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    capture = sub.add_parser('capture', help='Read a device in the current Pocket Live session')
    capture.add_argument('--class-name', required=True)
    capture.add_argument('--id', type=int)
    capture.add_argument('--output', required=True)
    scaffold = sub.add_parser('scaffold', help='Generate a strict profile and editable JS layout')
    scaffold.add_argument('--inventory', required=True)
    scaffold.add_argument('--name', required=True, help='Unique lower-case profile ID')
    scaffold.add_argument('--output-dir', required=True)
    audit = sub.add_parser('audit', help='Check bindings and report native-only/unmapped controls')
    audit.add_argument('--inventory', required=True)
    audit.add_argument('--profile', required=True)
    args = parser.parse_args()
    if args.command == 'capture':
        sys.path.insert(0, str(ROOT))
        from client import Remote
        client = Remote()
        try:
            devices = []
            def walk(items):
                for device in items:
                    if device['className'] == args.class_name and (args.id is None or args.id == device['id']):
                        devices.append(device)
                    for chain in device.get('chains', []):
                        walk(chain['devices'])
            for track in client.state['tracks']:
                walk(track['devices'])
            if len(devices) != 1:
                raise ValueError(f'Expected one device, found {len(devices)}; use --id to disambiguate')
            device = devices[0]
            inventory = client.call('device_get', target=device['id'])
            inventory['className'] = device['className']
            write(args.output, json.dumps(inventory, indent=2) + '\n')
            print(f"Captured {len(inventory['parameters'])} parameters for {device['className']}")
        finally:
            client.close()
    elif args.command == 'scaffold':
        if not re.fullmatch('[a-z][a-z0-9-]*', args.name):
            raise ValueError('Use a lower-case profile ID, e.g. auto-filter')
        inventory = read(args.inventory)
        spec = spec_for(inventory, args.name)
        folder = Path(args.output_dir)
        paths = [folder / (args.name + suffix) for suffix in ('.json', '.js')]
        if any(p.exists() for p in paths):
            raise ValueError('Output already exists; choose a new directory')
        javascript = '''// Generated starter. Review grouping and native-only controls before shipping.
DeviceUI.register({
 spec: SPEC,
 matches(d,kind){return DeviceUI.audit(this.spec,d,kind).length===0;},
 render(d){const c=DeviceUI.controls(d),name=DeviceUI.esc(d.name);
 const controls=this.spec.bindings.map(b=>{const p=c.by(b.name);return p.quantized&&p.items.length===p.max-p.min+1?(JSON.stringify(p.items)===JSON.stringify(['Off','On'])?c.toggle(b.name,DeviceUI.esc(b.name)):c.select(b.name)):c.knob(b.name,b.name);}).join('');
 return `<section class="utility-face" data-device-face><div class="ut-title"><strong>${name}</strong></div><div class="ut-columns">${controls}</div></section><button class="ut-all" data-op="device_parameter_view">All parameters</button>`;
 }
});
'''.replace('SPEC', json.dumps(spec, separators=(',', ':')))
        write(paths[0], json.dumps(spec, indent=2) + '\n')
        write(paths[1], javascript)
        print('Created ' + ', '.join(str(p) for p in paths))
    else:
        inventory, profile = read(args.inventory), read(args.profile)
        errors = []
        if profile['className'] != inventory['className']:
            errors.append('Device class differs')
        by_name = {}
        for parameter in inventory['parameters']:
            by_name.setdefault(parameter['name'], []).append(parameter)
        for binding in profile['bindings']:
            matches = by_name.get(binding['name'], [])
            if len(matches) != 1:
                errors.append(binding['name'] + ': missing or ambiguous')
            elif any(binding.get(k) != matches[0].get(k) for k in ('min', 'max', 'quantized', 'items')):
                errors.append(binding['name'] + ': range/type/choices changed')
        bound = {b['name'] for b in profile['bindings']}
        report = dict(errors=errors, unmapped_parameters=sorted(set(by_name)-bound),
                      native_only_controls=profile.get('nativeOnly', []),
                      note='Parameter coverage does not prove native UI coverage; compare the actual device.')
        print(json.dumps(report, indent=2))
        return bool(errors or report['unmapped_parameters'])
    return False


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError) as exc:
        sys.exit(str(exc))
