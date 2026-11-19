/* Reusable, per-parameter write queue. Latest intent wins; snapshots cannot undo a pending gesture. */
class ParameterSync {
 constructor({send,commit,state,error,recheck=()=>{},now=()=>Date.now()}){Object.assign(this,{send,commit,state,error,recheck,now});this.entries=new Map();}
 preview(id,value){let e=this.entries.get(id);if(!e){e={revision:0,running:false};this.entries.set(id,e);}
  // Controls may preview the same value repeatedly (for example at a range
  // boundary). Keep the revision so a valid in-flight ACK is still usable.
  if(e.pending&&Object.is(e.value,value))return;
  e.value=value;e.revision++;e.pending=true;e.error=false;e.observed=undefined;this.state(id,'pending');}
 write(id,value){let e=this.entries.get(id);if(!e?.pending||e.value!==value)this.preview(id,value);e=this.entries.get(id);if(e.running&&e.sentValue===value&&e.sentRevision===e.revision)return;e.queued=true;if(!e.running)this.flush(id,e);}
 // Detach deleted targets without disturbing other controls. In-flight work
 // cannot be unsent, but entry identity prevents its ACK or queue from resuming.
 cancel(id){id=Number(id);if(!this.entries.delete(id))return false;this.state(id,'idle');return true;}
 reset(){const ids=[...this.entries.keys()];this.entries.clear();for(const id of ids)this.state(id,'idle');}
 async flush(id,e){if(this.entries.get(id)!==e||!e.queued)return;e.queued=false;e.running=true;const revision=e.revision,value=e.value;e.sentValue=value;e.sentRevision=revision;
  try{const result=await this.send(id,value);if(this.entries.get(id)===e&&revision===e.revision){e.pending=false;e.confirmed=result;e.until=this.now()+400;this.commit(id,result);this.state(id,'idle');if(e.observed!==undefined&&e.observed!==result.value)this.recheck(id,e.until);}}
  catch(error){if(this.entries.get(id)===e&&revision===e.revision){e.pending=false;e.confirmed=null;e.error=true;this.state(id,'error');if(e.observed!==undefined)this.recheck(id,this.now());this.error(error);}}
  finally{e.running=false;if(this.entries.get(id)===e&&e.queued)this.flush(id,e);}
 }
 reconcile(device){
  if(!device)return device;
  for(const p of device.parameters){
   const e=this.entries.get(p.id);
   if(e?.pending){e.observed=p.value;p.value=e.value;if(e.confirmed)p.display=e.confirmed.display;}
   else if(e?.confirmed&&this.now()<e.until){
    // A masked update can be another browser's final write. Read the current
    // value after the guard instead of relying on another push to follow it.
    if(p.value!==e.confirmed.value)this.recheck(p.id,e.until);
    p.value=e.confirmed.value;p.display=e.confirmed.display;
   }
  }
  return device;
 }
 intent(id){const e=this.entries.get(Number(id));return e?.pending?e.value:e?.confirmed&&this.now()<e.until?e.confirmed:null;}
 status(id){const e=this.entries.get(Number(id));return e?.pending?'pending':e?.error?'error':'idle';}
}
if(typeof module!=='undefined')module.exports=ParameterSync;
