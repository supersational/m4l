/* Auto Filter's measured native layout, using the reviewed shared curve model. */
const AutoFilterProfile=(()=>{
 const spec={id:'auto-filter',className:'AutoFilter2',bindings:AutoFilterLayout.parameters},page=AutoFilterLayout.pages[0],esc=DeviceUI.esc;
 const layoutControls=[...page.controls];
 for(const [name,base,parameter,values]of [['LFO Spin','LFO Phase','LFO S Mode',['Spin']],['LFO Time','LFO Freq','LFO T Mode',['Time']],['LFO Rate','LFO Freq','LFO T Mode',['Synced','Triplet','Dotted']],['LFO 16th','LFO Freq','LFO T Mode',['Sixteenth']],['LFO S&H','LFO Steps','LFO Q Mode',['S&H']]]){const control=page.controls.find(c=>c.name===base);if(control)layoutControls.push({...control,name,when:[{parameter,values}]});}
 const labels={'LFO Time':'Time','LFO Rate':'Rate','LFO 16th':'Rate','Frequency':'Freq','Resonance':'Res','LFO Amount':'LFO Amt','LFO Freq':'Rate','Env Amount':'Envelope','Soft Clip On':'Clip','Dry/Wet':'Dry/Wet','LFO Morph':'Morph','LFO T Mode':'Mode','LFO S Mode':'LFO','LFO Phase':'Ø','LFO Offset':'Offset','LFO Q Mode':'Quantize','LFO Steps':'Steps','Output':'Output'};
 function matches(d,kind){return DeviceUI.audit(spec,d,kind).length===0;}
 function scaled(d){return d.parameters.map(p=>({...p,scale:p.scale||spec.bindings.find(b=>b.name===p.name)?.scale}));}
 function render(d){
  const {knob,select,toggle,range,by}=DeviceUI.controls(d);
  const controls=layoutControls.filter(c=>c.name!=='Device On').map(c=>{
   const label=labels[c.name]||c.name,rect=c.rect,when=c.when?` data-af-when="${esc(JSON.stringify(c.when))}"`:'';
   let html;if(c.kind==='knob'){html=knob(c.name,label);if(['Frequency','LFO Freq','Dry/Wet'].includes(c.name))html=html.replace('<path class="ut-hand"','<path class="af-arc" pathLength="100" d="M 24 76 A 37 37 0 1 1 76 76"/><path class="ut-hand"');}else if(c.kind==='select')html=`<label class="af-select-label">${esc(label)}${select(c.name)}</label>`;else if(c.kind==='toggle')html=toggle(c.name,esc(label));else{const p=by(c.name);html=`<label class="af-value" data-control="${p.id}" title="${esc(c.name)}"><output data-value="${p.id}">${esc(DeviceUI.formatDisplay(p.display))}</output>${range(p)}</label>`;}
   return `<div class="af-control af-${c.kind}" style="left:${rect[0]}px;top:${rect[1]}px;width:${rect[2]}px;height:${rect[3]}px"${when}>${html}</div>`;
  }).join('');
  return `<section data-device-face class="af-panel" aria-label="Auto Filter device interface"><div class="af-viewport"><div class="af-face"><div class="af-title">${toggle('Device On','<span></span>','ut-power')}<strong>${esc(d.name)}</strong></div><span class="af-sidechain">Sidechain</span><div class="af-graph" title="Visually calibrated static response; circuit distortion and live spectrum are not modelled."><svg viewBox="0 0 646 192" preserveAspectRatio="none" aria-label="Filter response; drag to adjust frequency and resonance" role="img" data-af-graph="${d.id}"><g class="af-grid">${[100,1000,10000].map(f=>`<line x1="${AutoFilterModel.frequencyX(f)*646}" x2="${AutoFilterModel.frequencyX(f)*646}" y1="0" y2="192"/>`).join('')}<line x1="0" x2="646" y1="96" y2="96"/></g><path class="af-response"/><circle class="af-handle" r="6"/></svg><span class="af-unavailable" hidden></span></div>${controls}</div></div></section><button class="ut-all" data-op="device_parameter_view" data-device="${d.id}">All parameters</button>`;
 }
 const fitted=new WeakSet();
 function fit(viewport,width){viewport.firstElementChild.style.transform=`scale(${width/493})`;}
 // Pinned cards can change columns after the device has rendered. Fit to the
 // actual viewport size, independently of parameter updates from Live.
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
  for(const {target,contentRect} of entries){
   if(!target.isConnected){resize.unobserve(target);fitted.delete(target);continue;}
   fit(target,contentRect.width);
  }
 }):null;
 function update(root,d){
  const face=root.querySelector('.af-face');if(!face)return;
  const viewport=face.parentElement;
  if(!resize||!fitted.has(viewport)){
   fit(viewport,viewport.getBoundingClientRect().width);
   if(resize){resize.observe(viewport);fitted.add(viewport);}
  }
  const params=scaled(d),model=AutoFilterModel.graphPlugins['filter-response'].model(params),svg=face.querySelector('svg[data-af-graph]'),path=svg.querySelector('.af-response'),handle=svg.querySelector('.af-handle'),unavailable=face.querySelector('.af-unavailable');
  let points='';if(!model.unsupported){for(let i=0;i<=480;i++){const db=AutoFilterModel.responseDb(AutoFilterModel.xFrequency(i/480),model.hz,model.resonance,model.type,model.slope);points+=`${i?'L':'M'}${(i/480*646).toFixed(2)},${((24-db)/48*192).toFixed(2)} `;}}
  path.setAttribute('d',points);handle.hidden=!points;handle.style.display=points?'':'none';if(points){handle.setAttribute('cx',14+AutoFilterModel.frequencyX(model.hz)*(646-28));handle.setAttribute('cy',14+(1-model.resonance)*(192-28));}
  unavailable.hidden=!model.unsupported;unavailable.textContent=model.unsupported?`${model.mode||'This mode'} · curve unavailable`:'';face.classList.toggle('af-off',params.find(p=>p.name==='Device On')?.value===0);
  for(const p of d.parameters){const arc=face.querySelector(`[data-knob="${p.id}"] .af-arc`);if(arc)arc.style.strokeDasharray=(AutoFilterModel.normalized(p)*100)+' 100';}
  for(const el of face.querySelectorAll('[data-af-when]')){const rules=JSON.parse(el.dataset.afWhen);el.hidden=!rules.every(rule=>{const p=params.find(p=>p.name===rule.parameter);return p&&rule.values.includes(p.items[Math.round(p.value-p.min)]);});}
 }
 return {spec,matches,render,update,scaled};
})();
DeviceUI.register(AutoFilterProfile);
