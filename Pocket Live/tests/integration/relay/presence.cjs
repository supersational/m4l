const {ROOT}=require('../../harness/paths.cjs');
// Relay lifecycle checks without Live, Cloudflare, or a network connection.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync(ROOT+'/worker.js','utf8').replace(/^import .*\n/,'').replace('export default {','const worker = {').replace('export class LiveRoom','class LiveRoom')+'\nglobalThis.LiveRoom=LiveRoom;globalThis.worker=worker;';
const context={crypto,TextEncoder,URL,Request,Response,Headers,DurableObject:class{constructor(ctx){this.ctx=ctx;}}};vm.createContext(context);vm.runInContext(source,context);
const sockets=[];
function socket(role){const s={a:{role,id:String(sockets.length),authenticated:false,created:Date.now()},messages:[],deserializeAttachment(){return {...this.a};},serializeAttachment(a){this.a={...a};},send(m){this.messages.push(JSON.parse(m));},close(code){this.code=code;}};sockets.push(s);return s;}
(async()=>{
 const base='https://test.invalid';
 const ip='192.0.2.42';
 const roomURL=base+'/api/ws/00000000-0000-4000-8000-000000000001?role=control';
 const upgrade={Upgrade:'websocket','CF-Connecting-IP':ip};
 const checks=[],roomRequests=[];
 const limiter=(route,success)=>({limit:async ({key})=>{checks.push([route,key]);return {success};}});
 const env={
  SESSION_CREATION_LIMIT:limiter('session',false),
  SOCKET_UPGRADE_LIMIT:limiter('socket',false),
  ROOMS:{getByName:room=>{roomRequests.push(room);return {fetch:async()=>new Response('ok')};}},
  ASSETS:{fetch:async()=>new Response('web')},
 };
 const newRoom=()=>new Request(base+'/api/session',{method:'POST',headers:{'CF-Connecting-IP':ip}});
 const denied=await context.worker.fetch(newRoom(),env);
 assert.equal(denied.status,429);assert.equal(denied.headers.get('Retry-After'),'60');
 assert.equal((await context.worker.fetch(new Request(roomURL,{headers:upgrade}),env)).status,429);
 assert.equal((await context.worker.fetch(new Request(roomURL),env)).status,426);
 assert.equal((await context.worker.fetch(new Request(roomURL.replace('control','invalid'),{headers:upgrade}),env)).status,400);
 assert.equal(await (await context.worker.fetch(new Request(base+'/'),env)).text(),'web');
 assert.deepEqual(checks,[['session',ip],['socket',ip]]);
 assert.deepEqual(roomRequests,[],'denied and malformed requests must not reach a Durable Object');
 env.SESSION_CREATION_LIMIT=limiter('session',true);env.SOCKET_UPGRADE_LIMIT=limiter('socket',true);
 const created=await (await context.worker.fetch(newRoom(),env)).json();
 assert.equal(roomRequests[0],created.room);
 assert.equal((await context.worker.fetch(new Request(roomURL,{headers:upgrade}),env)).status,200);
 assert.equal(roomRequests.length,2);
 console.log('Passed: separate public endpoint limits before room access; normal requests still route.');
 const hash=async token=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 const meta={hostHash:await hash('host-key'),controlHash:await hash('phone-key'),expires:Date.now()+60000};
 const room=new context.LiveRoom({getWebSockets:role=>sockets.filter(s=>!role||s.a.role===role),storage:{get:async()=>meta}});
 const auth=(ws,token)=>room.webSocketMessage(ws,JSON.stringify({token}));
 const host=socket('host');await auth(host,'host-key');
 assert.equal(host.messages.find(m=>m.type==='welcome').controllers,0);
 const phone=socket('control');const unauth=socket('control');await auth(phone,'phone-key');
 assert.equal(host.messages.at(-2).type,'presence');assert.equal(host.messages.at(-2).controllers,1);
 await auth(unauth,'wrong-key');assert.equal(unauth.code,1008);assert.equal(room.authenticated('control').length,1);
 const other=socket('control');await auth(other,'phone-key');assert.equal(room.authenticated('control').length,2);
 room.webSocketClose(other);assert.equal(host.messages.at(-1).controllers,1);
 room.webSocketClose(other);assert.equal(host.messages.at(-1).controllers,1);
 room.webSocketError(phone);assert.equal(host.messages.at(-1).controllers,0);
 const reconnect=socket('control');await auth(reconnect,'phone-key');
 const waveform={type:'waveform',epoch:'test',key:'test',duration:1,bins:1,peaks:'gIE='};await room.webSocketMessage(host,JSON.stringify(waveform));assert.deepEqual(reconnect.messages.at(-1),waveform);assert.ok(!unauth.messages.some(m=>m.type==='waveform'));
 const before=host.messages.length;await room.webSocketMessage(reconnect,JSON.stringify(waveform));assert.equal(host.messages.length,before,'controllers cannot publish waveforms');
 // Valid JSON primitives/arrays must close only the offending socket, never throw.
 for(const authenticated of [false,true])for(const raw of ['null','[]','42','true','"text"']){
  const malformed=socket('control');if(authenticated)await auth(malformed,'phone-key');
  await room.webSocketMessage(malformed,raw);assert.equal(malformed.code,1003);
  room.webSocketClose(malformed);
 }
 const newHost=socket('host');await auth(newHost,'host-key');assert.equal(newHost.messages.find(m=>m.type==='welcome').controllers,1);
 const beforeRetired=reconnect.messages.length;
 await room.webSocketMessage(host,JSON.stringify({type:'state',state:{epoch:'retired'}}));
 await auth(host,'host-key');
 assert.equal(reconnect.messages.length,beforeRetired,'replaced host cannot publish or authenticate again before close callback');
 room.webSocketClose(host);assert.ok(!reconnect.messages.some(m=>m.type==='connection'&&m.online===false));
 room.webSocketClose(newHost);assert.equal(reconnect.messages.at(-1).online,false);
 console.log('Passed: 0/1/2 connections, invalid authentication, close/error, repeat close, host replacement and reconnect.');
})().catch(e=>{console.error(e);process.exitCode=1;});
