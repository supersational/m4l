// Catch packaged startup failures in browser semantics, without touching Live.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../web-dist'));
const elements=new Map(),socketURLs=[];
function element(){return {dataset:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],querySelector:()=>null,setAttribute(){},remove(){},style:{setProperty(){}}};}
const document={body:element(),querySelector:s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll:()=>[],addEventListener(){},hidden:false};
const context={document,location:{protocol:'http:',origin:'http://192.0.2.1:12345',pathname:'/s/test-room',hash:'#test-key'},navigator:{},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},console,crypto:require('node:crypto').webcrypto,Uint8Array,atob,performance,WebSocket:class{constructor(url){socketURLs.push(url);}},addEventListener(){}};
context.window=context;vm.createContext(context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const name of [...html.matchAll(/(?:src|href)="\/([^"<>]+\.(?:js|css))"/g)].map(m=>m[1]))assert.ok(fs.existsSync(path.join(root,name)),name);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context,{timeout:3000});
assert.equal(socketURLs[0],'ws://192.0.2.1:12345/api/ws/test-room?role=control');assert.equal(typeof context.RecordingUI?.Tracker,'function');assert.equal(typeof context.ClipWaveform?.receive,'function');
console.log('Packaged browser startup passed: globals initialised and local WebSocket opened.');
