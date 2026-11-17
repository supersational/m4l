"""Readback assertions over the deployed relay and real Max LiveAPI."""
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
r=Remote();report={};track=None;slot=None;ret=None;original=r.state
try:
 before={t['id'] for t in r.state['tracks']};r.call('track_create',kind='midi');r.sync();track=next(t for t in r.state['tracks'] if t['id'] not in before);tid=track['id'];r.call('track_set',target=tid,property='name',value='Remote extended test');r.sync()
 def current():return next(t for t in r.state['tracks'] if t['id']==tid)
 slot=current()['clips'][0]['id'];r.call('clip_create',target=slot,length=4);r.sync();cid=current()['clips'][0]['clipId']
 for pitch,start in [(60,.09),(64,1),(67,2)]:r.call('clip_note_add',target=cid,pitch=pitch,start=start,duration=.5,velocity=90)
 notes=r.call('clip_notes_get',target=cid)['notes'];assert [n['pitch'] for n in notes]==[60,64,67],notes;report['midi_notes_add_read']=True
 r.call('clip_quantize',target=cid,grid=5,amount=1);notes=r.call('clip_notes_get',target=cid)['notes'];assert notes[0]['start_time']==0,notes;report['quantize_1_16']=True
 r.call('clip_note_delete',target=cid,noteId=notes[0]['note_id']);assert len(r.call('clip_notes_get',target=cid)['notes'])==2;report['midi_note_delete']=True
 r.call('clip_duplicate',target=tid,index=0);r.sync();assert current()['clips'][1]['clipId'];report['duplicate_session_clip']=True
 r.call('clip_to_arrangement',target=tid,clip=cid,position=8);r.sync();assert len(current()['arrangement'])==1 and current()['arrangement'][0]['start']==8
 r.call('arrangement_delete',target=current()['arrangement'][0]['id']);r.sync();assert not current()['arrangement'];report['copy_to_arrangement_delete']=True
 r.call('arrangement_create',target=tid,position=16,length=8);r.sync();assert current()['arrangement'][0]['end']==24;report['create_arrangement_clip']=True
 routes=r.call('routing_get',target=tid);choice=next(x for x in routes['inputs']['available_input_routing_types'] if x['display_name']=='No Input');r.call('routing_set',target=tid,property='input_routing_type',value=choice);assert r.call('routing_get',target=tid)['input']['input_routing_type']['display_name']=='No Input';report['routing_set_readback']=True
 device=r.call('device_insert',target=tid,name='Drift');r.sync();assert any(d['name']=='Drift' for d in current()['devices']);r.call('device_select',target=device);r.sync();params=r.state['device']['parameters'];assert len(params)>10;report['native_synth_insert_parameters']=len(params)
 param=next(p for p in params if p['enabled'] and not p['quantized'] and p['max']>p['min']);v=(param['min']+param['max'])/2;r.call('parameter',target=param['id'],value=v);r.sync();got=next(p for p in r.state['device']['parameters'] if p['id']==param['id']);assert abs(got['value']-v)<.001;r.call('parameter',target=param['id'],value=param['value']);report['device_parameter_write_read']=True
 r.call('song_set',property='clip_trigger_quantization',value=0);r.call('clip_fire',target=slot);r.sync();assert current()['clips'][0]['playing'];until=time.time()+3;peak=0
 while time.time()<until:
  m=r.recv()
  if m['type']=='meters':
   vals=[t for t in m['meters']['tracks'] if t['id']==tid];peak=max(peak,*[max(t['level'],t['left'],t['right']) for t in vals])
 assert peak>.01,peak;report['playable_synth_audio_meter_peak']=peak
 r.call('clip_stop',target=slot);r.call('device_delete',target=device);r.sync();assert not current()['devices'];report['native_device_delete']=True
 before={t['id'] for t in r.state['tracks']};r.call('track_create',kind='return');r.sync();ret=next(t for t in r.state['tracks'] if t['id'] not in before);report['return_create']=ret['kind']=='return'
 sends=current()['sends'];assert sends;r.call('parameter',target=sends[-1]['id'],value=.4);r.sync();assert abs(current()['sends'][-1]['value']-.4)<.001;report['send_write_read']=True
 r.call('track_delete',target=ret['id']);r.sync();assert all(t['id']!=ret['id'] for t in r.state['tracks']);report['return_delete']=True;ret=None
 print(json.dumps(report,indent=2))
finally:
 if ret:
  try:r.call('track_delete',target=ret['id'])
  except Exception:pass
 if track:
  try:r.call('track_delete',target=track['id'])
  except Exception as e:print('cleanup',e)
 for prop,value in [('clip_trigger_quantization',original['quantization']),('tempo',original['tempo']),('record_mode',False)]:
  try:r.call('song_set',property=prop,value=value)
  except Exception:pass
 r.call('stop');r.close();(ARTIFACTS/'verification_extended.json').write_text(json.dumps(report,indent=2))
