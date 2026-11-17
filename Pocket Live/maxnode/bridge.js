// Shared Live bridge: local and cloud clients use the same typed commands and state.
const max=require('max-api'),QRCode=require('qrcode'),fs=require('node:fs'),path=require('node:path');
const {Waveforms}=require('./waveforms.cjs'),{LocalTransport}=require('./local-transport.cjs'),{CloudTransport}=require('./cloud-transport.cjs'),{Frames}=require('./frames.cjs');
const config=require('../config.json');
let mode=config.mode==='local'?'local':'cloud',scope='lan',preferredPort=0,stopping=false,lastLink='',lastPanel='',localRequest=0;
// Node holds the current Set (see set-copy.cjs). A joining controller gets that copy at once, and
// Max is only asked to check it (a digest); Max sends a whole snapshot only when Node has none.
function refresh(){if(waveforms.ready){waveforms.refresh();ask({digest:true});}else max.outlet('refresh','bang');}
// Requests to live.js about Node's copy travel on the command route, so the patcher is unchanged.
function ask(sync){max.outlet('command',JSON.stringify({type:'sync',...sync}));}
// Max truncates long symbols; refuse rather than deliver a cut-off command.
// How long each command spends inside Max and Live, reported with its result (liveMs), so a slow
// ACK can be told apart from a slow network.
const asked=new Map();
function command(m){
 // A browser asking for the Set again is answered from Node's copy, which Max then checks.
 if(m.request?.op==='refresh'&&waveforms.ready&&m.request.epoch===waveforms.latest.epoch){waveforms.publicState();ask({digest:true});send({type:'result',id:m.id,client:m.client,ok:true,result:true});return;}
 const json=JSON.stringify(m);if(json.length>30000){send({type:'result',id:m.id,client:m.client,ok:false,error:'Command is too large'});return;}asked.set(m.id,Date.now());if(asked.size>256)asked.delete(asked.keys().next().value);max.outlet('command',json);}
