/* Reviewed Echo face, bound to the current Live instance and shared write queue. */
const EchoProfile=(()=>{
 const spec=EchoSignature,views=new Map();
 const discrete=name=>/ Synced$| 16th$/.test(name)||name==='Mod Rate';
 function matches(d,kind){return DeviceUI.audit(spec,d,kind).length===0;}
 function page(d,value){if(['Echo','Modulation','Character'].includes(value))views.set(d.id,value);}
 function parameters(d,pending){return Object.fromEntries(d.parameters.map(p=>[p.name,{...p,initial:pending?.(p.id)==='pending'?NaN:p.value,initialDisplay:DeviceUI.formatDisplay(p.display)||String(p.value)}]));}
 function change(d,name,value){const p=d.parameters.find(p=>p.name===name);if(!p?.enabled)return [];value=EchoRenderer.clamp(p.quantized||discrete(name)?Math.round(value):value,p.min,p.max);const changes=[{...p,value}];const linked=d.parameters.find(p=>p.name==='Link')?.value;
  // Live links delay timing, while L/R offsets remain independently editable.
  const timing=/^[LR] (Sync|Sync Mode|Synced|16th|Time)$/;
  if(linked&&timing.test(name)){const other=d.parameters.find(p=>p.name===(name[0]==='L'?'R':'L')+name.slice(1));if(other)changes.push({...other,value});}
  if(name==='Link'&&value===p.max)for(const left of d.parameters.filter(p=>p.name.startsWith('L ')&&timing.test(p.name))){const right=d.parameters.find(p=>p.name==='R'+left.name.slice(1));if(right)changes.push({...right,value:left.value});}
  return changes;
 }
 function render(d){return `<section data-device-face class="echo-panel" aria-label="Echo device interface"><div class="svg-device-host" data-svg-device="${d.id}"><div class="svg-device-canvas"></div></div></section><button class="ut-all" data-op="device_parameter_view" data-device="${d.id}">All parameters</button>`;}
 function update(root,d,context=DeviceUI.context()){
  for(const host of root.querySelectorAll(`[data-svg-device="${d.id}"]`)){
   const markup=EchoRenderer.render(parameters(d,context.pending),views.get(d.id)||'Echo',{full:true,tempo:context.tempo,scale:1,expanded:false,active:true});
   DeviceSVGControls.draw(host,markup,d,context.pending);
   // Demo-only header actions and the uncaptured illustrative filter expansion
   // do not represent remotely controllable Live operations.
   host.querySelector('[data-action="filter"]')?.remove();host.querySelector('[data-echo-decorative-header]')?.remove();
  }
 }
 return {spec,matches,render,update,change,page,discrete,reset:()=>views.clear()};
})();
DeviceUI.register(EchoProfile);
