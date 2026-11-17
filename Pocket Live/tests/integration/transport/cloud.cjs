const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const sockets=[],sent=[],commands=[],changes=[],timers=new Map();let next=0,fetches=0,created=0,refreshes=0;
class Socket extends EventEmitter{static OPEN=1;constructor(url){super();this.url=url;this.readyState=1;sockets.push(this);}send(raw){sent.push(JSON.parse(raw));}close(){this.readyState=3;this.emit('close');}}
const context={module:{exports:{}},require:name=>{assert.equal(name,'ws');return Socket;},fetch:async()=>{fetches++;return {ok:true,json:async()=>({room:'fixture',url:'https://example.test/s/fixture#controller-key',hostToken:'host-key',expires:Date.now()+60000})}},AbortController,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
vm.runInNewContext(fs.readFileSync(ROOT+'/maxnode/cloud-transport.cjs','utf8'),context);const {CloudTransport}=context.module.exports;
const cloud=new CloudTransport({worker:'https://example.test',command:m=>commands.push(m),refresh:()=>refreshes++,changed:()=>changes.push(cloud.status),created:()=>created++});
const tick=()=>new Promise(setImmediate);
(async()=>{
 await cloud.start();assert.equal(fetches,1);assert.equal(created,1);assert.equal(sockets[0].url,'wss://example.test/api/ws/fixture?role=host');sockets[0].emit('open');assert.equal(sent[0].token,'host-key');
 sockets[0].emit('message',JSON.stringify({type:'command',id:'before-auth'}));assert.equal(commands.length,0,'commands before host welcome are ignored');
 for(const raw of ['null','[]','42','"text"'])sockets[0].emit('message',raw);
 sockets[0].emit('message',JSON.stringify({type:'welcome',role:'host',controllers:2}));assert(cloud.online);assert.equal(cloud.count,2);assert.equal(refreshes,1);
 sockets[0].emit('message',JSON.stringify({type:'welcome',role:'host',controllers:2}));assert.equal(refreshes,1,'duplicate welcome must not duplicate refresh');
 cloud.publish({type:'state',state:{epoch:'test'}});assert.equal(sent.at(-1).type,'state');sockets[0].emit('message',JSON.stringify({type:'presence',controllers:3}));assert.equal(cloud.count,3);
 sockets[0].emit('message',JSON.stringify({type:'command',id:'a'}));assert.equal(commands.length,1);sockets[0].emit('message','{');assert.equal(commands.length,1);
 sockets[0].emit('close');assert.equal(cloud.online,false);assert.equal(cloud.count,null);assert([...timers.values()].some(t=>t.ms===1000));sockets[0].emit('message',JSON.stringify({type:'command',id:'after-close'}));assert.equal(commands.length,1,'closed socket cannot act during reconnect backoff');
 sockets[0].emit('close');assert.equal([...timers.values()].filter(t=>t.ms===1000).length,1,'duplicate close must not schedule another retry');
 const count=sent.length;cloud.publish({type:'state'});assert.equal(sent.length,count,'no offline writes');
 cloud.stop();assert.equal(timers.size,0);sockets[0].emit('message',JSON.stringify({type:'command',id:'stale'}));assert.equal(commands.length,1,'old socket cannot forward commands');
 cloud.resume();await tick();assert.equal(fetches,1,'resume reuses an unexpired session');assert.equal(sockets.length,2);sockets[1].emit('open');sockets[1].emit('message',JSON.stringify({type:'welcome',role:'host',controllers:0}));assert.equal(cloud.status,'Cloud connected');cloud.stop();
 // A session creation response completing after stop must not create a socket.
 let release;context.fetch=()=>new Promise(resolve=>release=resolve);const fresh=new CloudTransport({worker:'https://example.test',command(){},refresh(){},changed(){},created(){throw Error('late session published')}});const start=fresh.start();fresh.stop();release({ok:true,json:async()=>({expires:Date.now()+10000})});await start;assert.equal(sockets.length,2);
 // Starting explicitly during reconnect must cancel the pending retry and close the old socket.
 cloud.resume();await tick();const active=sockets.at(-1);active.emit('open');active.emit('message',JSON.stringify({type:'welcome',role:'host',controllers:0}));active.emit('close');assert(timers.size);
 await cloud.start();assert.equal(timers.size,0,'explicit start cancels reconnect timer');const replacement=sockets.at(-1);
 await cloud.start();assert.equal(replacement.readyState,3,'repeated start closes previous socket');assert.equal(timers.size,0);cloud.stop();
 console.log('Cloud transport passed: authentication, state/presence, reconnect, session reuse and stale-socket/session rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
