const {ROOT}=require('../../harness/paths.cjs');
// Incoming messages change state at once and are drawn once per animation frame; ACKs never wait
// for a frame, and a hidden tab (no frames) keeps one pending frame and a bounded backlog.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const frames=[],listeners={},sockets=[],writes=[];
const element=key=>({dataset:{},hidden:false,textContent:'',title:'',isConnected:true,classList:{toggle(name,on){writes.push([key,name,on]);},add(){},remove(){},contains:()=>false},style:{setProperty(){}},firstElementChild:{style:new Proxy({},{set(t,k,v){writes.push([key,k,v]);t[k]=v;return true;}})},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null});
const elements=new Map(),get=s=>{if(!elements.has(s))elements.set(s,element(s));return elements.get(s);};
const document={hidden:false,body:{dataset:{}},activeElement:null,querySelector:get,querySelectorAll:()=>[],addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn)};
const context={document,console,location:{protocol:'http:',origin:'http://localhost:1234',pathname:'/s/test',hash:'#test'},navigator:{},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:true}),performance,crypto:require('node:crypto').webcrypto,Uint8Array,atob,
 requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setInterval(){},clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener(){},Event:class{},MouseEvent:class{},
 WebSocket:class{constructor(){this.readyState=1;sockets.push(this);}send(raw){this.sent=JSON.parse(raw);}close(){this.readyState=3;}}};
context.window=context;vm.createContext(context);
const scripts=[...fs.readFileSync(ROOT+'/web/index.html','utf8').matchAll(/<script src="\/([^"]+)"/g)].map(m=>m[1]);for(const name of scripts)vm.runInContext(fs.readFileSync(ROOT+'/web/'+name,'utf8'),context,{filename:name});
const run=code=>vm.runInContext(code,context),socket=sockets[0],receive=m=>socket.onmessage({data:JSON.stringify(m)});
const param=id=>({id,value:.5,min:0,max:1,display:'0.0 dB'});
run(`hostOnline=true;snapshotReady=true;view='session';state={epoch:'e',signature:[4,4],tempo:120,scenes:[],tracks:[{id:1,kind:'track',name:'A',mute:false,solo:false,arm:false,clips:[],devices:[],arrangement:[],volume:${JSON.stringify(param(10))},pan:${JSON.stringify(param(11))},sends:[]}]};`);
const meters=(position,level)=>receive({type:'meters',meters:{position,transport:{epoch:'e',playing:true},tracks:[{id:1,level}]}});
(async()=>{
 writes.length=0; // Startup status drawing.
 // Five meter messages before a frame: state follows each at once, one frame draws the latest.
 for(let i=1;i<=5;i++)meters(i,i/10);
 assert.equal(frames.length,1,'one frame request for many messages');assert.equal(run('state.position'),5);
 assert.equal(writes.length,0,'nothing drawn before the frame');
 frames.shift()();
 assert.deepEqual(writes.filter(w=>w[1]==='transform').map(w=>w[2]),['scaleY(0.5)'],'latest level drawn once');
 assert.equal(get('#position').textContent,'2.2');
 // A patch changes state immediately and is drawn in the next frame.
 receive({type:'meters',meters:{patch:true,position:5,transport:{epoch:'e'},tracks:[{id:1,mute:true,params:[{id:10,value:.25,display:'-12.0 dB'}]}]}});
 assert.equal(run('state.tracks[0].mute'),true);assert.equal(run('state.tracks[0].volume.display'),'-12.0 dB');assert.equal(frames.length,1);
 // An ACK is handled at once even though no frame has run.
 let resolved=false;run("send('play')").then(()=>{resolved=true;});const id=socket.sent.id;
 receive({type:'result',id,ok:true,result:true,liveMs:3});await new Promise(setImmediate);
 assert.equal(resolved,true,'result resolves without waiting for a frame');assert.equal(run('window.__lastAck.liveMs'),3);
 // Hidden tab: no frames run; the backlog stays one frame and one entry per track/parameter.
 document.hidden=true;for(let i=0;i<500;i++){meters(i,.3);receive({type:'meters',meters:{patch:true,position:i,transport:{epoch:'e'},tracks:[{id:1,params:[{id:10,value:i/1000,display:'v'+i}]}]}});}
 assert.equal(frames.length,1);assert.equal(run('dirty.meters.size'),1);assert.equal(run('dirty.params.size'),1);assert.equal(run('state.tracks[0].volume.display'),'v499');
 // Returning to the tab draws at once rather than waiting for the next frame.
 document.hidden=false;writes.length=0;for(const fn of listeners.visibilitychange||[])fn();
 assert.ok(writes.some(w=>w[1]==='transform'&&w[2]==='scaleY(0.3)'),'drawn on visibility return');
 assert.equal(run('frame'),0,'pending frame cleared');
 // A patch carries no meter reading, so it leaves the meter where the last reading put it.
 writes.length=0;receive({type:'meters',meters:{patch:true,position:1,transport:{epoch:'e'},tracks:[{id:1,solo:true}]}});frames.pop()();
 assert.equal(writes.filter(w=>w[1]==='transform').length,0,'patch does not zero the meter');
 console.log('Frame coalescing passed: one frame per burst, latest value wins, immediate state and ACKs, bounded hidden-tab backlog, draw on return.');
})().catch(error=>{console.error(error);process.exitCode=1;});
