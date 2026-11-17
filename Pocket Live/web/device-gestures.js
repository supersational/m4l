/* Pointer ownership shared across all device control surfaces. */
const DeviceGestures=(()=>{
 const pointers=new Map(),claims=new Map(),streams=new Map(),cancelHandlers=new Set();let changed=()=>{},available=()=>true;
 function notify(){changed(pointers.size>0);}
 function begin(pointer,owner,targets=[]){if(!available()||pointers.has(pointer)||targets.some(id=>claims.has(Number(id))))return false;const ids=[...new Set(targets.map(Number))];pointers.set(pointer,{owner,ids});for(const id of ids)claims.set(id,pointer);notify();return true;}
 // Normal release commits final intent before ownership transfers. Cancellation
 // through clear() deliberately discards pending writes instead.
 function end(pointer){
  const g=pointers.get(pointer);if(!g)return;
  for(const [id,e] of streams)if(e.pointer===pointer)flush(id,pointer);
  for(const id of g.ids)if(claims.get(id)===pointer)claims.delete(id);
  pointers.delete(pointer);notify();
 }
 // Target removal cancels just one pointer without committing obsolete intent.
 function cancel(pointer){
  for(const [id,e] of streams)if(e.pointer===pointer){clearTimeout(e.timer);streams.delete(id);}
  const g=pointers.get(pointer);if(!g)return;
  for(const id of g.ids)if(claims.get(id)===pointer)claims.delete(id);
  pointers.delete(pointer);notify();
 }
 function clear(){for(const e of streams.values())clearTimeout(e.timer);streams.clear();for(const cancel of cancelHandlers)cancel();pointers.clear();claims.clear();notify();}
 function owned(id,pointer){return !claims.has(Number(id))||claims.get(Number(id))===pointer;}
 function canWrite(id,pointer){return available()&&(id===undefined||owned(id,pointer));}
 // Leading + bounded trailing updates: a continuous drag must reach Live while
 // the finger is moving. Multiple parameters share a rate budget below the
 // relay's 30 commands/sec limit. ParameterSync serializes slow acknowledgements.
 function stream(id,value,write,pointer){
  id=Number(id);if(!canWrite(id,pointer))return false;
  let e=streams.get(id);if(e&&e.pointer!==pointer)return false;
  if(!e){e={value,write,pointer};streams.set(id,e);}e.value=value;
  const send=()=>{if(!canWrite(id,e.pointer))return;if(!e.sent||!Object.is(e.sentValue,e.value)){e.write(id,e.value,e.pointer);e.sent=true;e.sentValue=e.value;}};
  const tick=()=>{if(streams.get(id)!==e)return;e.timer=null;if(!canWrite(id,e.pointer))return;if(!Object.is(e.sentValue,e.value)){send();if(streams.get(id)===e)e.timer=setTimeout(tick,Math.max(75,streams.size*60));}};
  if(!e.timer){send();if(streams.get(id)===e)e.timer=setTimeout(tick,Math.max(75,streams.size*60));}return true;
 }
 function flush(id,pointer){id=Number(id);const e=streams.get(id);if(!e||e.pointer!==pointer)return;clearTimeout(e.timer);streams.delete(id);if(canWrite(id,pointer)&&(!e.sent||!Object.is(e.sentValue,e.value)))e.write(id,e.value,pointer);}

 // Distances are CSS screen pixels, independent of a control's displayed size.
 // Choose one axis after a small dead zone so diagonal drags do not double speed.
 function scalar(value,event,axis='either'){
  return {value,axis,chosen:axis==='vertical'?'y':axis==='horizontal'?'x':null,x:event.clientX,y:event.clientY,originX:event.clientX,originY:event.clientY,pixels:event.pointerType==='touch'?480:360};
 }
 function moveScalar(g,event,min,max){
  if(!g.chosen){const dx=event.clientX-g.originX,dy=event.clientY-g.originY;if(Math.max(Math.abs(dx),Math.abs(dy))<3)return g.value;g.chosen=Math.abs(dx)>Math.abs(dy)?'x':'y';}
  const delta=g.chosen==='x'?event.clientX-g.x:g.y-event.clientY;
  g.x=event.clientX;g.y=event.clientY;
  g.value=Math.max(min,Math.min(max,g.value+delta*(max-min)/g.pixels*(event.shiftKey?.1:1)));
  return g.value;
 }
 // CSS declares drag ownership before a gesture starts. Safari's legacy gesture
 // events get a second guard so two controls never turn into a page pinch.
 let guardInstalled=false;
 function installTouchGuard(target=document){
  if(guardInstalled)return;guardInstalled=true;
  const contacts=new Map(),options={capture:true,passive:false};
  const interactive='button,input,select,textarea,[role="slider"],[data-device-face],[data-op],[data-view]';
  const protectedTouch=()=>pointers.size>0||[...contacts.values()].some(Boolean);
  const prevent=event=>{if(event.cancelable)event.preventDefault();};
  target.addEventListener('touchstart',event=>{
   for(const touch of event.changedTouches)contacts.set(touch.identifier,!!touch.target.closest?.(interactive));
   if(event.touches.length>1&&protectedTouch())prevent(event);
  },options);
  target.addEventListener('touchmove',event=>{
   if(protectedTouch()&&(event.touches.length>1||pointers.size>0))prevent(event);
  },options);
  const release=event=>{for(const touch of event.changedTouches)contacts.delete(touch.identifier);};
  target.addEventListener('touchend',release,{capture:true,passive:true});
  target.addEventListener('touchcancel',release,{capture:true,passive:true});
  for(const type of ['gesturestart','gesturechange','gestureend'])target.addEventListener(type,event=>{
   if(protectedTouch())prevent(event);
  },options);
  cancelHandlers.add(()=>contacts.clear());window.addEventListener('blur',()=>contacts.clear());
 }
 return {scalar,moveScalar,installTouchGuard,begin,end,cancel,clear,stream,flush,canWrite,onCancel:fn=>cancelHandlers.add(fn),configure:(fn,allowed=()=>true)=>{changed=fn;available=allowed;notify();},busy:()=>pointers.size>0,count:()=>pointers.size,owned};
})();
