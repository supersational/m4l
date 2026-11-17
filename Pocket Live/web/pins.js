/* Pins bind to Live IDs within one set lifetime; never guess a replacement by name. */
class PinStore{
 constructor(storage){this.storage=storage;this.scope='';this.items=[];}
 use(epoch){const scope='pocket-live:pins:v1:'+String(epoch);if(scope===this.scope)return false;this.scope=scope;try{const saved=JSON.parse(this.storage.getItem(scope)||'[]');this.items=Array.isArray(saved)?saved.filter(p=>['track','device'].includes(p.kind)&&Number.isSafeInteger(p.id)&&p.id>0&&Number.isSafeInteger(p.trackId)).slice(0,24):[];}catch{this.items=[];}return true;}
 has(kind,id){return this.items.some(p=>p.kind===kind&&p.id===id);}
 toggle(pin){const index=this.items.findIndex(p=>p.kind===pin.kind&&p.id===pin.id);if(index>=0)this.items.splice(index,1);else{if(this.items.length>=24)throw Error('You can pin up to 24 devices and tracks.');this.items.push(pin);}try{this.storage.setItem(this.scope,JSON.stringify(this.items));}catch{throw Error('Pins work for now, but this browser could not save them.');}}
}
if(typeof module!=='undefined')module.exports=PinStore;
