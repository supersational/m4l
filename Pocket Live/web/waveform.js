// A compact, signed min/max envelope. No audio decoding or sample files in browser.
(function(root){
 const cache=new Map();
 function receive(m){if(typeof m.key!=='string'||typeof m.peaks!=='string'||m.peaks.length>16384||!(m.duration>0))return;try{const bytes=Uint8Array.from(atob(m.peaks),c=>c.charCodeAt(0));if(bytes.length!==m.bins*2)return;cache.delete(m.key);cache.set(m.key,{bytes,duration:m.duration,bins:m.bins});while(cache.size>128)cache.delete(cache.keys().next().value);}catch{}}
 function sourceTime(audio,beat,tempo){
  let pos=audio.start+(audio.warped?beat:beat*60/tempo*2**((audio.pitch||0)/12));
  if(audio.looping&&pos>=audio.loopEnd&&audio.loopEnd>audio.loopStart)pos=audio.loopStart+(pos-audio.loopStart)%(audio.loopEnd-audio.loopStart);
  if(!audio.warped)return pos;
  const markers=(audio.markers||[]).filter(m=>Number.isFinite(m.beat_time)&&Number.isFinite(m.sample_time));
  if(markers.length<2)return null;let i=0;while(i<markers.length-2&&markers[i+1].beat_time<pos)i++;
  const a=markers[i],b=markers[i+1];if(b.beat_time<=a.beat_time)return null;
  return a.sample_time+(pos-a.beat_time)*(b.sample_time-a.sample_time)/(b.beat_time-a.beat_time);
 }
 function draw(canvas,clip,tempo){
  const wave=cache.get(clip.waveformKey),audio=clip.audio;if(!wave||!audio||clip.recording)return false;
  const width=Math.max(1,Math.min(2048,Math.ceil(canvas.clientWidth||1))),height=44;
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);ctx.strokeStyle='currentColor';ctx.lineWidth=1;
  ctx.beginPath();let drew=false;
  for(let x=0;x<width;x++){
   const a=sourceTime(audio,(clip.end-clip.start)*x/width,tempo),b=sourceTime(audio,(clip.end-clip.start)*(x+1)/width,tempo);if(a===null||b===null)continue;
   // Loop discontinuities need separate ranges at either end of the source loop.
   const ranges=b>=a?[[a,b]]:[[a,sourceTime({...audio,looping:false,start:audio.loopEnd},0,tempo)],[sourceTime({...audio,looping:false,start:audio.loopStart},0,tempo),b]];
   let lo=128,hi=128;
   for(const [from,to]of ranges){if(to<0||from>wave.duration)continue;const first=Math.max(0,Math.floor(from/wave.duration*wave.bins)),last=Math.min(wave.bins-1,Math.floor(to/wave.duration*wave.bins));for(let i=first;i<=last;i++){lo=Math.min(lo,wave.bytes[i*2]);hi=Math.max(hi,wave.bytes[i*2+1]);}}
   ctx.moveTo(x+.5,height/2-(hi-128)/127*(height/2-1));ctx.lineTo(x+.5,height/2-(lo-128)/127*(height/2-1));drew=true;
  }
  ctx.stroke();return drew;
 }
 root.ClipWaveform={receive,draw,sourceTime,clear:()=>cache.clear()};
})(typeof window==='undefined'?globalThis:window);
