// Node's copy of the Set. Every message live.js sends is applied here exactly as browsers apply
// it, so a joining controller is answered from this copy and Max never resends the whole Set
// to catch one browser up. Each track carries live.js's version (its stamp); a periodic digest
// of the versions Max sent finds anything this copy missed, and only that is sent again.
const DELTA_TRACKS=24; // More differing tracks than live.js sends as one patch: ask for a snapshot.
const RECORDING=['arm','canArm','implicitArm','frozen','playingSlotIndex','sessionRecording','sessionPlaying'];
const shapeOf=s=>s.tracks.map(t=>t.id).join()+'|'+s.sceneCount+'|'+(s.scenes||[]).map(x=>x.id).join();
class SetCopy{
 // seq numbers what Max sent, so Node notices a lost message and repairs it. Browsers get Node's own
 // numbering (out), so a loss Node repairs never sends every browser back for the whole Set.
 constructor(){this.state=null;this.versions=new Map();this.song=null;this.seq=null;this.out=0;this.stale=true;}
 // Answer joins from here unless nothing has arrived yet or a digest or a gap says it is behind.
 get ready(){return !!this.state&&!this.stale;}
 snapshot(m){
  const {versions,songVersion,seq,...state}=m;
  this.state=state;this.seq=Number.isInteger(m.seq)?m.seq:null;this.song=songVersion??null;this.stale=false;
  this.versions=new Map(Array.isArray(versions)?state.tracks.map((t,i)=>[t.id,versions[i]]):[]);
  return state;
 }
 // False when a message was missed (its sequence number skipped one): the caller asks for a digest.
 patch(m){
  let ok=true;
  if(Number.isInteger(m.seq)){if(this.seq!==null&&m.seq!==this.seq+1)ok=false;this.seq=m.seq;}
  const s=this.state;if(!s||m.transport?.epoch!==s.epoch){this.stale=true;return false;}
  if(!ok)this.stale=true;
  this.meters(m);
  for(const info of m.tracks||[]){const t=s.tracks.find(x=>x.id===info.id);if(!t)continue;
   for(const k of ['mute','solo','arm'])if(k in info)t[k]=info[k];
   if('playingSlotIndex' in info){t.playingSlotIndex=info.playingSlotIndex;for(const c of t.clips||[])c.playing=!!c.clipId&&c.index===info.playingSlotIndex;}
   if('firedSlotIndex' in info){t.firedSlotIndex=info.firedSlotIndex;for(const c of t.clips||[])c.triggered=c.index===info.firedSlotIndex;}
   for(const p of info.params||[]){const q=[t.volume,t.pan,...(t.sends||[])].find(x=>x?.id===p.id);if(q){q.value=p.value;q.display=p.display;}}
  }
  for(const t of Array.isArray(m.replace)?m.replace:[]){const i=s.tracks.findIndex(x=>x.id===t.id);if(i>=0)s.tracks[i]=t;}
  if(m.song)Object.assign(s,m.song);
  // Scene launch state goes beside the song; device moves (m.devices) are not part of the Set.
  for(const sc of s.scenes||[])if(m.sceneTriggered&&sc.id in m.sceneTriggered)sc.triggered=m.sceneTriggered[sc.id];
  for(const [id,v] of Object.entries(m.versions||{}))this.versions.set(Number(id),v);
  if(m.songVersion!==undefined)this.song=m.songVersion;
  return ok;
 }
 // Meters carry the playhead, transport and recording facts; browsers merge them the same way.
 meters(m){
  const s=this.state;if(!s||m.transport&&m.transport.epoch!==s.epoch)return;
  if(m.transport)Object.assign(s,m.transport);if('position' in m)s.position=m.position;
  if(!m.patch)for(const info of m.tracks||[]){const t=s.tracks.find(x=>x.id===info.id);if(t)for(const k of RECORDING)if(k in info)t[k]=info[k];}
 }
 // Null when this copy holds everything Max sent; otherwise what to ask Max to send again.
 check(d){
  const s=this.state;
  if(!s||d.epoch!==s.epoch||d.shape!==shapeOf(s)||!Array.isArray(d.tracks)){this.stale=true;return {full:true};}
  const tracks=s.tracks.filter((t,i)=>this.versions.get(t.id)!==d.tracks[i]).map(t=>t.id),song=d.song!==this.song;
  if(!tracks.length&&!song){this.stale=false;return null;}
  this.stale=true;return tracks.length>DELTA_TRACKS?{full:true}:{tracks,song};
 }
}
module.exports={SetCopy,shapeOf};
