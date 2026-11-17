/* Shared controls and strict instance binding for device-specific browser layouts. */
const DeviceUI=(()=>{
 const profiles=[];let runtime={};
 function configure(value){runtime=value;}
 function context(pending){return {...runtime,tempo:runtime.tempo?.()||120,sampleRateHz:runtime.sampleRateHz?.()||null,pending:pending||runtime.pending};}
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Shorten only explicit dB readouts; retain Live's raw parameter value and units.
 function formatDisplay(text){
  const m=/^([+−-]?)(\d+)([.,])(\d{2,})\s*dB$/i.exec(text??'');
  if(!m)return text;
  const value=Number(m[2]+'.'+m[4]).toFixed(1);
  return (Number(value)===0?'':m[1])+value.replace('.',m[3])+' dB';
 }
 const headphones='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm16 0h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
 function audit(spec,d,kind){const issues=[];if(kind!==spec.className)issues.push('Device class does not match');for(const b of spec.bindings){const ps=d.parameters.filter(p=>p.name===b.name);if(ps.length!==1){issues.push(b.name+': missing or ambiguous');continue;}const p=ps[0];if(b.min!==undefined&&(b.min!==p.min||b.max!==p.max))issues.push(b.name+': range changed');if(b.quantized!==undefined&&b.quantized!==p.quantized)issues.push(b.name+': type changed');if(b.items&&JSON.stringify(b.items)!==JSON.stringify(p.items))issues.push(b.name+': choices changed');}return issues;}
 function controls(d){
 const by=n=>{const p=d.parameters.find(p=>p.name===n);if(!p)throw Error('Missing parameter '+n);return p;};
 const toggle=(name,label,extra='')=>{const p=by(name);return `<button class="ut-switch ${p.value===p.max?'selected':''} ${extra}" data-control="${p.id}" data-op="utility_switch" data-target="${p.id}" aria-label="${esc(name)}" aria-pressed="${p.value===p.max}" ${p.enabled?'':'disabled'}>${label}</button>`;};
 const range=(p,extra='')=>`<input type="range" data-param="${p.id}" aria-label="${esc(p.name)}" min="${p.min}" max="${p.max}" step="${p.quantized?1:(p.max-p.min)/1000}" value="${p.value}" ${p.enabled?'':'disabled'} ${extra}>`;
 const knob=(name,label)=>{const p=by(name),fraction=(p.value-p.min)/(p.max-p.min);return `<div class="ut-knob" data-control="${p.id}" data-knob="${p.id}" style="--turn:${-135+270*fraction}deg"><label>${esc(label)}</label><div class="ut-dial"><svg viewBox="0 0 100 100" aria-hidden="true"><path class="ut-track" d="M 24 76 A 37 37 0 1 1 76 76"/><path class="ut-hand" d="M50 50 L50 19"/><path class="ut-tick" d="M46 3h8l-4 6Z"/></svg>${range(p,'hidden tabindex="-1" aria-hidden="true"')}<button type="button" class="ut-knob-hit" role="slider" data-knob-input="${p.id}" aria-label="${esc(p.name)}" aria-valuemin="${p.min}" aria-valuemax="${p.max}" aria-valuenow="${p.value}" aria-valuetext="${esc(formatDisplay(p.display))}" ${p.enabled?'':'disabled'}></button></div><output data-value="${p.id}">${esc(formatDisplay(p.display))}</output>${p.defaultValue!==null?`<button class="ut-reset" data-op="reset_parameter" data-target="${p.id}" data-value="${p.defaultValue}" aria-label="Reset ${esc(name)}">Reset</button>`:''}</div>`;};
 const select=name=>{const p=by(name);return `<select data-param="${p.id}" data-control="${p.id}" aria-label="${esc(name)}" ${p.enabled?'':'disabled'}>${p.items.map((item,i)=>`<option value="${p.min+i}" ${p.min+i===p.value?'selected':''}>${esc(item)}</option>`).join('')}</select>`;};
 const unavailable=(label,reason)=>`<button class="ut-unavailable" aria-disabled="true" aria-label="${esc(label)} — use in Live" title="${esc(reason)}" data-op="device_help" data-help="${esc(reason)}">${headphones}</button>`;
 return {by,toggle,range,knob,select,unavailable};
 }
 function update(root,d,pending){for(const title of root.querySelectorAll('[data-device-face] .ut-title strong,[data-device-face] .af-title strong'))title.textContent=d.name;for(const p of d.parameters){const busy=pending?.(p.id)==='pending';for(const el of root.querySelectorAll(`[data-param="${p.id}"]`)){if(!busy&&document.activeElement!==el)el.value=p.value;el.disabled=!p.enabled||runtime.canWrite?.()===false;}for(const hit of root.querySelectorAll(`[data-knob-input="${p.id}"]`)){hit.disabled=!p.enabled||runtime.canWrite?.()===false;hit.setAttribute('aria-valuenow',String(p.value));hit.setAttribute('aria-valuetext',formatDisplay(p.display));} for(const button of root.querySelectorAll(`[data-op="utility_switch"][data-target="${p.id}"]`)){button.setAttribute('aria-pressed',String(p.value===p.max));button.classList.toggle('selected',p.value===p.max);button.disabled=!p.enabled||runtime.canWrite?.()===false;}if(!busy){for(const el of root.querySelectorAll(`[data-value="${p.id}"]`))el.textContent=formatDisplay(p.display);}for(const knob of root.querySelectorAll(`[data-knob="${p.id}"]`))knob.style.setProperty('--turn',(-135+270*(p.value-p.min)/(p.max-p.min))+'deg');}find(d,d.className)?.update?.(root,d,context(pending));}
 function register(profile){if(profiles.some(p=>p.spec.id===profile.spec.id))throw Error('Duplicate device profile '+profile.spec.id);profiles.push(profile);return profile;}
 function find(d,kind){return profiles.find(p=>p.matches(d,kind))||null;}
 return {esc,formatDisplay,audit,controls,update,register,find,configure,context};
})();
