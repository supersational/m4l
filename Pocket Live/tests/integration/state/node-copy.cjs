// Node holds the current Set: real live.js on a fake Live, the real bridge, Waveforms and SetCopy,
// with only Max's patch cords and the transports replaced. Messages can be dropped on either hop.
const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {host}=require('../../harness/fake-live.cjs');

const h=host(40),handlers={},toMax=[],wire=[];let cloud;
class Local{constructor(o){Object.assign(this,o);this.port=0;this.count=0;}get url(){return '';}info(){return {port:0,url:'',lan:false,status:'Local'};}async start(){}async halt(){}publish(){}}
class Cloud{constructor(o){Object.assign(this,o);cloud=this;this.online=false;this.count=null;this.status='';}start(){this.session={url:'https://example.test/s/x#k',room:'x',expires:Date.now()+60000};this.online=true;this.count=1;this.changed();}stop(){}resume(){}publish(m){wire.push(JSON.parse(JSON.stringify(m)));}}
const {Waveforms}=require(ROOT+'/maxnode/waveforms.cjs');let service;class Captured extends Waveforms{constructor(p){super(p);service=this;}}
const stubs={'max-api':{outlet:(...a)=>toMax.push(a),addHandler:(n,fn)=>handlers[n]=fn,post(){}},'qrcode':{create:()=>({modules:{size:1,data:[1]}})},'node:fs':{existsSync:()=>false,writeFileSync(){}},'node:path':require('node:path'),
 './waveforms.cjs':{Waveforms:Captured},'./local-transport.cjs':{LocalTransport:Local},'./cloud-transport.cjs':{CloudTransport:Cloud},'./frames.cjs':require(ROOT+'/maxnode/frames.cjs'),'../config.json':{worker:'https://example.test'}};
vm.runInNewContext(fs.readFileSync(ROOT+'/maxnode/bridge.js','utf8'),{require:n=>{assert.ok(n in stubs,'unexpected dependency '+n);return stubs[n];},__dirname:ROOT+'/maxnode',process:{platform:'darwin',on(){},exit(){}},setInterval:()=>({unref(){}}),clearInterval(){},console});

// Max's patch cords: live.js -> node.script, and node.script -> [route command refresh presence] -> live.js.
let maxStates=0,maxBytes=0,digests=0,drop=0;const asks=[];
function pump(){
 for(let n=0;n<4;n++){
  for(const m of h.out.splice(0)){
   const selector=m[0]==='frame'?m[4]:m[0];if(m[0]!=='frame'||m[2]===0){if(selector==='state')maxStates++;if(selector==='digest')digests++;}
   for(const x of m)if(typeof x==='string')maxBytes+=x.length;
   if(selector==='patch'&&drop>0){drop--;continue;} // Lost between Max and Node.
   if(m[0]==='frame')handlers.frame(...m.slice(1));else handlers[m[0]]?.(...m.slice(1));
  }
  for(const o of toMax.splice(0)){
   if(process.env.SHOW&&!/"digest":true/.test(o[1]||'')&&['command','refresh'].includes(o[0]))console.log('   to Max:',o[0],String(o[1]).slice(0,120));
   if(o[0]==='command'){const p=JSON.parse(o[1]);if(p.type==='sync')asks.push(p);h.context.command(o[1]);}
   else if(o[0]==='refresh')h.context.refresh();else if(o[0]==='presence')h.context.presence(o[1]);
  }
 }
}
const tick=(n=1)=>{for(let i=0;i<n;i++){h.tick();pump();}};
const settle=()=>{h.settle();pump();};

