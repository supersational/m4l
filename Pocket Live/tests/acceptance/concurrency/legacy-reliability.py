"""Regression checks for shared controllers, enums and scene-page boundaries."""
import os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
ARTIFACTS=ROOT/'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
if os.environ.get('POCKET_LIVE_ALLOW_TEST_EDITS')!='1':raise SystemExit('Use npm run test:live -- --allow-live-edits; this check may edit Live.')
import json
from pathlib import Path
from client import Remote
r=Remote();other=Remote();report={};created=[];scene=None;original=r.state
try:
 for i in range(2):
  before={t['id'] for t in r.state['tracks']};r.call('track_create',kind='midi');r.sync();t=next(t for t in r.state['tracks'] if t['id'] not in before);created.append(t['id']);d=r.call('device_insert',target=t['id'],name='Drift');r.sync();created[-1]={'track':t['id'],'device':d}
 a=r.call('device_get',target=created[0]['device']);other.sync();b=other.call('device_get',target=created[1]['device']);assert a['id']!=b['id']
 # A subsequent structural refresh must not invalidate another controller's parameters.
 other.call('device_select',target=b['id']);other.sync();r.sync()
 for client,device in [(r,a),(other,b)]:
  p=next(p for p in device['parameters'] if p['enabled'] and not p['quantized']);v=(p['min']+p['max'])/2;client.call('parameter',target=p['id'],value=v);client.sync();detail=client.call('device_get',target=device['id']);assert abs(next(x for x in detail['parameters'] if x['id']==p['id'])['value']-v)<.001
 report['two_controller_independent_parameters']=True
 enums=[p for p in a['parameters'] if p['quantized']];assert enums and all(p['defaultValue'] is None for p in enums);assert any(p['items'] for p in enums)
 for p in enums:
  if p['items']:assert len(p['items'])==p['max']-p['min']+1,(p['name'],p['items'])
 report['quantized_choices_without_invalid_resets']=[{'name':p['name'],'choices':p['items']} for p in enums[:4]]
 r.call('song_set',property='signature_numerator',value=6);r.call('song_set',property='signature_denominator',value=8);assert r.sync()['signature']==[6,8];report['time_signature_6_8']=True
 count=r.state['sceneCount'];assert count==8,'Run in the eight-scene lab set';r.call('scene_create');r.sync();r.call('scene_window',offset=8);r.sync();scene=r.state['scenes'][-1]['id'];assert r.state['sceneOffset']==8 and len(r.state['scenes'])==1
 r.call('scene_delete',target=scene);scene=None;assert r.sync()['sceneOffset']==0 and len(r.state['scenes'])==8;report['delete_last_page_returns_to_full_page']=True
 print(json.dumps(report,indent=2))
finally:
 for t in reversed(created):
  try:r.call('track_delete',target=t['track'] if isinstance(t,dict) else t)
  except Exception as e:print('cleanup',e)
 if scene:
  try:r.call('scene_delete',target=scene)
  except Exception:pass
 for prop,value in [('signature_numerator',original['signature'][0]),('signature_denominator',original['signature'][1])]:r.call('song_set',property=prop,value=value)
 r.call('scene_window',offset=0);r.call('stop');r.close();other.close();(ARTIFACTS/'verification_reliability.json').write_text(json.dumps(report,indent=2))
