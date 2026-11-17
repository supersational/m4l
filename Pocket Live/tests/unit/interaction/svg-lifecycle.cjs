const {ROOT}=require('../../harness/paths.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const gesturesSource=fs.readFileSync(ROOT+'/web/device-gestures.js','utf8');
const svgSource=fs.readFileSync(ROOT+'/web/svg-device-controls.js','utf8');
function fixture(){
 let now=0,next=0;const timers=new Map(),events={},writes=[];
 const devices=new Map([1,2].map(id=>[id,{id,className:'Fixture',parameters:[{id:id*10,name:'A',enabled:true,value:.5,min:0,max:1,defaultValue:null}]}]));
 const nodes=new Map([1,2].map(id=>{const host={dataset:{svgDevice:id},setPointerCapture(){}};const node={dataset:{param:'A'},closest(selector){return selector==='[data-svg-device]'?host:selector.includes('[role="slider"]')?this:null;},getAttribute(){return null;},focus(){}};return [id,node];}));
 const context=vm.createContext({Map,Set,Number,Math,performance:{now:()=>now},document:{addEventListener:(type,fn)=>(events[type]??=[]).push(fn)},window:{addEventListener(){}},setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),DeviceUI:{find:()=>({change:(d,name,value)=>[{...d.parameters.find(p=>p.name===name),value}]})},adapter:{getDevice:id=>devices.get(id),gesture(){},preview(id,value){for(const d of devices.values()){const p=d.parameters.find(p=>p.id===id);if(p)p.value=value;}},write:(id,value)=>writes.push({id,value})}});
 vm.runInContext(gesturesSource+svgSource+';globalThis.g=DeviceGestures;DeviceSVGControls.install(adapter);',context);
 function fire(type,id,y=100){for(const fn of events[type]||[])fn({pointerId:id,target:nodes.get(id),clientX:100,clientY:y,button:0,preventDefault(){}});}
 function advance(ms){const end=now+ms;for(;;){const entry=[...timers].filter(([,e])=>e.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;}
 return {devices,writes,g:context.g,fire,advance,timers};
}
for(const removal of ['device','parameter','replacement','disabled'])for(const trigger of ['pointermove','pointerup','timer']){
 const f=fixture();
 f.fire('pointerdown',1);f.fire('pointerdown',2);
 for(const id of [1,2]){f.fire('pointermove',id,90);f.fire('pointermove',id,80);}
 const sentBefore=f.writes.filter(p=>p.id===10).length;
 const d=f.devices.get(1);
 if(removal==='device')f.devices.delete(1);
 if(removal==='parameter')d.parameters=[];
 if(removal==='replacement')d.parameters=[{...d.parameters[0],id:100}];
 if(removal==='disabled')d.parameters[0].enabled=false;
 if(trigger==='timer')f.advance(1000);else f.fire(trigger,1,70);
 assert.equal(f.g.count(),1,`${removal}/${trigger}: cancel only the obsolete pointer`);
 f.fire('pointerup',1);f.advance(1000);
 assert.equal(f.writes.filter(p=>p.id===10).length,sentBefore,`${removal}/${trigger}: pending obsolete writes must be discarded`);
 assert.equal(f.writes.some(p=>p.id===100),false,'a replacement parameter cannot inherit the old gesture');
 assert(f.g.owned(10),'cancelled parameter claim is released');
 f.fire('pointermove',2,60);f.fire('pointerup',2);f.advance(1000);
 assert.equal(f.writes.filter(p=>p.id===20).at(-1).value,.5+40/360,'the other finger still reaches its final value');
 assert.equal(f.g.count(),0);assert.equal(f.timers.size,0,'no obsolete deferred timers survive cancellation');
}
console.log('SVG removal, replacement and disabled targets cancel pending move/release/timer writes while preserving other fingers.');
