// Real loopback HTTP + WebSocket I/O; no Max, browser, LAN exposure or cloud.
const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {WebSocket}=require('ws'),{LocalTransport}=require(ROOT+'/maxnode/local-transport.cjs');
const clients=[],commands=[];let local,dir,refreshes=0;
const wait=async predicate=>{const until=Date.now()+2500;while(!predicate()){if(Date.now()>until)throw Error('Local transport event timed out');await new Promise(r=>setTimeout(r,5));}};
function open(origin,token,authRaw){return new Promise((resolve,reject)=>{const ws=new WebSocket(origin.replace('http:','ws:')+'/api/ws/'+local.room+'?role=control',{origin});clients.push(ws);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));ws.on('error',reject);ws.once('open',()=>{ws.send(authRaw===undefined?JSON.stringify({token}):authRaw);resolve(ws)});});}
function get(port,headers={}){return new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port,path:'/',headers},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject));}
(async()=>{
 try{
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-local-tests-'));await fs.writeFile(path.join(dir,'index.html'),'network fixture');
  local=new LocalTransport({webRoot:dir,command:m=>commands.push(m),refresh:()=>refreshes++,changed(){}});await local.start('mac',0);const port=local.port,origin='http://127.0.0.1:'+port;
  const foreign=new WebSocket(origin.replace('http:','ws:')+'/api/ws/'+local.room+'?role=control',{origin:'https://untrusted.example'});clients.push(foreign);let rejectedOrigin=false;foreign.on('error',()=>{rejectedOrigin=true;});await wait(()=>foreign.readyState===WebSocket.CLOSED);assert(rejectedOrigin,'cross-origin upgrades must be rejected');assert.equal(local.count,0);
  assert.equal((await get(port)).body,'network fixture');assert.equal((await get(port,{host:'untrusted.example:'+port})).status,403);
  await local.start('mac',0);assert.equal(local.port,port,'Auto port must retain a working URL');local.publish({type:'state',state:{epoch:'test',value:.1}});
  const unauthNull=await open(origin,undefined,'null');await wait(()=>unauthNull.readyState===WebSocket.CLOSED);assert.equal(unauthNull._closeCode,1003);
  const bad=await open(origin,'wrong-key');await wait(()=>bad.readyState===WebSocket.CLOSED);assert.equal(local.count,0);
  for(const raw of ['null','[]','42','"text"']){
   const malformed=await open(origin,local.token);await wait(()=>malformed.messages.some(m=>m.type==='welcome'));malformed.send(raw);await wait(()=>malformed.readyState===WebSocket.CLOSED);assert.equal(malformed._closeCode,1003);
  }
  const binary=await open(origin,local.token);await wait(()=>binary.messages.some(m=>m.type==='welcome'));binary.send(Buffer.from('{"type":"command","op":"record"}'));await wait(()=>binary.readyState===WebSocket.CLOSED);assert.equal(binary._closeCode,1003);assert.equal(commands.length,0,'binary commands must not reach Live');
  const beforeJoinRefreshes=refreshes;
  const a=await open(origin,local.token),b=await open(origin,local.token);await wait(()=>local.count===2&&a.messages.some(m=>m.type==='state')&&b.messages.some(m=>m.type==='state'));assert.equal(refreshes,beforeJoinRefreshes+2);
  assert.equal(a.messages.find(m=>m.type==='state').state.value,.1,'new client gets current state');
  a.send(JSON.stringify({type:'command',id:'change',op:'parameter',epoch:'test',target:10,value:.5}));await wait(()=>commands.length===1);
  local.publish({type:'result',id:'change',client:commands[0].client,ok:true,result:.5});await wait(()=>a.messages.some(m=>m.id==='change'));assert(!b.messages.some(m=>m.id==='change'),'ACK must only reach the originating client');
  local.publish({type:'state',state:{epoch:'test',value:.5}});await wait(()=>b.messages.some(m=>m.state?.value===.5));
  // A slow connection is severed rather than left online with missing state.
  const slow=await open(origin,local.token);await wait(()=>local.count===3);const slowServer=[...local.clients.keys()].at(-1);
  assert(slowServer);Object.defineProperty(slowServer,'bufferedAmount',{get:()=>2*1024*1024});local.publish({type:'state',state:{epoch:'test',value:.6}});await wait(()=>slow.readyState===WebSocket.CLOSED&&local.count===2);
  assert.equal(b.readyState,WebSocket.OPEN,'slow reader must not disconnect healthy readers');
  a.send('{');await wait(()=>a.readyState===WebSocket.CLOSED&&local.count===1);local.publish({type:'state',state:{epoch:'test',value:.7}});await wait(()=>b.messages.some(m=>m.state?.value===.7));
  const obsolete=[...local.clients.keys()][0];const commandCount=commands.length;
  await local.halt();assert.equal(local.port,0);assert.equal(local.count,0);obsolete.emit('message',Buffer.from(JSON.stringify({type:'command',id:'stale',op:'play'})),false);assert.equal(commands.length,commandCount,'an old connection cannot write after shutdown');
  console.log('Local transport passed: HTTP, Host/Origin validation, Auto port reuse, authentication, join snapshot, broadcasts, targeted ACKs, malformed/slow-client isolation and shutdown guards.');
 }finally{for(const ws of clients)ws.terminate();await local?.halt();if(dir)await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
