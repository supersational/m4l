import os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
ARTIFACTS=ROOT/'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
if os.environ.get('POCKET_LIVE_ALLOW_TEST_EDITS')!='1':raise SystemExit('Use npm run test:live -- --allow-live-edits; this check may edit Live.')
import json,time
from pathlib import Path
from client import Remote
HERE=ROOT
r=Remote();report={};original=r.state
try:
 midi=r.track('Lab MIDI');mid=midi['id'];slot=midi['clips'][0]['id'];tempo=r.state['tempo']
 r.call('song_set',property='tempo',value=126);assert r.sync()['tempo']==126
 r.call('play');assert r.sync()['playing'];r.call('stop');assert not r.sync()['playing'];report['transport']=True
 for property in ['mute','solo','arm']:
  r.call('track_set',target=mid,property=property,value=True);assert r.sync() and r.track('Lab MIDI')[property]
  r.call('track_set',target=mid,property=property,value=False)
 report['mute_solo_arm']=True
 vol=midi['volume'];r.call('parameter',target=vol['id'],value=.6);r.sync();assert abs(r.track('Lab MIDI')['volume']['value']-.6)<.001;r.call('parameter',target=vol['id'],value=vol['value']);report['volume']=True
 r.call('track_set',target=mid,property='current_monitoring_state',value=0);r.sync();assert r.track('Lab MIDI')['monitor']==0;r.call('track_set',target=mid,property='current_monitoring_state',value=1);report['monitor']=True
 r.call('clip_create',target=slot,length=4);r.sync();clip=r.track('Lab MIDI')['clips'][0];assert clip['clipId'] and clip['length']==4
 r.call('clip_set',target=clip['clipId'],property='name',value='Remote E2E');r.sync();assert r.track('Lab MIDI')['clips'][0]['name']=='Remote E2E'
 r.call('clip_fire',target=slot);r.sync();assert r.track('Lab MIDI')['clips'][0]['playing'];r.call('clip_stop',target=slot)
 r.call('clip_double',target=clip['clipId']);r.sync();assert r.track('Lab MIDI')['clips'][0]['length']==8
 r.call('clip_delete',target=slot);r.sync();assert not r.track('Lab MIDI')['clips'][0]['clipId'];report['clip_create_launch_rename_double_delete']=True
 # Record a real Session clip on the armed MIDI track, then stop and remove it.
 r.call('song_set',property='clip_trigger_quantization',value=0);r.call('track_set',target=mid,property='arm',value=True);r.call('clip_fire',target=slot);r.sync();recorded=r.track('Lab MIDI')['clips'][0];assert recorded['recording'],recorded
 r.call('clip_stop',target=slot);r.call('track_set',target=mid,property='arm',value=False);r.call('clip_delete',target=slot);report['session_recording']=True
 for kind in ['midi','audio']:
  before={t['id'] for t in r.state['tracks']};r.call('track_create',kind=kind);r.sync();created=next(t for t in r.state['tracks'] if t['id'] not in before)
  r.call('track_set',target=created['id'],property='name',value='Remote test '+kind);r.sync();assert r.track('Remote test '+kind)
  r.call('track_delete',target=created['id']);r.sync();report['create_delete_'+kind]=True
 before=r.state['sceneCount'];r.call('scene_create');r.sync();assert r.state['sceneCount']==before+1;r.call('scene_window',offset=before);r.sync();scene=r.state['scenes'][-1];r.call('scene_fire',target=scene['id']);r.call('scene_delete',target=scene['id']);r.call('scene_window',offset=0);r.sync();report['scene_create_launch_delete']=True
 route=r.call('routing_get',target=mid);report['routing_choices']=route
 report['meter_messages']=len(r.meters);assert r.meters
 print(json.dumps(report,indent=2))
finally:
 for prop,value in [('tempo',original['tempo']),('clip_trigger_quantization',original['quantization']),('record_mode',False),('loop',original['loop'])]:
  try:r.call('song_set',property=prop,value=value)
  except Exception:pass
 try:r.call('stop');r.sync();report['final_tracks']=[t['name'] for t in r.state['tracks']]
 except Exception:pass
 (ARTIFACTS/'verification.json').write_text(json.dumps(report,indent=2));r.close()
