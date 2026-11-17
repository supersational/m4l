/* Native EQ Eight face. View properties and parameters are both authoritative Live state. */
const EQ8Profile=(()=>{
 const spec=EQ8Signature,modes=['Stereo','L/R','M/S'];
 const viewSync=new ParameterSync({send:(id,value)=>DeviceUI.context().writeDeviceView(id,value),commit:()=>DeviceUI.context().refresh?.(),state:()=>DeviceUI.context().refresh?.(),error:e=>DeviceUI.context().error?.(e)});
 const by=(d,name)=>d.parameters.find(p=>p.name===name);
 function matches(d,kind){return d.eq8?.available===true&&DeviceUI.audit(spec,d,kind).length===0;}
 function nativeView(d){return viewSync.intent(d.id)||d.eq8;}
 function view(d){const v=nativeView(d),mode=modes[v.globalMode],channel=v.globalMode===2?(v.editMode?'S':'M'):(v.editMode?'R':'L');return {mode,editChannel:mode==='Stereo'?'L':channel,selectedBand:v.selectedBand,sampleRateHz:d.sampleRateHz||DeviceUI.context().sampleRateHz||44100,scale:1};}
 function setView(d,patch){const current=nativeView(d),next={globalMode:current.globalMode,editMode:current.editMode,selectedBand:current.selectedBand,...patch};if(next.globalMode===0)next.editMode=0;if(['globalMode','editMode','selectedBand'].every(k=>next[k]===current[k]))return;viewSync.write(d.id,next);DeviceUI.context().refresh?.();}
 function gainDisabled(d,name){const match=name.match(/^(\d) Gain ([AB])$/);return !!match&&![2,3,5].includes(Number(by(d,`${match[1]} Filter Type ${match[2]}`)?.value));}
 function change(d,name,value){const p=by(d,name);if(!p?.enabled||gainDisabled(d,name))return [];value=EQ8Renderer.clamp(p.quantized?Math.round(value):value,p.min,p.max);return [{...p,value}];}
 function effective(d,pending){return {...d,parameters:d.parameters.map(p=>({...p,display:DeviceUI.formatDisplay(p.display),enabled:p.enabled&&!gainDisabled(d,p.name),initial:pending?.(p.id)==='pending'?NaN:p.value}))};}
 function render(d){return `<section data-device-face class="eq8-panel" aria-label="EQ Eight device interface" title="Static response preview; no live spectrum"><div class="svg-device-host" data-svg-device="${d.id}" data-eq8-device="${d.id}"><div class="svg-device-canvas"></div></div></section><button class="ut-all" data-op="device_parameter_view" data-device="${d.id}">All parameters</button>`;}
 function update(root,d,context=DeviceUI.context()){
  const model=effective(d,context.pending),parameters=Object.fromEntries(model.parameters.map(p=>[p.name,p]));
  for(const host of root.querySelectorAll(`[data-eq8-device="${d.id}"]`)){
   DeviceSVGControls.draw(host,EQ8Renderer.renderDevice(parameters,view(d)),model,context.pending);
   host.dataset.viewSync=viewSync.status(d.id);
   // Standard device view only. Native host-management, audition and analyzer
   // icons are decorative in the reviewed renderer and expose no actions here.
   const edit=host.querySelector('[data-view-channel]');if(view(d).mode==='Stereo'){edit?.setAttribute('aria-disabled','true');edit?.setAttribute('tabindex','-1');}
   for(const node of host.querySelectorAll('[data-band-handle]')){const n=node.dataset.bandHandle,ch=EQ8Renderer.channelFor(view(d));node.dataset.syncState=context.pending?.(by(d,`${n} Frequency ${ch}`).id)||'idle';}
  }
 }
 return {spec,matches,render,update,change,view,setView,gainDisabled,reset:()=>viewSync.reset()};
})();
DeviceUI.register(EQ8Profile);
