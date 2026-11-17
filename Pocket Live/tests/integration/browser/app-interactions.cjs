const {ROOT}=require('../../harness/paths.cjs');
// Exercise production event handlers and the real write queues without a browser
// or a Live Set. The clock/transport are controlled so lifecycle races repeat.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=0,timerID=0;const timers=new Map(),listeners={},elements=new Map(),controls=[],packets=[],sockets=[];
const document={hidden:false,body:{dataset:{}},activeElement:null,querySelectorAll:s=>s.startsWith('input[data-param],select')?controls:[],querySelector:s=>{if(!elements.has(s))elements.set(s,{dataset:{},classList:{toggle(){},add(){},remove(){}},style:{setProperty(){}},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],hidden:false});return elements.get(s);},addEventListener:(type,fn,options)=>(listeners[type]??=[]).push({fn,capture:options===true||options?.capture})};
const context={document,console,location:{protocol:'http:',origin:'http://localhost:1234',pathname:'/s/test',hash:'#test'},navigator:{},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:true}),confirm:()=>true,performance:{now:()=>now},crypto:require('node:crypto').webcrypto,Uint8Array,atob,
 setInterval(){},clearInterval(){},setTimeout:(fn,delay)=>{const id=++timerID;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),addEventListener(){},Event:class{constructor(type,options){this.type=type;Object.assign(this,options);}},MouseEvent:class{},WebSocket:class{constructor(){this.readyState=1;sockets.push(this);}send(raw){packets.push(JSON.parse(raw));}close(){this.readyState=3;}}};
