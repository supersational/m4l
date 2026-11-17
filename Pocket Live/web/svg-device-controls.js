/* SVG device interaction shared by native-looking profiles. Transport stays in app.js. */
const DeviceSVGControls=(()=>{
 let api,lastScalarDown=null,scopeCounter=0;const gestures=new Map();
 const hostFor=node=>node.closest?.('[data-svg-device]');
 function binding(node){if(api.canWrite?.()===false)return null;const host=hostFor(node);if(!host)return null;const d=api.getDevice(Number(host.dataset.svgDevice));const profile=d&&DeviceUI.find(d,d.className);return profile?.change?{host,d,profile}:null;}
 function parameter(d,name){return d.parameters.find(p=>p.name===name);}
 function enabled(d,name){return parameter(d,name)?.enabled!==false;}
 // A gesture binds concrete parameter IDs. A same-named replacement must never
 // inherit a finger's pending writes after structural changes in Live.
 function current(g){
  const d=api.getDevice(g.d.id),p=d&&parameter(d,g.name);
  if(!p?.enabled||p.id!==g.parameterId||!g.targets.every(id=>d.parameters.some(p=>p.id===id&&p.enabled)))return false;
  g.d=d;return true;
 }
 function cancel(g){
  gestures.delete(g.pointer);DeviceGestures.cancel(g.pointer);lastScalarDown=null;
  if(g.host.hasPointerCapture?.(g.pointer))g.host.releasePointerCapture(g.pointer);
  api.gesture(DeviceGestures.busy());
 }
 function streamWrite(g,id,value,pointer){if(!current(g)){cancel(g);return;}api.write(id,value,pointer);}
 function change(b,name,value,preview=false){if(!enabled(b.d,name))return;const changes=b.profile.change(b.d,name,value);for(const p of changes){if(!p.enabled||!DeviceGestures.canWrite(p.id,b.pointer)||Object.is(parameter(b.d,p.name)?.value,p.value))continue;if(preview){b.changed?.set(p.id,p.value);api.preview(p.id,p.value,b.pointer);DeviceGestures.stream(p.id,p.value,(id,value,pointer)=>streamWrite(b,id,value,pointer),b.pointer);}else api.write(p.id,p.value,b.pointer);}}
 function finish(e){const targets=e?[gestures.get(e.pointerId)]:[...gestures.values()];for(const g of targets){if(!g)continue;if(!current(g)){cancel(g);continue;}gestures.delete(g.pointer);for(const id of g.changed.keys())DeviceGestures.flush(id,g.pointer);DeviceGestures.end(g.pointer);}api.gesture(DeviceGestures.busy());}

 function install(adapter){if(api)throw Error('SVG controls already installed');api=adapter;DeviceGestures.onCancel(()=>{gestures.clear();lastScalarDown=null;});
  document.addEventListener('pointerdown',e=>{const node=e.target.closest?.('[data-svg-device] [data-param][role="slider"]');if(!node||e.button!==0)return;const b=binding(node),p=b&&parameter(b.d,node.dataset.param);if(!p?.enabled||node.getAttribute('aria-disabled')==='true')return;e.preventDefault();const targets=b.profile.change(b.d,p.name,p.value).map(p=>p.id);if(!DeviceGestures.begin(e.pointerId,'svg-scalar',targets))return;b.pointer=e.pointerId;node.focus({preventScroll:true});b.host.setPointerCapture(e.pointerId);api.gesture(true);let start=p.value;const now=performance.now();if(gestures.size===0&&lastScalarDown?.host===b.host&&lastScalarDown.name===p.name&&now-lastScalarDown.time<400&&p.defaultValue!==null&&p.defaultValue!==undefined){lastScalarDown=null;change(b,p.name,p.defaultValue);start=p.defaultValue;}else lastScalarDown=gestures.size?null:{host:b.host,name:p.name,time:now};gestures.set(e.pointerId,{...b,pointer:e.pointerId,name:p.name,parameterId:p.id,targets,motion:DeviceGestures.scalar(start,e),changed:new Map()});});
  document.addEventListener('pointermove',e=>{const g=gestures.get(e.pointerId);if(!g)return;if(!current(g)){cancel(g);return;}const p=parameter(g.d,g.name);const value=DeviceGestures.moveScalar(g.motion,e,p.min,p.max);if(g.motion.chosen)lastScalarDown=null;change(g,g.name,value,true);});
  document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);document.addEventListener('lostpointercapture',finish);window.addEventListener('blur',()=>finish());
  document.addEventListener('click',e=>{const node=e.target.closest?.('[data-svg-device] [tabindex]');if(!node)return;const b=binding(node);if(!b)return;if(node.dataset.page){b.profile.page(b.d,node.dataset.page);api.refresh();return;}if(node.dataset.choice){change(b,node.dataset.choice,Number(node.dataset.value));return;}const p=parameter(b.d,node.dataset.param);if(p?.enabled&&node.getAttribute('role')==='button')change(b,p.name,p.value===p.min?p.max:p.min);});
  document.addEventListener('change',e=>{if(!e.target.matches?.('select[data-svg-select]'))return;const b=binding(e.target);if(b)change(b,e.target.dataset.svgSelect,Number(e.target.value));});
  document.addEventListener('dblclick',e=>{const node=e.target.closest?.('[data-svg-device] [data-param]');if(!node)return;const b=binding(node),p=b&&parameter(b.d,node.dataset.param);if(p?.enabled&&p.defaultValue!==null&&p.defaultValue!==undefined){e.preventDefault();change(b,p.name,p.defaultValue);}});
  document.addEventListener('keydown',e=>{const node=e.target.closest?.('[data-svg-device] [tabindex]');if(!node||node.dataset.bandHandle||e.altKey||e.ctrlKey||e.metaKey)return;const b=binding(node);if(!b)return;
   if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();node.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
   const p=parameter(b.d,node.dataset.param);if(!p?.enabled||!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();const discrete=p.quantized||b.profile.discrete?.(p.name);const step=discrete?1:(p.max-p.min)/(e.shiftKey?1000:100);change(b,p.name,p.value+(['ArrowUp','ArrowRight'].includes(e.key)?step:-step));
  },true);
 }
 function draw(host,markup,d,pending){
  const focus=document.activeElement,focused=host.contains(focus)?{name:focus.dataset.param||focus.dataset.svgSelect,page:focus.dataset.page,key:focus.dataset.focusKey}:null;
  const selects=new Map([...host.querySelectorAll('.svg-device-choice')].map(n=>[n.dataset.svgSelect,n])),used=new Set();
  const scope=host.dataset.svgScope||(host.dataset.svgScope='device-svg-'+(++scopeCounter));markup=markup.replace(/\bid="([^"]+)"/g,(_,id)=>'id="'+scope+'-'+id+'"').replace(/url\(#([^)]+)\)/g,(_,id)=>'url(#'+scope+'-'+id+')');
  const canvas=host.querySelector('.svg-device-canvas');canvas.innerHTML=markup;
  for(const node of canvas.querySelectorAll('[data-param],[data-choice]')){
   const p=parameter(d,node.dataset.param||node.dataset.choice);if(!p)continue;node.dataset.control=p.id;node.dataset.syncState=pending?.(p.id)||'idle';node.setAttribute('aria-disabled',String(!p.enabled));if(!p.enabled)node.setAttribute('tabindex','-1');
   if(node.getAttribute('role')==='button'){
    const b=node.getBBox(),hit=document.createElementNS('http://www.w3.org/2000/svg','rect');hit.setAttribute('x',b.x-1.5);hit.setAttribute('y',b.y-1.5);hit.setAttribute('width',Math.max(12,b.width+3));hit.setAttribute('height',Math.max(12,b.height+3));hit.setAttribute('fill','transparent');node.insertBefore(hit,node.firstChild);
   }
   if(node.getAttribute('role')==='combobox'){
    const rect=node.getBBox(),svg=node.ownerSVGElement,w=svg.viewBox.baseVal.width,h=svg.viewBox.baseVal.height;const existing=selects.get(p.name),select=existing||document.createElement('select');used.add(p.name);select.className='svg-device-choice';select.dataset.svgSelect=p.name;select.dataset.control=p.id;select.setAttribute('aria-label',p.name);select.disabled=!p.enabled;
    if(select.dataset.choices!==JSON.stringify(p.items)){select.replaceChildren();for(const [i,label]of p.items.entries()){const option=document.createElement('option');option.value=p.min+i;option.textContent=label;select.append(option);}select.dataset.choices=JSON.stringify(p.items);}if(document.activeElement!==select)select.value=p.value;Object.assign(select.style,{left:100*rect.x/w+'%',top:100*rect.y/h+'%',width:100*rect.width/w+'%',height:100*rect.height/h+'%'});if(!existing)host.append(select);node.removeAttribute('tabindex');node.setAttribute('aria-hidden','true');
   }
  }
  for(const [name,select]of selects)if(!used.has(name))select.remove();
  if(focused){const target=[...host.querySelectorAll('[tabindex],select')].find(n=>focused.key?n.dataset.focusKey===focused.key:focused.page?n.dataset.page===focused.page:(n.dataset.param||n.dataset.svgSelect)===focused.name);target?.focus({preventScroll:true});}
 }
 return {install,draw};
})();
