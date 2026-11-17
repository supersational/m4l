// A fake Live for running live.js offline: a small Set whose clock advances per read, so time
// budgets are deterministic, with observers that call back like Live's.
const {ROOT}=require('./paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Frames}=require(ROOT+'/maxnode/frames.cjs');
const LIMIT=32767,READ_US=80;
function setOf(count){
 const n={1:{tracks:[],return_tracks:[],master_track:['id',9000],scenes:[],name:'Big 日本語',is_playing:0}};let next=10000;
 const add=(props)=>{const id=next++;n[id]=props;return id;};
 const list=ids=>ids.flatMap(i=>['id',i]);
 const track=(i)=>{const param=name=>add({name,value:.5,min:0,max:1,is_quantized:0,is_enabled:1,default_value:.5});
  const mixer=add({volume:['id',param('Volume')],panning:['id',param('Pan')],sends:['id',param('Send A')]});
  const clip=()=>add({name:'A long clip name with “quotes” and \\ slashes',color:255,is_midi_clip:1,length:4,loop_end:4,start_time:0,end_time:4});
  const slots=Array.from({length:16},(_,s)=>add({clip:s<8?['id',clip()]:[]}));
  const device=add({name:'Device 🎹',class_name:'Thing',parameters:list([param('On'),param('Dry')]),can_have_chains:0});
  return add({name:'Track '+i,color:i,mixer_device:['id',mixer],clip_slots:list(slots),devices:['id',device],arrangement_clips:list(Array.from({length:8},clip)),can_be_armed:1,has_audio_output:1,has_midi_input:1});};
 for(let i=0;i<count;i++)n[1].tracks.push('id',track(i));
 for(let i=0;i<13;i++)n[1].scenes.push('id',add({name:'Scene '+i,color:0}));
 n[9000]={name:'Main',mixer_device:n[n[1].tracks[1]].mixer_device,clip_slots:[],devices:[],can_be_armed:0,has_audio_output:1};
 return n;
}
function host(count){
 const native=setOf(count);let now=1000000,reads=0;
 const asked={};
 // Observers behave like Live's: a callback per change of one property, plus one on attach.
 const observers=new Set();let created=0;
 const notify=(id,p)=>{for(const o of observers)if(o.id===id&&o.watched===p)o.cb([p,native[id]?.[p]??0]);};
 class API{constructor(cb,path){this.cb=cb;this.watched='';const m=/^id (\d+)$/.exec(path||'');this.id=path==='live_set'?1:m?Number(m[1]):path?native[1].tracks[1]:0;if(cb){created++;now+=5;}}
  get unquotedpath(){return 'object '+this.id;}goto(path){reads++;now+=READ_US/1000;const m=/^object (\d+) (\w+) (\d+)$/.exec(path);this.id=m&&native[m[1]]?.[m[2]]?.[Number(m[3])*2+1]||0;}get(p){reads++;asked[p]=(asked[p]||0)+1;asked[this.id+'.'+p]=(asked[this.id+'.'+p]||0)+1;now+=READ_US/1000;const v=native[this.id]?.[p];return v===undefined?[0]:Array.isArray(v)?v:[v];}
  set(p,v){native[this.id][p]=v;notify(this.id,p);}call(){reads++;now+=READ_US/1000;return '-';}
  set property(p){this.watched=p;if(p){observers.add(this);this.cb(['id',this.id]);this.cb([p,native[this.id]?.[p]??0]);}else observers.delete(this);}get property(){return this.watched;}}
 const out=[];let task,flush,softSync,scheduled=false,softDue=false;
 const context={LiveAPI:API,Task:function(fn){if(fn.name==='flushPatches'){flush=fn;this.schedule=()=>{scheduled=true;};}else if(fn.name==='softSync'){softSync=fn;this.schedule=()=>{softDue=true;};}else task=fn;this.repeat=()=>{};this.cancel=()=>{};},outlet:(...a)=>{for(const x of a)if(typeof x==='string')assert.ok(x.length<=LIMIT,'symbol over Max limit: '+x.length);out.push(a.slice(1));},Date:{now:()=>now},JSON,Math,Number,String,Object,Array,Error,isFinite,console};
 vm.createContext(context);vm.runInContext(fs.readFileSync(ROOT+'/live.js','utf8'),context);context.initialize();
 const tick=()=>{const before=now;task();const spent=now-before;now+=100;return spent;};
 // Live changed something itself; Max then runs the scheduled flush on its next pass.
 const change=(id,p,v)=>{native[id][p]=v;notify(id,p);};
 const settle=()=>{if(scheduled){scheduled=false;flush();}if(softDue){softDue=false;softSync();}};
 return {native,context,out,tick,asked,change,settle,observers,created:()=>created,reads:()=>reads,clock:()=>now};
}
function received(out){const messages=[];const frames=new Frames((s,j)=>messages.push([s,j]),e=>{throw Error(e);});for(const m of out){if(m[0]==='frame')frames.accept(...m.slice(1));else if(['state','meters','result','patch','digest'].includes(m[0]))messages.push([m[0],m[1]]);}return messages;}

module.exports={LIMIT,setOf,host,received};