// A browser, applying messages the way web/app.js does, including its gap check.
class Browser{
 constructor(name){this.name=name;this.state=null;this.read=wire.length;this.gaps=0;this.lose=0;}
 sync(){
  for(;this.read<wire.length;this.read++){const m=wire[this.read];
   if(m.type==='state'){this.state=JSON.parse(JSON.stringify(m.state));continue;}
   if(m.type!=='meters'||!this.state)continue;const p=m.meters;if(this.lose>0&&p.patch){this.lose--;continue;} // Lost on the relay.
   if(p.transport&&p.transport.epoch!==this.state.epoch)continue;Object.assign(this.state,p.transport||{});if(!p.patch)continue;
   if(Number.isInteger(p.seq)){if(Number.isInteger(this.state.seq)&&p.seq!==this.state.seq+1){this.gaps++;cloud.command({type:'command',id:'gap'+this.gaps,client:this.name,request:{op:'refresh',epoch:this.state.epoch}});pump();}this.state.seq=p.seq;}
   for(const info of p.tracks||[]){const t=this.state.tracks.find(x=>x.id===info.id);if(!t)continue;
    for(const k of ['mute','solo','arm'])if(k in info)t[k]=info[k];
    if('playingSlotIndex' in info){t.playingSlotIndex=info.playingSlotIndex;for(const c of t.clips)c.playing=!!c.clipId&&c.index===info.playingSlotIndex;}
    if('firedSlotIndex' in info){t.firedSlotIndex=info.firedSlotIndex;for(const c of t.clips)c.triggered=c.index===info.firedSlotIndex;}
    for(const q of info.params||[]){const x=[t.volume,t.pan,...t.sends].find(x=>x.id===q.id);if(x){x.value=q.value;x.display=q.display;}}}
   for(const next of p.replace||[]){const i=this.state.tracks.findIndex(t=>t.id===next.id);if(i>=0)this.state.tracks[i]=next;}
   if(p.song)Object.assign(this.state,p.song);
  }
  return this.state;
 }
}
const copy=()=>service.latest;
const maxTracks=()=>h.context.order.map(id=>JSON.parse(h.context.trackJSON[id].json));
const strip=s=>s.tracks.map(t=>JSON.parse(JSON.stringify(t)));
// Converged: Node's copy and each browser hold exactly what Max has cached.
function diff(a,b,at=''){if(JSON.stringify(a)===JSON.stringify(b))return null;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=diff(a[k],b[k],at+'.'+k);if(d)return d;}}return at+': '+JSON.stringify(a)?.slice(0,80)+' vs '+JSON.stringify(b)?.slice(0,80);}
const same=(a,b,what)=>{const d=diff(a,b);assert.ok(!d,what+' '+d);};
function converged(...browsers){
 const want=maxTracks(),node=copy();same(strip(node),want,'Node copy matches Max');assert.equal(node.tempo,h.context.head.tempo);
 same(node.scenes,h.context.head.scenes,"Node scenes");
 for(const b of browsers){const s=b.sync();same(strip(s),want,b.name+' matches Max');assert.equal(s.tempo,h.context.head.tempo);same(s.scenes,h.context.head.scenes,b.name+" scenes");}
}

{ // Start: Node has no copy, so it asks Max for a snapshot; then everything loads and settles.
 const a=new Browser('a');pump();
 for(let i=0;i<2000&&!(h.context.loaded&&h.context.allWatched);i++)tick();assert.ok(h.context.allWatched,'observers installed');tick(20);
 // The copy lives in the bridge's Waveforms; reach it through a published snapshot's source.
 assert.ok(a.sync(),'browser has a Set');assert.ok(service.ready,'Node holds the Set');
 var browserA=a;
}
const a=browserA;
const tr=h.native[1].tracks.filter((_,i)=>i%2).map(Number);

{ // A join, and a browser refresh, are answered by Node at once; Max sends no snapshot.
 converged(a);const states=maxStates,b=new Browser('b');
 cloud.refresh();assert.ok(wire.slice(b.read).some(m=>m.type==='state'),'joiner gets a snapshot synchronously');
 const asked=toMax.slice();pump();assert.ok(asked.some(o=>o[0]==='command'&&JSON.parse(o[1]).digest),'Max is asked only for a digest');assert.ok(!asked.some(o=>o[0]==='refresh'),'Max is not asked to resend');
 const before=wire.length;cloud.command({type:'command',id:'r',client:'b',request:{op:'refresh',epoch:a.state.epoch}});
 assert.ok(wire.slice(before).some(m=>m.type==='result'&&m.id==='r'&&m.ok),'refresh acknowledged by Node');assert.ok(wire.slice(before).some(m=>m.type==='state'),'refresh answered with the copy');
 tick(100);assert.equal(maxStates,states,'no snapshot from Max for a join or refresh');converged(a,b);
 console.log('Passed: a join and a refresh get Node\'s copy at once; Max only sends a digest.');
 var browserB=b;
}
const b=browserB;

