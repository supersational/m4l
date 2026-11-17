/* Recording progress, not audio data. No predicted waveforms or writable clip IDs. */
(function(root){
 'use strict';
 function mode(song,track){
  if(!song.playing||song.countingIn||track.kind!=='track'||track.frozen)return null;
  const session=track.sessionRecording===true||(track.clips||[]).some(c=>c.recording);
  const position=Number(song.position);
  const gate=(!song.punchIn||position>=song.loopStart)&&(!song.punchOut||position<song.loopStart+song.loopLength);
  if(song.record&&gate){
   if((track.arrangement||[]).some(c=>c.recording))return 'arrangement';
   // Live's active slot is independent of the currently paged Session grid.
   if(Number.isInteger(track.playingSlotIndex)){
    if(track.playingSlotIndex===-1&&(track.arm||track.implicitArm))return 'arrangement';
    if(track.playingSlotIndex>=0&&track.sessionPlaying)return 'arrangement';
   }else if(track.canArm&&track.arm&&!session){
    // Older loaded AMXDs lack the extra telemetry; explicitly an inferred preview.
    return 'arrangement';
   }
  }
  return session?'session':null;
 }
 class Tracker{
  constructor(){this.reset();}
  reset(){this.epoch=null;this.active=new Map();this.finishing=new Map();this.modes=new Map();this.previousPosition=null;}
  update(song,now=Date.now()){
   if(!song||!Number.isFinite(Number(song.position)))return;
   if(this.epoch!==song.epoch){this.reset();this.epoch=song.epoch;}
   const position=Math.max(0,Number(song.position)),present=new Set();this.modes.clear();
   const wrapped=this.previousPosition!==null&&position+0.01<this.previousPosition;
   for(const track of song.tracks||[]){
    present.add(track.id);const current=mode(song,track);this.modes.set(track.id,current);
    let take=this.active.get(track.id);
    if(current==='arrangement'){
     const native=(track.arrangement||[]).find(c=>c.recording&&Number.isFinite(c.start));
     if(!take||wrapped){
      const start=native?native.start:wrapped&&song.loop&&position>=song.loopStart&&position<song.loopStart+song.loopLength?Math.max(0,song.loopStart):position;
      take={start,end:position,observed:!native};this.active.set(track.id,take);
     }
     take.end=position;this.finishing.delete(track.id);
    }else if(take){
     this.active.delete(track.id);
     if(take.end>take.start)this.finishing.set(track.id,{...take,until:now+2000});
    }
    const pending=this.finishing.get(track.id);
    if(pending&&((track.arrangement||[]).some(c=>!c.recording&&c.start<=pending.start+0.25&&c.end>=pending.end-0.25)||now>=pending.until))this.finishing.delete(track.id);
   }
   for(const map of [this.active,this.finishing])for(const id of map.keys())if(!present.has(id))map.delete(id);
   this.previousPosition=position;
  }
  preview(track){
   if((track.arrangement||[]).some(c=>c.recording))return null;
   const take=this.active.get(track.id)||this.finishing.get(track.id);
   return take?{...take,active:this.active.has(track.id)}:null;
  }
 }
 const api={mode,Tracker};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RecordingUI=api;
})(typeof globalThis==='object'?globalThis:this);
