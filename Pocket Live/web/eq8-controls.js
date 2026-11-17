/* EQ Eight's two-axis graph and band/channel selection; scalar controls stay shared. */
const EQ8Controls=(()=>{
 let api;const drags=new Map();
 const selector='[data-eq8-device] [data-band-select],[data-eq8-device] [data-view-mode],[data-eq8-device] [data-view-channel],[data-eq8-device] [data-band-handle]';
 function bound(node){const host=node.closest('[data-eq8-device]'),d=host&&api.getDevice(Number(host.dataset.eq8Device));return d&&api.canWrite()&&EQ8Profile.matches(d,d.className)?{host,d}:null;}
 // Handles remain visually native-sized; acquisition uses a 44 CSS-pixel target.
 function handleAt(event){
  const direct=event.target.closest?.('[data-eq8-device] [data-band-handle]');
  const host=event.target.closest?.('[data-eq8-device]');if(!host)return null;
  if(event.pointerType!=='touch')return direct;
  if(!direct&&event.target.closest?.('[data-band-select],[data-view-mode],[data-view-channel],[data-param],select'))return null;
  let nearest=null,distance=22;
  for(const node of host.querySelectorAll('[data-band-handle]')){
   const circle=node.querySelector('circle'),r=circle?.getBoundingClientRect();if(!r)continue;
   const delta=Math.hypot(event.clientX-r.left-r.width/2,event.clientY-r.top-r.height/2);
   if(delta<distance){nearest=node;distance=delta;}
  }
  return nearest||direct;
 }
 function point(host,event){const svg=host.querySelector('svg'),matrix=svg?.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(matrix.inverse());}
 function set(b,name,value,preview=false){for(const p of EQ8Profile.change(b.d,name,value)){if(!DeviceGestures.canWrite(p.id,b.pointer)||Object.is(b.d.parameters.find(q=>q.id===p.id)?.value,p.value))continue;if(preview){b.changed?.set(p.id,p.value);api.preview(p.id,p.value,b.pointer);DeviceGestures.stream(p.id,p.value,api.write,b.pointer);}else api.write(p.id,p.value,b.pointer);}}
 function activate(node,b,step=1){const v=EQ8Profile.view(b.d);if(node.dataset.bandSelect||node.dataset.bandHandle)EQ8Profile.setView(b.d,{selectedBand:Number(node.dataset.bandSelect||node.dataset.bandHandle)});else if(node.hasAttribute('data-view-mode'))EQ8Profile.setView(b.d,{globalMode:(['Stereo','L/R','M/S'].indexOf(v.mode)+step+3)%3,editMode:0});else if(node.hasAttribute('data-view-channel')&&v.mode!=='Stereo')EQ8Profile.setView(b.d,{editMode:['R','S'].includes(v.editChannel)?0:1});}
 function finish(e){const targets=e?[drags.get(e.pointerId)]:[...drags.values()];for(const g of targets){if(!g)continue;drags.delete(g.pointer);for(const id of g.changed.keys())DeviceGestures.flush(id,g.pointer);DeviceGestures.end(g.pointer);}api.gesture(DeviceGestures.busy());}

 function install(adapter){if(api)throw Error('EQ Eight controls already installed');api=adapter;DeviceGestures.onCancel(()=>drags.clear());
  document.addEventListener('click',e=>{const node=e.target.closest?.(selector),b=node&&bound(node);if(b&&!node.dataset.bandHandle)activate(node,b);});
  document.addEventListener('keydown',e=>{const node=e.target.closest?.(selector),b=node&&bound(node);if(!b||e.altKey||e.ctrlKey||e.metaKey)return;
   if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();activate(node,b);return;}
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();const positive=['ArrowRight','ArrowUp'].includes(e.key),dir=positive?1:-1,v=EQ8Profile.view(b.d);
   if(node.dataset.bandHandle){const n=node.dataset.bandHandle,ch=EQ8Renderer.channelFor(v),horizontal=['ArrowLeft','ArrowRight'].includes(e.key),type=b.d.parameters.find(p=>p.name===`${n} Filter Type ${ch}`).value,field=horizontal?'Frequency':[2,3,5].includes(type)?'Gain':'Q',p=b.d.parameters.find(p=>p.name===`${n} ${field} ${ch}`);set(b,p.name,p.value+dir*(p.max-p.min)/(e.shiftKey?1000:200));}
   else if(node.dataset.bandSelect)EQ8Profile.setView(b.d,{selectedBand:EQ8Renderer.clamp(v.selectedBand+dir,1,8)});else activate(node,b,dir);
  },true);
  document.addEventListener('pointerdown',e=>{
   const node=handleAt(e),b=node&&bound(node);if(!b||e.button!==0)return;
   const last=point(b.host,e);if(!last)return;e.preventDefault();
   const band=Number(node.dataset.bandHandle),channel=EQ8Renderer.channelFor(EQ8Profile.view(b.d)),type=b.d.parameters.find(p=>p.name===`${band} Filter Type ${channel}`).value;
   const fields=['Frequency',[2,3,5].includes(type)?'Gain':'Q'];
   const parameters=fields.map(field=>b.d.parameters.find(p=>p.name===`${band} ${field} ${channel}`));
   if(!DeviceGestures.begin(e.pointerId,'eq8-graph',parameters.map(p=>p.id)))return;
   node.focus({preventScroll:true});b.host.setPointerCapture(e.pointerId);api.gesture(true);
   drags.set(e.pointerId,{...b,pointer:e.pointerId,band,channel,field:fields[1],last,values:parameters.map(p=>p.value),changed:new Map()});
   EQ8Profile.setView(b.d,{selectedBand:band});
  });
  document.addEventListener('pointermove',e=>{
   const g=drags.get(e.pointerId);if(!g)return;const d=api.getDevice(g.d.id),p=point(g.host,e);if(!d||!p)return;e.preventDefault();g.d=d;
   const dx=p.x-g.last.x,dy=p.y-g.last.y,speed=e.shiftKey?.1:1;g.last=p;
   const graph=EQ8Renderer.graph,type=d.parameters.find(p=>p.name===`${g.band} Filter Type ${g.channel}`).value;
   const deltas=[dx/(graph.width-14),-dy*(g.field==='Gain'?30:1)/(graph.height-14)];
   const fields=['Frequency',g.field];
   for(let i=0;i<fields.length;i++){
    if(i===1&&((g.field==='Gain')!==[2,3,5].includes(type)))continue;
    const name=`${g.band} ${fields[i]} ${g.channel}`,parameter=d.parameters.find(p=>p.name===name);
    g.values[i]=EQ8Renderer.clamp(g.values[i]+deltas[i]*speed,parameter.min,parameter.max);
    set(g,name,g.values[i],true);
   }
  });
  document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);document.addEventListener('lostpointercapture',finish);window.addEventListener('blur',()=>finish());
 }
 return {install};
})();
