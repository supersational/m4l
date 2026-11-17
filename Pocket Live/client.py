"""Test client for the real Cloudflare → Max → Live path."""
import json,time,uuid
from pathlib import Path
from urllib.parse import urlparse
from websockets.sync.client import connect
ROOT=Path(__file__).resolve().parent
class Remote:
 def __init__(self):
  session=json.loads((ROOT/'session.json').read_text());u=urlparse(session['url']);self.ws=connect('wss://'+u.netloc+'/api/ws/'+session['room']+'?role=control',max_size=2**20);self.ws.send(json.dumps({'token':u.fragment}));self.state=None;self.meters=[];self.scene_offset=0;self.page=None;self.wait_state()
 def recv(self,timeout=10):
  m=json.loads(self.ws.recv(timeout=timeout))
  if m['type']=='state':
   self.state=m['state'];self.apply_page()
  if m['type']=='meters':self.meters.append(m['meters'])
  return m
 def wait_state(self):
  while True:
   m=self.recv()
   if m['type']=='state' and m['state'].get('epoch')!='0':return self.state
 def call(self,op,**args):
  id=str(uuid.uuid4());self.ws.send(json.dumps(dict(type='command',id=id,op=op,epoch=self.state['epoch'],**args)))
  while True:
   m=self.recv()
   if m.get('id')==id:
    if not m.get('ok'):raise RuntimeError(m.get('error'))
    result=m.get('result')
    if op=='scene_window' and isinstance(result,dict):
     self.page=result;self.scene_offset=result['offset'];self.apply_page()
    return result
 def apply_page(self):
  self.scene_offset=min(self.scene_offset,max(0,(self.state['sceneCount']-1)//8*8))
  if not self.scene_offset:self.page=None;return
  if self.page and self.page['epoch']==self.state['epoch']:
   self.state['sceneOffset']=self.page['offset'];self.state['scenes']=self.page['scenes']
   clips={t['id']:t['clips'] for t in self.page['tracks']}
   for track in self.state['tracks']:track['clips']=clips.get(track['id'],[])
 def sync(self):
  self.call('refresh');self.wait_state()
  if self.scene_offset:self.call('scene_window',offset=self.scene_offset)
  return self.state
 def track(self,name):return next(t for t in self.state['tracks'] if t['name']==name)
 def close(self):self.ws.close()
