/* Version-checked layout for Live's Utility. All writes still go to Live. */
const UtilityProfile=(()=>{
 const spec={"id":"utility","className":"StereoGain","bindings":[{"name":"Device On","min":0,"max":1,"quantized":true,"items":["Off","On"]},{"name":"Left Inv","min":0,"max":1,"quantized":true,"items":["Off","On"]},{"name":"Right Inv","min":0,"max":1,"quantized":true,"items":["Off","On"]},{"name":"Channel Mode","min":0,"max":3,"quantized":true,"items":["Left","Stereo","Right","Swap"]},{"name":"Stereo Width","min":0,"max":2,"quantized":false,"items":[]},{"name":"Mono","min":0,"max":1,"quantized":true,"items":["Off","On"]},{"name":"Bass Mono","min":0,"max":1,"quantized":true,"items":["Off","On"]},{"name":"Bass Freq","min":0,"max":1,"quantized":false,"items":[]},{"name":"Balance","min":-1,"max":1,"quantized":false,"items":[]},{"name":"Output","min":-1,"max":1,"quantized":false,"items":[]},{"name":"Mute","min":0,"max":1,"quantized":true,"items":["Off","On"]},{"name":"DC Filter","min":0,"max":1,"quantized":true,"items":["Off","On"]}],"nativeOnly":[{"name":"Bass Mono Audition","reason":"Bass audition can only be switched in Live.","evidence":"Not present in the installed device parameter inventory or inspected Device/View properties."}]};
 const esc=DeviceUI.esc;
 function matches(d,kind){return DeviceUI.audit(spec,d,kind).length===0;}
 function render(d){
  const {by,toggle,knob,select,range}=DeviceUI.controls(d);
  const bass=by('Bass Freq');
  return `<section data-device-face class="utility-face" aria-label="Utility device interface"><div class="ut-title">${toggle('Device On','<span></span>','ut-power')}<strong>${esc(d.name)}</strong><span class="ut-title-end">UTILITY</span></div><div class="ut-columns"><div class="ut-column ut-input"><h3>Input</h3><div class="ut-phase">${toggle('Left Inv','Ø L')}${toggle('Right Inv','Ø R')}</div>${select('Channel Mode')}${knob('Stereo Width','Width')}${toggle('Mono','Mono')}<div class="ut-bass">${toggle('Bass Mono','Bass Mono')}<div class="ut-bass-row"><label class="ut-bass-frequency" data-control="${bass.id}"><output data-value="${bass.id}">${esc(bass.display)}</output>${range(bass)}</label></div></div></div><div class="ut-column ut-output"><h3>Output</h3>${knob('Output','Gain')}${knob('Balance','Balance')}<div class="ut-phase">${toggle('Mute','Mute')}${toggle('DC Filter','DC')}</div></div></div></section><p class="hint ut-hint">Controls the real Utility in Live. Drag knobs vertically or use arrow keys.</p><button class="ut-all" data-op="device_parameter_view">All parameters</button>`;
 }
 return {matches,render,spec};
})();

DeviceUI.register(UtilityProfile);
