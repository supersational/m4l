// Paths come exclusively from local Live snapshots. They never leave this process.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads'),{SetCopy}=require('./set-copy.cjs');
// The relay refuses host messages above 2 MiB. Arrangement detail is the only
// unbounded part of a snapshot, so shed it progressively rather than go offline.
const STATE_LIMIT=1500000;
function fitState(state,limit=STATE_LIMIT){
 const size=()=>Buffer.byteLength(JSON.stringify(state));
 if(size()<=limit)return state;
 for(const t of state.tracks||[])for(const c of t.arrangement||[])delete c.audio;
 state.arrangementLimited=true;
 for(const keep of [64,16,0]){if(size()<=limit)break;for(const t of state.tracks||[])if(t.arrangement)t.arrangement=t.arrangement.slice(0,keep);}
 return state;
}
class Waveforms{
 constructor(publish){this.publish=publish;this.cache=new Map();this.sent=new Set();this.jobs=new Map();this.queue=[];this.worker=null;this.busy=false;this.revision=0;this.epoch=null;this.failed=new Map();this.copy=new SetCopy();}
 get latest(){return this.copy.state;}
 get ready(){return this.copy.ready;}
 accept(m){const state=this.copy.snapshot(m);if(state.epoch!==this.epoch){this.epoch=state.epoch;this.sent.clear();}this.publicState();this.scan(state).catch(()=>{});}
 refresh(){this.sent.clear();if(this.latest){this.publicState();this.scan(this.latest).catch(()=>{});}}
 descriptors(state){return(state.tracks||[]).flatMap(t=>(t.arrangement||[]).filter(c=>c.audioFile&&!c.recording));}
 strip(tracks,ready){for(const t of tracks)for(const c of t.arrangement||[]){const file=c.audioFile;delete c.audioFile;if(file&&!c.recording){const entry=this.cache.get(file);if(entry){c.waveformKey=entry.key;ready.push(entry);}}}}
 publicState(){if(!this.latest)return;const ready=[],state=JSON.parse(JSON.stringify(this.latest));state.seq=this.copy.out;this.strip(state.tracks||[],ready);this.publish({type:'state',state:fitState(state)});for(const entry of ready)this.deliver(entry);}
 // Patches are applied to the copy, then sent on; replaced tracks are stripped of file paths like
 // a snapshot. False when a message from Max was missed.
 patch(m){
  const ok=this.copy.patch(m),{versions,songVersion,...out}=m;out.seq=++this.copy.out;
  if(Array.isArray(m.replace)){const ready=[];out.replace=JSON.parse(JSON.stringify(m.replace));this.strip(out.replace,ready);this.publish({type:'meters',meters:out,keep:true});for(const entry of ready)this.deliver(entry);if(this.latest)this.scan(this.latest).catch(()=>{});}
  else this.publish({type:'meters',meters:out,keep:true});
  return ok;
 }
 deliver(entry){if(this.sent.has(entry.key))return;this.sent.add(entry.key);this.publish({type:'waveform',epoch:this.epoch,key:entry.key,...entry.value});}
 async scan(state){
  const files=new Set();
  for(const c of this.descriptors(state)){
   if(!files.has(c.audioFile)&&files.size>=128)continue;files.add(c.audioFile);
   const file=c.audioFile;if(!path.isAbsolute(file)||this.jobs.has(file)||Date.now()-(this.failed.get(file)||0)<10000)continue;
   this.jobs.set(file,true);
   try{const stat=await fs.stat(file);if(!stat.isFile())throw Error();const entry=this.cache.get(file);
    if(entry&&entry.size===stat.size&&entry.mtime===stat.mtimeMs){this.jobs.delete(file);continue;}
    this.cache.delete(file);
    this.queue.push({id:++this.revision,file,size:stat.size,mtime:stat.mtimeMs});this.run();
   }catch(e){this.report?.('Waveform skipped: '+e?.message);this.jobs.delete(file);this.failed.set(file,Date.now());this.cache.delete(file);}
  }
 }
 run(){if(this.busy||!this.queue.length)return;
  if(!this.worker){// execArgv:[]: Node for Max's --import loader needs process.send, which workers lack.
   this.worker=new Worker(path.join(__dirname,'waveform-worker.cjs'),{execArgv:[]});this.worker.unref();this.worker.on('message',m=>this.finish(m));this.worker.on('error',e=>{this.report?.('Waveform worker stopped: '+e?.message);const job=this.active;this.worker=null;if(job)this.finish({id:job.id,error:true});});}
  this.busy=true;this.active=this.queue.shift();this.worker.postMessage(this.active);
 }
 finish(m){const job=this.active;if(!job||m.id!==job.id)return;this.jobs.delete(job.file);this.busy=false;this.active=null;
  if(m.error){this.failed.set(job.file,Date.now());}else{
   const {size,mtime,...value}=m.value,key=crypto.createHash('sha256').update(JSON.stringify([job.file,size,mtime])).digest('hex').slice(0,24);
   this.cache.delete(job.file);this.cache.set(job.file,{key,size,mtime,value});while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);
   // Many files can finish together; republish the snapshot once, not per file.
   if(this.latest&&!this.republish){this.republish=setTimeout(()=>{this.republish=null;this.publicState();},500);this.republish.unref?.();}
  }this.run();
 }
 close(){clearTimeout(this.republish);this.queue=[];return this.worker?.terminate();}
}
module.exports={Waveforms,fitState};
