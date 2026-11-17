"""Exercise deployed relay with large snapshots in an isolated synthetic room.
No commands or synthetic state are sent to the user's real Live session.
"""
import os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
ARTIFACTS=ROOT/'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
if os.environ.get('POCKET_LIVE_ALLOW_TEST_EDITS')!='1':raise SystemExit('Use npm run test:live -- --allow-live-edits; this check may edit Live.')
import copy,json,subprocess
from pathlib import Path
from websockets.sync.client import connect
from client import Remote
base=json.loads(Path('config.json').read_text())['worker'];r=Remote();model=r.state;r.close();report={};h=None;c=None
try:
 s=json.loads(subprocess.check_output(['curl','--fail','--silent','--show-error','--max-time','15','-X','POST',base+'/api/session']))
 url=base.replace('https:','wss:')+'/api/ws/'+s['room'];h=connect(url+'?role=host',max_size=2**22,close_timeout=1);h.send(json.dumps({'token':s['hostToken']}));assert json.loads(h.recv(timeout=5))['type']=='welcome'
 c=connect(url+'?role=control',max_size=2**22,close_timeout=1);c.send(json.dumps({'token':s['controlToken']}));assert json.loads(c.recv(timeout=5))['type']=='welcome'
 source=next(t for t in model['tracks'] if t['kind']=='track')
 for count in [16,64,128]:
  state=copy.deepcopy(model);state['tracks']=[]
  for i in range(count):
   t=copy.deepcopy(source);t['id']=1000+i;t['name']='Scale test '+str(i);t['index']=i;state['tracks'].append(t)
  packet=json.dumps({'type':'state','state':state});h.send(packet)
  m=json.loads(c.recv(timeout=5));assert m['type']=='state',(count,m)
  assert len(m['state']['tracks'])==count;report[str(count)]={'bytes':len(packet.encode()),'received':True};print('Passed',count,'tracks,',len(packet.encode()),'bytes',flush=True)
 report['passed']=True;print(json.dumps(report,indent=2))
finally:
 if c:c.close()
 if h:h.close()
 (ARTIFACTS/'verification_relay_scale.json').write_text(json.dumps(report,indent=2))