{ // A lost patch with nothing after it is found by the periodic digest and resent as one track.
 const states=maxStates;drop=1;h.change(tr[3],'mute',1);settle();
 assert.equal(copy().tracks.find(t=>t.id===tr[3]).mute,false,'the patch was lost');
 let ticks=0;while(copy().tracks.find(t=>t.id===tr[3]).mute!==true&&ticks++<80)tick();
 assert.ok(ticks<=60,'repaired within a digest period: '+ticks+' ticks');assert.ok(asks.some(p=>p.resync?.tracks?.includes(tr[3])),'Node asked for that track');
 assert.equal(maxStates,states,'repaired without a snapshot');converged(a,b);assert.equal(a.gaps+b.gaps,0,'browsers never saw the loss');
 console.log('Passed: a lost mute patch is found by the digest within '+ticks*100+'ms and resent as one track.');
}
{ // A lost patch followed by another: the skipped sequence number triggers a digest at once.
 const states=maxStates;drop=1;h.change(tr[4],'solo',1);settle();h.change(tr[5],'mute',1);settle();
 let ticks=0;while(copy().tracks.find(t=>t.id===tr[4]).solo!==true&&ticks++<80)tick();
 assert.ok(ticks<=2,'gap repaired in '+ticks+' ticks');assert.equal(maxStates,states);converged(a,b);
 console.log('Passed: a sequence gap is repaired in '+ticks+' ticks, without a snapshot.');
}
{ // Lost structural and song patches: a rename (replace), a scene rename and a tempo change.
 const states=maxStates;
 drop=1;h.change(tr[6],'name','Lost rename');settle();
 drop=1;h.change(h.native[1].scenes[1],'name','Lost scene');settle();
 drop=1;h.change(1,'tempo',133);tick();
 tick(60);assert.equal(copy().tracks.find(t=>t.id===tr[6]).name,'Lost rename');assert.equal(copy().scenes[0].name,'Lost scene');assert.equal(copy().tempo,133);
 assert.equal(maxStates,states,'repaired without a snapshot');converged(a,b);
 console.log('Passed: lost rename, scene rename and tempo patches are repaired from the digest.');
}
{ // A copy whose shape is wrong (here: a track missing) gets exactly one whole snapshot.
 const states=maxStates;service.latest.tracks.splice(2,1);assert.equal(service.ready,true,'not yet known');
 cloud.refresh();pump();tick(10); // A join triggers a digest, which finds it.
 assert.equal(maxStates,states+1,'shape mismatch fetches one snapshot');tick(60);assert.equal(maxStates,states+1,'and only one');converged(a,b);
 console.log('Passed: a shape mismatch is repaired by one snapshot.');
}
{ // A browser that loses a patch on the relay sees the gap and refreshes from Node.
 const states=maxStates;b.lose=1;h.change(tr[7],'mute',1);settle();b.sync();h.change(tr[8],'mute',1);settle();
 b.sync();assert.equal(b.gaps,1,'gap detected');tick(5);converged(a,b);assert.equal(maxStates,states,'refreshed from Node');
 console.log('Passed: a browser that misses a patch refreshes from Node\'s copy.');
}
{ // A settled Set sends no snapshot in a long run; only small digests.
 const states=maxStates,bytes=maxBytes,d=digests;tick(6000);
 assert.equal(maxStates,states,'no snapshot in 10 minutes');assert.ok(digests-d>=100,'digests keep checking: '+(digests-d));
 const per=(maxBytes-bytes)/600;assert.ok(per<2000,'settled traffic '+per.toFixed(0)+' chars/s');converged(a,b);
 console.log('Passed: 10 settled minutes: no snapshot, '+(digests-d)+' digests, '+per.toFixed(0)+' chars/s from Max.');
}
{ // Many edits with random losses on both hops: everyone converges, with few or no snapshots.
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,states=maxStates;
 for(let i=0;i<120;i++){
  if(rnd()<.1)drop=1;if(rnd()<.05)b.lose=1;const id=tr[Math.floor(rnd()*tr.length)],t=JSON.parse(h.context.trackJSON[id].json),k=Math.floor(rnd()*6);
  if(k===0)h.change(id,'mute',rnd()<.5?1:0);else if(k===1)h.change(id,'solo',rnd()<.5?1:0);else if(k===2)h.change(t.volume.id,'value',Math.round(rnd()*100)/100);
  else if(k===3)h.change(id,'name','T'+i);else if(k===4)h.change(1,'tempo',100+i);else h.change(id,'color',i);
  settle();tick();a.sync();b.sync();
 }
 drop=0;b.lose=0;tick(80);converged(a,b);
 console.log('Passed: 120 edits with random losses converge; '+(maxStates-states)+' snapshots from Max, browser gaps '+b.gaps+'.');
}
console.log('Node copy: joins and refreshes from Node, digest repair, gap detection, no settled snapshots, convergence passed.');
