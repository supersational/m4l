const {ROOT}=require('../../harness/paths.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const listeners={},windowEvents={};
const document={addEventListener:(type,fn,options)=>(listeners[type]??=[]).push({fn,options})};
const ctx=vm.createContext({Map,Set,Number,Math,document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn}});
vm.runInContext(fs.readFileSync(ROOT+'/web/device-gestures.js','utf8')+';globalThis.g=DeviceGestures;g.installTouchGuard();',ctx);
const g=ctx.g,control={closest:()=>({})},blank={closest:()=>null};
const touch=(identifier,target=control)=>({identifier,target});
function fire(type,touches=[],changedTouches=touches,cancelable=true){const event={touches,changedTouches,cancelable,prevented:false,preventDefault(){this.prevented=true;}};for(const {fn}of listeners[type]||[])fn(event);return event.prevented;}
assert.equal(fire('touchstart',[touch(1,blank)]),false,'ordinary one-finger scrolling remains available');assert.equal(fire('touchmove',[touch(1,blank)]),false);fire('touchend',[],[touch(1,blank)]);
const first=touch(2),second=touch(3);
assert.equal(fire('touchstart',[first]),false,'single tap can activate a button');assert(g.begin(20,'knob',[100]));
assert.equal(fire('touchstart',[first,second],[second]),true,'second control touch must cancel browser pinch');assert(g.begin(30,'fader',[101]));
assert.equal(fire('gesturestart'),true);assert.equal(fire('gesturechange'),true);assert.equal(fire('touchmove',[first,second]),true);
// Pointer capture/re-rendering can move the event target away from either control.
assert.equal(fire('touchmove',[touch(2,blank),touch(3,blank)]),true,'touch origins remain protected');
g.end(20);fire('touchend',[second],[first]);assert.equal(g.count(),1);assert.equal(fire('touchmove',[second]),true,'remaining control keeps its drag');g.end(30);fire('touchcancel',[],[second]);
assert.equal(fire('gesturechange'),false,'cancel clears touch protection');
fire('touchstart',[first]);windowEvents.blur();assert.equal(fire('gesturestart'),false,'blur clears stale contacts');
const count=listeners.touchstart.length;g.installTouchGuard();assert.equal(listeners.touchstart.length,count,'guard installs once');
for(const type of ['touchstart','touchmove','gesturestart','gesturechange'])assert.equal(listeners[type][0].options.passive,false,'cancellation listener must be non-passive');
console.log('Two-control pinch prevention, independent release, cancellation, redraw, scrolling and Safari gesture guards passed');
