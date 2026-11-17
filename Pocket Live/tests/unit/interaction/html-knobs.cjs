const {ROOT}=require('../../harness/paths.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events={},values=[],writes=[];
const input={disabled:false,dataset:{param:'10'},value:.5,min:0,max:1,closest:()=>({}),dispatchEvent(event){values.push(Number(this.value));contextStream(Number(this.value),event.gesturePointer);}};
let captured=false;
const hit={disabled:false,closest:()=>({querySelector:()=>input}),focus(){},blur(){},setPointerCapture(){captured=true;}};
const target={closest:s=>s==='[data-knob-input]'?hit:null};
const ctx=vm.createContext({Map,Set,Number,Math,setTimeout,clearTimeout,Event:class{},document:{addEventListener:(t,fn)=>(events[t]??=[]).push(fn)},window:{addEventListener(){}},writeParameter:(...v)=>writes.push(v),parameterBy:()=>({quantized:false})});
const app=fs.readFileSync(ROOT+'/web/app.js','utf8'),start=app.indexOf('const rangeGestures='),end=app.indexOf("\ndocument.addEventListener('dblclick'",start);
vm.runInContext(fs.readFileSync(ROOT+'/web/device-gestures.js','utf8')+app.slice(start,end),ctx);
function contextStream(value,pointer){ctx.testValue=value;ctx.testPointer=pointer;vm.runInContext('DeviceGestures.stream(10,testValue,writeParameter,testPointer);',ctx);}
function fire(type,x,y,key){for(const fn of events[type]||[])fn({target:type==='keydown'?hit:target,pointerId:1,pointerType:'touch',button:0,clientX:x,clientY:y,key,preventDefault(){},stopImmediatePropagation(){}});}
fire('pointerdown',20,20);assert(captured);assert.equal(values.length,0,'no touch-down jump');
fire('pointermove',68,20);assert.equal(Number(input.value),.6);fire('pointerup',68,20);assert.equal(writes.at(-1)[1],.6);
fire('pointerdown',20,20);fire('pointermove',20,-28);assert.equal(Number(input.value),.7);fire('pointercancel',20,-28);
const render=vm.createContext({});vm.runInContext(fs.readFileSync(ROOT+'/web/device-ui.js','utf8')+';globalThis.html=DeviceUI.controls({parameters:[{id:10,name:"Frequency",value:.5,min:0,max:1,enabled:true,defaultValue:null,display:"1 kHz"}]}).knob("Frequency","Freq");',render);
assert(render.html.includes('hidden tabindex="-1" aria-hidden="true"'));assert(render.html.includes('class="ut-knob-hit" role="slider"'));assert(render.html.includes('data-knob-input="10"'));
console.log('Shared Utility/Auto Filter knob targets, horizontal/vertical dragging and no touch-down jump passed');
