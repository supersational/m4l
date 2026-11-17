/** Pure EQ model. Physical controls are observed exponential scales; response
 * coefficients are an evidence-calibrated digital-filter hypothesis, not native DSP. */
export const graph=Object.freeze({x:57.5,y:19.5,width:408,height:146,zero:92.25});
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const rawToFrequency=v=>10*Math.pow(2200,clamp(v,0,1));
export const frequencyToRaw=f=>clamp(Math.log(Math.max(10,f)/10)/Math.log(2200),0,1);
export const rawToQ=v=>.1*Math.pow(180,clamp(v,0,1));
export const frequencyToX=f=>graph.x+graph.width*Math.log(Math.max(1e-8,f)/10)/Math.log(2200);
export const xToFrequency=x=>10*Math.pow(2200,(x-graph.x)/graph.width);
export const gainToY=db=>graph.zero-db*(graph.height/30);
export const yToGain=y=>(graph.zero-y)/(graph.height/30);
export const handleX=raw=>graph.x+7+(graph.width-14)*clamp(raw,0,1);
export function handleY(band){let gain=band.gain;if([0,1,4,6,7].includes(band.type))gain=(band.rawQ-.5)*30;return graph.zero-clamp(gain,-15,15)*(graph.height-14)/30;}
const value=(p,n,f=0)=>Number(p[n]?.value??f);
export const channelFor=view=>['R','S'].includes(view?.editChannel)?'B':'A';
export function getBands(parameters,view={}){const channel=channelFor(view);return Array.from({length:8},(_,i)=>{const index=i+1,prefix=index+' ',suffix=' '+channel;const rawFrequency=value(parameters,prefix+'Frequency'+suffix,.5),rawQ=value(parameters,prefix+'Q'+suffix,.3766662);return {index,channel,on:!!value(parameters,prefix+'Filter On'+suffix),type:Math.round(value(parameters,prefix+'Filter Type'+suffix,3)),frequency:rawToFrequency(rawFrequency),gain:value(parameters,prefix+'Gain'+suffix),q:rawToQ(rawQ),rawFrequency,rawQ};});}
export function formatParameter(p){if(!p)return '';if(p.display!=null && (p.initial===undefined||Math.abs(p.value-p.initial)<1e-8))return p.display;const v=Number(p.value);if(p.items?.length)return p.items[Math.round(v)]??String(v);if(p.name.includes('Frequency')){const f=rawToFrequency(v);return f>=1000?(f/1000).toFixed(f>=10000?1:2)+' kHz':(f<100?f.toFixed(1):Math.round(f))+' Hz';}if(/\bQ [AB]$/.test(p.name))return rawToQ(v).toFixed(2);if(p.name==='Scale')return Math.round(v*100)+' %';if(p.name==='Output'||p.name.includes('Gain'))return v.toFixed(1)+' dB';return String(v);}
/** Return [b0,b1,b2,a0,a1,a2] for a real second-order section. */
export function coefficients(type,frequency,gain,q,sampleRate=44100){
 const w=2*Math.PI*clamp(frequency,.01,sampleRate*.49999)/sampleRate,c=Math.cos(w),s=Math.sin(w),A=Math.pow(10,gain/40),alpha=s/(2*Math.max(.01,q)),root=2*Math.sqrt(A)*alpha;
 if(type===3)return [1+alpha*A,-2*c,1-alpha*A,1+alpha/A,-2*c,1-alpha/A];
 if(type===4)return [1,-2*c,1,1+alpha,-2*c,1-alpha];
 if(type<=1)return [(1+c)/2,-(1+c),(1+c)/2,1+alpha,-2*c,1-alpha];
 if(type>=6)return [(1-c)/2,1-c,(1-c)/2,1+alpha,-2*c,1-alpha];
 if(type===2)return [A*((A+1)-(A-1)*c+root),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-root),(A+1)+(A-1)*c+root,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-root];
 return [A*((A+1)+(A-1)*c+root),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-root),(A+1)-(A-1)*c+root,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-root];
}
export function sectionDb(f,coeff,sampleRate=44100){const [b0,b1,b2,a0,a1,a2]=coeff,w=2*Math.PI*clamp(f,.001,sampleRate*.499999)/sampleRate,c=Math.cos(w),s=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w);const n=(b0+b1*c+b2*c2)**2+(b1*s+b2*s2)**2,d=(a0+a1*c+a2*c2)**2+(a1*s+a2*s2)**2;return 10*Math.log10(Math.max(1e-24,n)/Math.max(1e-24,d));}
export function bandResponse(f,band,parameters={},view={}){if(!band.on)return 0;const fs=view.sampleRateHz??view.sampleRate??44100,scale=value(parameters,'Scale',1),gain=band.gain*scale;let q=band.q;
 // Adaptive Q narrows bells as gain grows. Coefficient calibrated against isolated sweeps.
 if(band.type===3&&value(parameters,'Adaptive Q',1))q*=1+Math.pow(Math.abs(gain)/12,2.4);
 // Shelves use a narrower effective damping range than the displayed bell-Q scale.
 // Smooth control-space calibration from isolated +/-12 and +/-15 dB shelves.
 if(band.type===2||band.type===5)q=.70710678*Math.exp(2*(band.rawQ-.45))*Math.pow(10,(Math.abs(gain)-12)/60);
 const coeff=coefficients(band.type,band.frequency,gain,q,fs);
 if(band.type===0||band.type===7){// Four distinct pole pairs preserve the eight-pole transition shape.
  // Affine normalized-Q damping is calibrated from isolated broad/resonant
  // sweeps plus intermediate-Q multi-band/channel evidence.
  const damping=.494+1.35*band.rawQ;
  return [.50979558,.60134489,.89997622,2.56291545].reduce((db,poleQ)=>db+sectionDb(f,coefficients(band.type,band.frequency,0,poleQ*damping,fs),fs),0);}
 return sectionDb(f,coeff,fs);
}
export function responseAt(f,bands,parameters={},view={}){return bands.reduce((sum,b)=>sum+bandResponse(f,b,parameters,view),0);}
