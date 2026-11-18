const {ROOT}=require('../../harness/paths.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=0,next=0;const timers=new Map(),sent=[];
const c=vm.createContext({Map,Set,Number,Math,setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
vm.runInContext(fs.readFileSync(ROOT+'/web/device-gestures.js','utf8')+';globalThis.g=DeviceGestures;',c);const g=c.g;
function advance(ms){const end=now+ms;while(true){const first=[...timers].filter(([,e])=>e.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;now=first[1].at;timers.delete(first[0]);first[1].fn();}now=end;}
const write=(id,value)=>sent.push({at:now,id,value});g.begin(1,'eq-graph',[10,11]);g.begin(2,'filter-graph',[12,13]);
for(let i=0;i<120;i++){for(let id=10;id<14;id++)g.stream(id,i/120,write,id<12?1:2);advance(16);}
assert(sent.length>8,'streams keep reaching the host before release');
for(let id=10;id<14;id++)g.flush(id,id<12?1:2);
for(const sample of sent)assert(sent.filter(p=>p.at>=sample.at&&p.at<sample.at+1000).length<=26,'four active parameters leave headroom below 30 commands/sec');
for(let id=10;id<14;id++)assert.equal(sent.filter(p=>p.id===id).at(-1).value,119/120,'final intent delivered');
const count=sent.length;advance(1000);assert.equal(sent.length,count,'flushed timers do not send duplicates');
g.stream(10,.2,write,1);g.stream(10,.8,write,1);g.clear();const cancelled=sent.length;advance(1000);assert.equal(sent.length,cancelled,'cancelled stream cannot resurrect');
console.log('Continuous mixed-graph streaming stays within relay budget, delivers final values and cancels cleanly.');

// Releasing a pointer is an ownership boundary even if a surface omits its
// explicit flush (for example when a control disappears during a redraw).
// Commit final intent once and retire the timer before another finger claims it.
g.begin(20,'released-control',[20]);
g.stream(20,.1,write,20);g.stream(20,.9,write,20);
g.end(20);
assert.deepEqual(sent.filter(p=>p.id===20).map(p=>p.value),[.1,.9],'release delivers pending final intent');
assert(g.begin(21,'replacement-control',[20]));
assert(g.stream(20,.4,write,21),'new pointer must not be blocked by a released stream');
g.end(21);
const releasedCount=sent.length;advance(1000);
assert.equal(sent.length,releasedCount,'released pointer timers cannot overwrite the next gesture');
assert.equal(sent.filter(p=>p.id===20).at(-1).value,.4);
console.log('Pointer release retires pending streams and permits immediate ownership transfer.');

g.begin(30,'first-finger',[30]);g.begin(31,'second-finger',[31]);
g.stream(30,.1,write,30);g.stream(30,.8,write,30);
g.stream(31,.2,write,31);g.stream(31,.7,write,31);
g.end(30);
assert.equal(g.count(),1,'one release preserves the other finger');
assert.deepEqual(sent.filter(p=>p.id===31).map(p=>p.value),[.2],'release must not flush another finger early');
advance(120);
assert.equal(sent.filter(p=>p.id===31).at(-1).value,.7,'remaining finger keeps streaming');
g.stream(31,.9,write,31);
const beforeClear=sent.length;g.clear();advance(1000);
assert.equal(sent.length,beforeClear,'disconnect cancellation discards pending final intent');
assert.equal(g.count(),0);
console.log('Independent release preserves other streams; lifecycle cancellation never commits stale intent.');

g.begin(40,'drawer-control',[40]);g.begin(41,'mixer-control',[41]);
g.stream(40,.2,write,40);g.stream(40,.9,write,40);
g.stream(41,.3,write,41);g.stream(41,.7,write,41);
g.finish();
assert.equal(g.count(),0,'navigation releases all touch ownership before replacing the view');
assert.deepEqual(sent.filter(p=>p.id===40).map(p=>p.value),[.2,.9]);
assert.deepEqual(sent.filter(p=>p.id===41).map(p=>p.value),[.3,.7]);
const finishedCount=sent.length;advance(1000);
assert.equal(sent.length,finishedCount,'navigation sends the final value once per control');
