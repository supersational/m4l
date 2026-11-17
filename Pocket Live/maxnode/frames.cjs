// Reassembles JSON that live.js split to stay under Max's 32,767-character symbol limit.
// live.js sends one message's frames synchronously, so one is in flight at a time.
class Frames{
 constructor(deliver,report){this.deliver=deliver;this.report=report;this.current=null;}
 accept(id,index,total,selector,piece){
  if(typeof piece!=='string'||piece[0]!=='~'){this.current=null;this.report('Malformed frame');return;}
  if(index===0){if(this.current)this.report('Dropped an incomplete '+this.current.selector+' message');this.current={id,total,selector,parts:[]};}
  const c=this.current;if(!c)return;
  if(c.id!==id||c.total!==total||c.parts.length!==index){this.current=null;this.report('Dropped an out-of-order '+selector+' message');return;}
  c.parts.push(piece.slice(1));
  if(c.parts.length===total){this.current=null;this.deliver(selector,c.parts.join(''));}
 }
}
module.exports={Frames};