context.window=context;vm.createContext(context);
const scripts=[...fs.readFileSync(ROOT+'/web/index.html','utf8').matchAll(/<script src="\/([^"]+)"/g)].map(m=>m[1]);for(const name of scripts)vm.runInContext(fs.readFileSync(ROOT+'/web/'+name,'utf8'),context,{filename:name});
const run=code=>vm.runInContext(code,context),tick=()=>new Promise(setImmediate);
const parameter=(id,name,value=.5)=>({id,name,value,min:0,max:1,enabled:true,defaultValue:.25,display:'50 %',quantized:false,items:[]});
const fixture={id:1,className:'Fixture',name:'Fixture',parameters:[parameter(10,'Gain'),parameter(11,'Frequency'),parameter(12,'Resonance',.4)]};context.fixture=fixture;
run("hostOnline=true;snapshotReady=true;state={epoch:'old',tracks:[{id:99,devices:[{id:1,className:'Fixture'}],volume:{id:90},pan:{id:91},sends:[]}]};deviceModels.set(1,{data:fixture,at:0});");
const values=[];const input={tagName:'INPUT',dataset:{param:'10'},min:0,max:1,value:.5,disabled:false,closest:s=>s==='.ut-knob'?knob:s==='.ut-dial,.af-value'?{}:s==='input[type=range][data-param]'?input:null,dispatchEvent:event=>emit(event.type,input,event)};
const knob={querySelector:()=>input,style:{setProperty(){}}};
const hit={tagName:'BUTTON',dataset:{knobInput:'10'},disabled:false,closest:s=>s==='[data-knob-input]'?hit:s==='.ut-knob'?knob:null,focus(){document.activeElement=this;},blur(){if(document.activeElement===this)document.activeElement=null;},setPointerCapture(){}};
const reset={tagName:'BUTTON',dataset:{op:'reset_parameter',target:'10',value:'.25'},closest:s=>s==='[data-op],[data-view]'?reset:null};controls.push(input,hit,reset);
function emit(type,target,extra={}){const event={type,target,button:0,pointerId:1,pointerType:'touch',clientX:100,clientY:100,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const {fn}of [...listeners[type]||[]].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(event.stopped)break;fn(event);}return event;}
function advance(ms){const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}
const answered=new Set();async function ackAll(){for(let round=0;round<6;round++){for(const p of packets){if(answered.has(p.id))continue;answered.add(p.id);sockets[0].onmessage({data:JSON.stringify({type:'result',id:p.id,ok:true,result:p.op==='parameter'?{id:p.target,value:p.value,display:String(p.value)}:true})});}await tick();}}
function resetCase(){run('resetInteractions();hostOnline=true;snapshotReady=true;');fixture.parameters[0].value=.5;input.value=.5;input.disabled=false;hit.disabled=false;packets.length=0;answered.clear();}
(async()=>{
 // Stationary touches, including pointercancel, must not override automation.
 emit('pointerdown',hit);emit('pointerup',hit);assert.equal(packets.length,0);
 emit('pointerdown',hit);emit('pointercancel',hit);assert.equal(packets.length,0);
 // Continuous transport writes, not merely a local preview. Fast ACKs expose
 // scheduler rate; slow ACKs are tested independently in ParameterSync.
 emit('pointerdown',hit);
 for(let i=1;i<=60;i++){advance(16);emit('pointermove',hit,{clientX:100+i});await ackAll();}
 assert(packets.length>=8&&packets.length<=15,`expected bounded streaming, got ${packets.length}`);
 const expected=.5+60/480;emit('pointerup',hit,{clientX:160});await ackAll();
 assert(Math.abs(packets.at(-1).value-expected)<1e-9);const count=packets.length;advance(500);await ackAll();assert.equal(packets.length,count,'no duplicate final write');
 // A reset (button or double-click) cannot steal another finger's parameter.
 resetCase();emit('pointerdown',hit);emit('click',reset);emit('dblclick',hit);assert.equal(packets.length,0);assert.equal(fixture.parameters[0].value,.5);emit('pointerup',hit);
 // Offline cancellation drops streams/claims and blocks all new HTML gestures.
 emit('pointerdown',hit);emit('pointermove',hit,{clientX:148});run("status(false);");const offlineCount=packets.length;advance(500);emit('pointermove',hit,{clientX:200});emit('pointerup',hit);emit('pointerdown',hit);assert.equal(run('DeviceGestures.count()'),0);assert.equal(packets.length,offlineCount);assert.equal(hit.disabled,true);
 await tick();resetCase();
 // A stationary Auto Filter graph tap does not write either parameter.
 run("AutoFilterModel.graphPlugins['filter-response'].model=()=>({hz:AutoFilterModel.xFrequency(.5),resonance:.4});");
 const graph={dataset:{afGraph:'1'},closest:s=>s==='svg[data-af-graph]'?graph:null,setPointerCapture(){},getBoundingClientRect:()=>({width:300,height:100})};
 emit('pointerdown',graph);emit('pointerup',graph);assert.equal(packets.length,0);
 emit('pointerdown',graph);emit('pointermove',graph,{clientX:132,clientY:118});assert.equal(packets.length,2);emit('pointerup',graph);await ackAll();
 // Changing set mid-drag rejects old acknowledgements and unsent trailing work.
 resetCase();emit('pointerdown',hit);emit('pointermove',hit,{clientX:124});emit('pointermove',hit,{clientX:148});advance(80);assert.equal(packets.length,1,'second value waits for ACK');
 run("resetInteractions();state.epoch='new';");const cancelled=packets.length;await ackAll();advance(1000);await ackAll();emit('pointerup',hit);assert.equal(packets.length,cancelled);assert.equal(run('DeviceGestures.count()'),0);
 // Additional bug: deletion may finish after the user opens another panel.
 resetCase();run("activeDrawer={kind:'device',id:1};drawerVersion=10;");
 const del={tagName:'BUTTON',dataset:{op:'device_delete',target:'1'},closest:s=>s==='[data-op],[data-view]'?del:null};emit('click',del);assert.equal(packets.at(-1).op,'device_delete');
 run("openDrawer('Another panel','','settings',99);");await ackAll();assert.equal(run('activeDrawer.kind'),'settings');assert.equal(elements.get('#drawer').hidden,false);
 // Additional bug: SVG keyboard delegation must leave EQ dot events to EQ.
 fixture.eq8={globalMode:0,editMode:0,selectedBand:1};let selected=0;context.selectBand=()=>selected++;run("EQ8Profile.matches=()=>true;EQ8Profile.setView=()=>selectBand();");
 const eqHost={dataset:{eq8Device:'1',svgDevice:'1'}},eqNode={tagName:'g',dataset:{bandHandle:'2'},closest:s=>s==='[data-eq8-device]'||s==='[data-svg-device]'?eqHost:null};
 const eqTarget={tagName:'g',closest:s=>s.includes('[tabindex]')||s.includes('[data-band-handle]')?eqNode:null};
 emit('keydown',eqTarget,{key:'Enter'});emit('keydown',eqTarget,{key:' '});assert.equal(selected,2,'Enter/Space reach the EQ handler');
 // A removed device cannot survive in cache or be resurrected by a late read.
 resetCase();run('parameterSync.write(10,.2);parameterSync.write(10,.8);');
 const beforeRemoval=packets.length;
 run("const priorState=state;state={...state,tracks:[]};pruneDeviceModels(priorState);");
 assert.equal(run('deviceModels.has(1)'),false);assert.equal(run('currentDevice(1)'),undefined);
 assert.equal(run('rememberDevice(fixture)'),null,'late reads cannot resurrect deleted models');
 await ackAll();advance(1000);await ackAll();
 assert.equal(packets.length,beforeRemoval,'deleted target cannot drain its queued trailing write');
 assert.equal(run('parameterSync.status(10)'),'idle');
 console.log('Production app regression checks passed: streaming, no-change taps, reset ownership, offline cancellation, Auto Filter XY, set reset, late delete and EQ keyboard selection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