function result(r){const start=asked.get(r.id);if(start!==undefined){asked.delete(r.id);r.doneAt=Date.now();r.bridgeAt=start;r.liveMs=r.doneAt-start;}send(r);}
function problem(text){max.post('Pocket Live: '+text);max.outlet('notice',String(text).slice(0,120));}
const local=new LocalTransport({webRoot:fs.existsSync(path.join(__dirname,'../web-dist/index.html'))?path.join(__dirname,'../web-dist'):path.join(__dirname,'../web'),command,refresh,changed:panel});
const cloud=new CloudTransport({worker:config.worker,command,refresh,changed:panel,created:()=>{}});
const waveforms=new Waveforms(send);
let waveformReports=0;waveforms.report=text=>{if(waveformReports++<5)max.post('Pocket Live: '+text);};
function send(m){local.publish(m);cloud.publish(m);}
function selectedURL(){return mode==='local'?local.url:cloud.session?.url||'';}
let lastPresence=null;
function presence(){const count=mode==='local'?local.count:cloud.count,value=Number.isInteger(count)&&count>0?count:0;if(value!==lastPresence){lastPresence=value;max.outlet('presence',value);}}
function panel(){
 presence();
 const info=mode==='local'?local.info():null,url=selectedURL(),ready=mode==='local'?!!info.port:cloud.online;
 const label=mode==='local'?(info.port?(info.lan?'Local · same Wi-Fi':'Local · this Mac'):info.status):cloud.status;
 const count=mode==='local'?local.count:cloud.count;
 const notice=mode==='local'?(info.port?(preferredPort&&info.port!==preferredPort?'Preferred port busy · using '+info.port:'Port '+info.port+(preferredPort?'':' · chosen automatically')+' · '+(info.lan?'same Wi-Fi':scope==='lan'?'connect to Wi-Fi to use your phone':'local to this Mac')):'Starting local connection…'):(!cloud.online?'Local tab works without internet':'Private cloud connection');
 const key=JSON.stringify([mode,url,label,count,ready,scope,notice]);if(key===lastPanel)return;lastPanel=key;
 max.outlet('panelmode',mode==='local'?1:0);max.outlet('panelscope',scope==='lan'?1:0);max.outlet('connection',mode==='local'?1:0,ready?1:0);
 max.outlet('status',label);max.outlet('controllerslabel',Number.isInteger(count)&&count>=0?count+' controller'+(count===1?'':'s')+' connected':'Connecting controllers…');max.outlet('notice',notice);
 if(url!==lastLink){lastLink=url;try{fs.writeFileSync(path.join(__dirname,'../session.json'),JSON.stringify({url,room:mode==='local'?local.room:cloud.session?.room,transport:mode,expires:mode==='cloud'?cloud.session?.expires:undefined,pid:process.pid}),{mode:0o600});}catch{}max.outlet('url',url||'Preparing your connection…');if(url){const q=QRCode.create(url,{errorCorrectionLevel:'L'});max.outlet('qr',JSON.stringify({size:q.modules.size,data:Array.from(q.modules.data)}));}else max.outlet('qr','null');}
}
async function startLocal(){const request=++localRequest;try{await local.start(scope,preferredPort);}catch{if(request===localRequest)max.outlet('notice','Could not open a local connection · press Auto port to retry');}if(request===localRequest)panel();}
max.addHandler('mode',value=>{mode=Number(value)===1?'local':'cloud';lastLink='';if(mode==='local'){cloud.stop();startLocal();}else{local.halt();cloud.resume();}panel();});
max.addHandler('scope',value=>{scope=Number(value)===1?'lan':'mac';if(mode==='local')startLocal();panel();});
max.addHandler('localport',value=>{const port=Number(value);if(!Number.isInteger(port)||port<0||port>65535||port>0&&port<1024){max.outlet('notice','Choose Auto port, or use a custom port from 1024–65535');return;}preferredPort=port;if(mode==='local')startLocal();});
max.addHandler('diagnostic',s=>problem(s));
const receivers={
 state:s=>waveforms.accept(JSON.parse(s)),
 meters:s=>{const m=JSON.parse(s);waveforms.copy.meters(m);send({type:'meters',meters:m});},
 // Patches carry discrete changes (a mute, a clip launch); unlike meters they are never dropped.
 // Each is applied to Node's copy first. A skipped sequence number means one was lost: check now.
 // Each patch is stamped on the way through, so a browser can tell where a change spent its time.
 patch:s=>{const m=JSON.parse(s);m.bridgeAt=Date.now();if(!waveforms.patch(m))ask({digest:true});},
 // Max's versions of what it sent. Anything this copy lacks is asked for again.
 digest:s=>{const need=waveforms.copy.check(JSON.parse(s));if(need)ask({resync:need});},
 result:s=>result(JSON.parse(s)),
};
function receive(selector,s){try{receivers[selector](s);}catch{problem('Unreadable '+selector+' from Live ('+String(s).length+' characters)');}}
for(const selector of Object.keys(receivers))max.addHandler(selector,s=>receive(selector,s));
const frames=new Frames(receive,problem);
max.addHandler('frame',(...args)=>frames.accept(...args));
max.addHandler('open',()=>{const url=selectedURL();if(url)max.outlet('browse',url);});
max.addHandler('copy',()=>{const url=selectedURL();if(!url)return;if(process.platform!=='darwin'){max.outlet('notice','Select the link and copy it with your keyboard');return;}const child=require('node:child_process').spawn('/usr/bin/pbcopy');child.on('error',()=>max.outlet('notice','Select the link and press Cmd-C'));child.stdin.on('error',()=>{});child.on('close',code=>max.outlet('notice',code===0?'Controller link copied':'Select the link and press Cmd-C'));child.stdin.end(url);});
const poll=setInterval(()=>{if(mode==='local')panel();},10000);poll.unref();
process.on('SIGTERM',()=>{stopping=true;clearInterval(poll);waveforms.close();cloud.stop();local.halt().finally(()=>process.exit(0));});
panel();if(mode==='local'){cloud.stop();startLocal();}else cloud.start();
// Tells live.js this script is listening; it sends nothing before this.
max.outlet('refresh','bang');
