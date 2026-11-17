const recordingTracker=new RecordingUI.Tracker();
const pins=new PinStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)}),deviceModels=new Map(),pinnedAll=new Set();
let pinnedBusy=false,interactionGeneration=0,tempoEdit=null;
let sceneOffset=0,scenePage=null,sceneRead=null;
let connectionTransport=location.protocol==='http:'?'local':'cloud';document.body.dataset.transport=connectionTransport;
function commandID(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,ws=null,view='session',retry=0,pending=new Map(),activeDrawer=null,dragging=false,lastMessage=0,reconnectTimer,drawerVersion=0,deviceDetails=null,devicePoll=0,deviceBusy=false,hostOnline=false,snapshotReady=false;
const room=location.pathname.split('/')[2],token=location.hash.slice(1);if(token)$('#help').textContent='Connecting to your private session…';
// Pin data stays in localStorage; just the open page is remembered per tab.
const pinnedViewKey='pocket-live:pinned-view:'+room;
if(room&&token){try{if(sessionStorage.getItem(pinnedViewKey)==='1')view='pinned';}catch{}}
function updateViewButtons(){document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));}
updateViewButtons();
const color=n=>'#'+(Number.isFinite(Number(n))?Number(n):7833753).toString(16).padStart(6,'0').slice(-6),db=v=>v<=0?'−∞ dB':(20*Math.log10(v)).toFixed(1)+' dB';
function foreground(n){const h=color(n),v=parseInt(h.slice(1),16),l=((v>>16)*299+((v>>8)&255)*587+(v&255)*114)/1000;return l>145?'#151515':'#f5f5f5';}
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function status(online,label){const disconnected=hostOnline&&!online;hostOnline=online;if(disconnected)resetInteractions();if(!online){recordingTracker.reset();document.querySelectorAll('.recording-preview').forEach(e=>e.remove());document.querySelectorAll('[data-recording-status]').forEach(e=>{e.textContent='';e.hidden=true;});}hostOnline=online;if(state&&view==='pinned')renderPinned();$('#connection').textContent=label||(online?(connectionTransport==='local'?'Local connected':'Cloud connected'):'Live offline');$('#connection').classList.toggle('online',online);$('#offline').classList.toggle('visible',!online);$('#offline').textContent=label==='Syncing…'?'Connected to Live. Reading your set…':'Open the Pocket Live device in Ableton to connect. This page reconnects automatically.';updateWriteAvailability();}
// Requests belong to one socket and are never buffered or replayed. A lost ACK
// means unknown outcome: only a new native snapshot can establish current truth.
function rejectPending(message){
 for(const request of pending.values()){clearTimeout(request.t);request.reject(Error(message));}
 pending.clear();
}
function send(op,args={}){
 return new Promise((resolve,reject)=>{
  const socket=ws;
  if(!socket||socket.readyState!==1||!snapshotReady||!state||!hostOnline){reject(Error('Wait for Live to connect'));return;}
  if(pending.size>=128){reject(Error('Too many unconfirmed actions. Wait for Live.'));return;}
  const id=commandID(),t=setTimeout(()=>{pending.delete(id);reject(Error('No confirmation from Live. Refresh before trying again.'));},6000);
  pending.set(id,{resolve,reject,t,start:performance.now(),wall:Date.now(),socket,op});
  try{socket.send(JSON.stringify({...args,type:'command',id,op,epoch:state.epoch}));}
  catch(error){clearTimeout(t);pending.delete(id);reject(Error('Connection interrupted; command outcome may be unknown'));}
 });
}
function act(op,args){return send(op,args).catch(e=>{toast(e.message);return false;});}
function connect(){
 if(!room||!token||ws&&ws.readyState<2)return;
 clearTimeout(reconnectTimer);snapshotReady=false;resetInteractions();status(false,'Connecting…');
 const socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/ws/'+room+'?role=control');
 ws=socket;lastMessage=Date.now();
 // Every callback checks its owner. Late close/error/message events from a
 // retired socket cannot disable or write through a newer connection.
 socket.onopen=()=>{if(ws!==socket)return;try{socket.send(JSON.stringify({token}));}catch{socket.close();}};
 socket.onmessage=e=>{
  if(ws!==socket)return;
  let m;try{m=JSON.parse(e.data);}catch{return;}
  if(!m||typeof m!=='object'||Array.isArray(m))return;
  lastMessage=Date.now();
  if(m.type==='welcome'||m.type==='connection'){
   if(['local','cloud'].includes(m.transport)){connectionTransport=m.transport;document.body.dataset.transport=connectionTransport;}
   // Host availability is not readiness. A replaced host needs a fresh state
   // even when it reconnects within the same browser WebSocket.
   snapshotReady=false;resetInteractions();status(false,m.online?'Syncing…':'Live offline');
  }
  if(m.type==='state'){
   if(!m.state||typeof m.state!=='object'||!m.state.epoch||!Array.isArray(m.state.tracks)||!Array.isArray(m.state.scenes))return;
   if(state&&state.epoch!==m.state.epoch){ClipWaveform.clear();deviceModels.clear();pinnedAll.clear();resetInteractions();deviceDetails=null;if(activeDrawer){drawerVersion++;activeDrawer=null;$('#drawer').hidden=true;}}
   const previous=state;state=m.state;snapshotReady=true;retry=0;applyScenePage(previous);pruneDeviceModels(previous);pins.use(room+':'+state.epoch);
   for(const t of state.tracks||[])parameterSync.reconcile({parameters:[t.volume,t.pan,...t.sends]});
   applyHolds();
   status(true);redrawAll();if(sceneOffset)loadScenePage();
  }
  if(m.type==='waveform'&&snapshotReady&&state?.epoch===m.epoch){ClipWaveform.receive(m);drawWaveforms();}
  if(m.type==='meters'&&snapshotReady&&m.meters&&typeof m.meters==='object'&&!Array.isArray(m.meters)){meters(m.meters);if(m.meters.patch){patchGap(m.meters);applyPatch(m.meters);}}
  if(m.type==='result'){
   const p=pending.get(m.id);
   if(p&&p.socket===socket){clearTimeout(p.t);pending.delete(m.id);if(p.op!=='view'){$('#latency').textContent=Math.round(performance.now()-p.start)+' ms';const total=performance.now()-p.start,split=ackSplit(p,m,total);window.__lastAck=split;$('#latency').title=split?`${split.liveMs} ms in Max and Live · ${split.upMs} ms there · ${split.downMs} ms back`:'';}m.ok?p.resolve(m.result):p.reject(Error(m.error||'Live rejected the action'));}
  }
 };
 socket.onclose=e=>{
  if(ws!==socket)return;
  snapshotReady=false;status(false,e.code===1008?'Link expired or invalid':'Reconnecting…');rejectPending('Disconnected; command outcome may be unknown');
  if(e.code!==1008){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(15000,1000*2**Math.min(retry++,4)));}
 };
 socket.onerror=()=>{if(ws===socket)socket.close();};
}
// Focus alone is not an edit. Protect only a user's unfinished input/commit.
function commitTempo(input){
 const edit=tempoEdit;if(!edit||edit.pending)return;edit.pending=true;
 send('song_set',{property:'tempo',value:Number(edit.text)}).then(()=>{
  if(tempoEdit===edit){tempoEdit=null;input.value=Number(edit.text);}
 }).catch(error=>{if(tempoEdit===edit){tempoEdit=null;if(state)input.value=state.tempo;}toast(error.message);});
}
function stepTempo(delta){
 const input=$('#tempo');
 if(!hostOnline||!snapshotReady||!state)return;
 const value=Number.isFinite(input.valueAsNumber)?input.valueAsNumber:Number(state.tempo);
 const next=Math.max(Number(input.min),Math.min(Number(input.max),value+delta));
 if(next===value)return;
 input.value=next;
 tempoEdit={text:input.value};commitTempo(input);
}
document.addEventListener('keydown',event=>{
 if(event.target.id==='tempo'&&['ArrowUp','ArrowDown'].includes(event.key)&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
  event.preventDefault();stepTempo(event.key==='ArrowUp'?1:-1);
 }
 if(event.target.id==='tempo'&&event.key==='Escape'){
  event.preventDefault();tempoEdit=null;if(state)event.target.value=state.tempo;event.target.blur();
 }
});
function applyScenePage(previous){
 if(previous&&previous.epoch!==state.epoch){sceneOffset=0;scenePage=null;sceneRead=null;}
 sceneOffset=Math.min(sceneOffset,Math.floor(Math.max(0,state.sceneCount-1)/8)*8);
 if(!sceneOffset){scenePage=null;return;}
 if(scenePage?.epoch===state.epoch&&scenePage.offset===sceneOffset){
  state={...state,sceneOffset,scenes:scenePage.scenes,tracks:state.tracks.map(track=>({...track,clips:scenePage.tracks.find(t=>t.id===track.id)?.clips||[]}))};
 }
}
function navigateScenes(offset){
 if(!state.capabilities?.includes('scene-pages')){toast('Update the Pocket Live device to browse scenes independently');return;}
 sceneOffset=Math.max(0,Math.min(Math.floor(Math.max(0,state.sceneCount-1)/8)*8,offset));
 if(!sceneOffset){scenePage=null;sceneRead=null;act('refresh');return;}
 loadScenePage();
}
async function loadScenePage(){
 if(!state||!hostOnline||sceneRead||!sceneOffset)return;
 const read={offset:sceneOffset,epoch:state.epoch,generation:interactionGeneration};sceneRead=read;
 try{
  const page=await send('scene_window',{offset:read.offset});
  if(sceneRead!==read||read.generation!==interactionGeneration||state?.epoch!==read.epoch)return;
  if(read.offset!==sceneOffset)return;
  if(page?.epoch!==read.epoch||!Array.isArray(page.scenes)||!Array.isArray(page.tracks))throw Error('Update the Pocket Live device to browse scenes independently');
  scenePage=page;sceneOffset=page.offset;applyScenePage(state);render();
 }catch(error){if(sceneRead===read&&hostOnline)toast(error.message);}
 finally{if(sceneRead===read){sceneRead=null;if(read.offset!==sceneOffset&&sceneOffset)loadScenePage();}}
}
function deviceButtons(devs,child=false){return devs.map(d=>`<button class="device ${d.on?'':'off'} ${child?'child':''}" data-op="device" data-target="${d.id}"><i class="on"></i>${esc(d.name)}</button>${d.chains.map(c=>deviceButtons(c.devices,true)).join('')}`).join('');}
function strip(t){return `<div class="track ${t.kind} ${t.pending?'pending':''}" style="--trackcolor:${color(t.color)};--headink:${foreground(t.color)}" data-track="${t.id}"><div class="trackhead" data-op="track" data-target="${t.id}"><span>${esc(t.name)}</span><span class="recording-status" data-recording-status="${t.id}" hidden></span>${pinButton('track',t.id,t.name)}<button aria-label="Track controls" data-op="track" data-target="${t.id}">⋯</button></div><div class="clips">${t.pending&&!t.clips.length?state.scenes.map(()=>'<div class="cliprow placeholder"></div>').join(''):''}${t.clips.map(c=>`<div class="cliprow"><button class="clip ${c.clipId?'loaded':'empty'} ${c.playing?'playing':''} ${c.recording?'recording':''} ${c.triggered?'triggered':''} ${c.playing&&t.firedSlotIndex===-2?'stopping':''} ${t.arm?'armed':''}" style="--clipcolor:${color(c.color)};--clipink:${foreground(c.color)}" data-op="clip_fire" data-target="${c.id}" title="${c.clipId?'Launch clip':t.arm?'Record into empty slot':'Empty clip slot'}"><span class="symbol">${c.clipId?'▶':t.arm?'◉':'■'}</span><span class="name">${esc(c.name||(t.arm?'Record':''))}</span></button><button class="clipmenu" data-op="clip" data-track="${t.id}" data-target="${c.id}" aria-label="Clip options">⋯</button></div>`).join('')}</div>${t.kind==='track'?`<button class="trackstop ${t.firedSlotIndex===-2?'stopping':''}" data-op="track_stop" data-target="${t.id}">■ Stop track</button>`:''}<div class="mixer"><div class="toggles">${t.kind!=='master'?`<button class="activator ${!t.mute?'active':''}" data-op="mute" data-target="${t.id}" title="Track activator" aria-label="${esc(t.name)} activator">${t.index+1}</button><button class="solo ${t.solo?'active':''}" data-op="solo" data-target="${t.id}" aria-label="${esc(t.name)} solo">S</button>`:''}${t.canArm?`<button class="arm ${t.arm?'active':''}" data-op="arm" data-target="${t.id}" aria-label="${esc(t.name)} arm">●</button>`:''}</div><div class="faderrow"><input class="fader" type="range" min="${t.volume.min}" max="${t.volume.max}" step="0.001" value="${t.volume.value}" data-param="${t.volume.id}" aria-label="${esc(t.name)} volume"><div class="meter" data-meter="${t.id}"><i></i></div></div><div class="volread" data-read="${t.volume.id}">${esc(DeviceUI.formatDisplay(t.volume.display)||db(t.volume.value))}</div><div class="panrow"><span>Pan</span><input type="range" min="${t.pan.min}" max="${t.pan.max}" step=".01" value="${t.pan.value}" data-param="${t.pan.id}" aria-label="${esc(t.name)} pan"></div><div class="sends">${t.sends.map((s,i)=>`<label class="sendrow">${String.fromCharCode(65+i)}<input type="range" min="${s.min}" max="${s.max}" step=".01" value="${s.value}" data-param="${s.id}" aria-label="Send ${String.fromCharCode(65+i)}"></label>`).join('')}</div></div><div class="devices">${deviceButtons(t.devices)}<button class="adddevice" data-op="device_browser" data-target="${t.id}">＋ Device</button></div></div>`;}
function renderHead(){if(!state)return;$('#pinCount').textContent=pins.items.length?`(${pins.items.length})`:'';updateDrawerPin();updateDrawerDeviceNav();recordingTracker.update(state);$('#backarrangement').hidden=!state.backToArrangement;$('#setname').textContent=state.name;$('#play').classList.toggle('active',state.playing);$('#record').classList.toggle('active',state.record);$('#metro').classList.toggle('active',state.metronome);if(!tempoEdit)$('#tempo').value=state.tempo;$('#undo').disabled=!state.canUndo;$('#redo').disabled=!state.canRedo;document.querySelector('[data-op=previous]').disabled=state.sceneOffset===0;document.querySelector('[data-op=next]').disabled=state.sceneOffset+8>=state.sceneCount;$('#scenerange').textContent=`${state.sceneOffset+1}–${Math.min(state.sceneOffset+8,state.sceneCount)} / ${state.sceneCount}`;}
// Song-level controls only; render() also rebuilds every strip.
function render(){if(!state)return;forgetStrips();renderHead();
 if(!dragging){const main=$('#main'),x=main.scrollLeft,y=main.scrollTop;if(view==='arrangement')renderArrangement();else if(view==='pinned')renderPinned();else main.innerHTML=`<div class="session ${view==='mixer'?'mixeronly':''}">${state.tracks.map(strip).join('')}<div class="track scenes"><div class="trackhead">Scenes</div><div class="clips">${state.scenes.map(s=>`<div class="cliprow"><button class="clip ${s.triggered?'triggered':''}" data-op="scene_fire" data-target="${s.id}">▶ ${esc(s.name||s.index+1)}</button><button class="clipmenu" data-op="scene" data-target="${s.id}">⋯</button></div>`).join('')}</div><div class="mixer"><button data-op="stop_all">■ Stop all</button><button data-op="add">＋ Track</button></div></div></div>`;main.scrollLeft=x;main.scrollTop=y;}
 updateRecordingUI();reportView();
 syncClipDrawer();
 if(activeDrawer?.kind==='device'){if(state.device?.id===activeDrawer.id){deviceDetails=rememberDevice(state.device);renderDevice();}else if(!deviceBusy&&Date.now()-devicePoll>(deviceViews()?DEVICE_SAFETY_MS:1500))loadDevice(activeDrawer.id,drawerVersion);}}
function renderArrangement(){const tracks=state.tracks.filter(t=>t.kind==='track');let end=Math.max(64,state.loopStart+state.loopLength,state.position+16,...tracks.flatMap(t=>t.arrangement.map(c=>c.end)));const w=Math.max(800,end*12);$('#main').innerHTML=`<div class="timeline" style="width:${w+160}px"><div class="timelineruler" style="width:${w}px">${Array.from({length:Math.ceil(end/4)},(_,i)=>`<span class="rulerbeat" style="left:${i*48}px">${i+1}</span>`).join('')}</div>${tracks.map(t=>`<div class="lane" data-track="${t.id}"><div class="lanehead" style="border-left:4px solid ${color(t.color)}" data-op="track" data-target="${t.id}"><span>${esc(t.name)}</span><span class="recording-status" data-recording-status="${t.id}" hidden></span></div><div class="region">${t.arrangement.map(c=>`<button class="arrclip ${c.recording?'is-recording':''}" data-start="${c.start}" style="left:${c.start*12}px;width:${Math.max(25,((c.recording?Math.max(c.end,state.position):c.end)-c.start)*12)}px;background:${color(c.color)};color:${foreground(c.color)}" data-op="arrclip" data-target="${c.id}" data-track="${t.id}"><span class="arrclip-name">${esc(c.name)}</span>${c.waveformKey?'<canvas class="clip-waveform" aria-hidden="true"></canvas>':''}</button>`).join('')}<div class="playhead" style="left:${state.position*12}px"></div></div></div>`).join('')}</div>`;drawWaveforms();}
function drawWaveforms(){if(!state||view!=='arrangement')return;for(const t of state.tracks)for(const c of t.arrangement||[]){const canvas=document.querySelector(`[data-op="arrclip"][data-target="${c.id}"] canvas`);if(canvas)ClipWaveform.draw(canvas,c,state.tempo);}}
// Meters change state at once; their levels, the position and the playhead are drawn in the next frame.
function meters(m){if(state){if(m.transport&&m.transport.epoch!==state.epoch)return;Object.assign(state,m.transport||{});state.position=m.position;for(const info of m.tracks||[]){const track=state.tracks.find(t=>t.id===info.id);if(track)for(const key of ['arm','canArm','implicitArm','frozen','playingSlotIndex','sessionRecording','sessionPlaying'])if(key in info)track[key]=info[key];}recordingTracker.update(state);}for(const t of m.tracks||[])if('level' in t||'left' in t||'right' in t)dirty.meters.set(t.id,Math.max(t.level||0,t.left||0,t.right||0));dirty.beat=m.position||0;dirty.recording=true;scheduleFrame();}
function drawMeters(beat,levels){const unit=4/(state?.signature?.[1]||4),bpb=(state?.signature?.[0]||4)*unit;if(beat!==null)$('#position').textContent=`${Math.floor(beat/bpb)+1}.${Math.floor((beat%bpb)/unit)+1}`;for(const [id,v]of levels){meterLevels.set(id,v);const el=meterFor(id);if(el&&meterShown.get(el)!==false)paintMeter(el,v);}if(beat!==null&&view==='arrangement')document.querySelectorAll('.playhead').forEach(e=>e.style.left=beat*12+'px');}
// Strip and meter elements by track id, so a frame does not search the document per track.
// render() and replaceStrips() replace them; a cached element that left the page is looked up again.
const stripCache=new Map(),meterCache=new Map(),laneCache=new Map();let statusCache=null;
function forgetStrips(){stripCache.clear();meterCache.clear();laneCache.clear();statusCache=null;meterLevels.clear();meterWatch?.disconnect();meterShown=new WeakMap();}
// Only meters on screen are drawn (a Set has far more strips than a phone shows, and every moving
// meter costs paint). One that scrolls into view shows its track's latest level at once.
const meterLevels=new Map();let meterShown=new WeakMap();
const meterWatch=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries){meterShown.set(e.target,e.isIntersecting);const v=meterLevels.get(Number(e.target.dataset.meter));if(e.isIntersecting&&v!==undefined)paintMeter(e.target,v);}},{rootMargin:'0px 120px'}):null;
function paintMeter(el,v){el.firstElementChild.style.transform=`scaleY(${Math.max(0,Math.min(1,v))})`;el.classList.toggle('clip',v>=.99);}
function recordingStatusFor(id){let list=statusCache?.get(id);if(!statusCache||list&&list.some(el=>!el.isConnected)){statusCache=new Map();for(const el of document.querySelectorAll('[data-recording-status]')){const key=Number(el.dataset.recordingStatus);if(!statusCache.has(key))statusCache.set(key,[]);statusCache.get(key).push(el);}list=statusCache.get(id);}return list||[];}
function laneFor(id){let el=laneCache.get(id);if(el===undefined||el&&!el.isConnected){el=document.querySelector(`.lane[data-track="${id}"] .region`);laneCache.set(id,el);}return el;}
function meterFor(id){let el=meterCache.get(id);if(el===undefined||el&&!el.isConnected||el===null&&view==='pinned'){el=document.querySelector(`[data-meter="${id}"]`);meterCache.set(id,el);if(el&&!meterShown.has(el))meterWatch?.observe(el);}return el;}
function stripFor(id){id=Number(id);let el=stripCache.get(id);if(!el||!el.isConnected){el=document.querySelector(`#main .session .track[data-track="${id}"]`);if(el)stripCache.set(id,el);else stripCache.delete(id);}return el;}
function updateRecordingUI(){
 if(!state||!hostOnline)return;
 $('#play').classList.toggle('active',state.playing);$('#record').classList.toggle('active',state.record);
 for(const track of state.tracks){
  const recording=recordingTracker.modes.get(track.id),text=recording?'● REC':'',title=recording==='arrangement'?(Number.isInteger(track.playingSlotIndex)?'Recording to Arrangement':'Recording inferred from the armed track and running Arrangement Record'):'Recording a Session clip';
  // Runs every frame while meters arrive, so unchanged text and attributes are not rewritten.
  for(const el of recordingStatusFor(track.id)){if(el.hidden!==!recording)el.hidden=!recording;if(el.textContent!==text)el.textContent=text;if(el.title!==title)el.title=title;}
  const lane=laneFor(track.id);if(!lane)continue;
  lane.querySelectorAll('.arrclip.is-recording').forEach(el=>el.style.width=Math.max(2,(state.position-Number(el.dataset.start))*12)+'px');
  const take=recordingTracker.preview(track);let preview=lane.querySelector('.recording-preview');
  if(!take){preview?.remove();continue;}
  if(!preview){preview=document.createElement('div');preview.className='recording-preview';preview.setAttribute('role','img');lane.append(preview);}
  preview.classList.toggle('finishing',!take.active);preview.style.left=take.start*12+'px';preview.style.width=Math.max(2,(take.end-take.start)*12)+'px';preview.textContent=take.active?'● Recording':'';
  preview.setAttribute('aria-label',`${track.name}: ${take.active?'recording in progress':'recording finishing'}`);
  preview.title=take.observed?'Recording progress since this controller observed the take. The finished clip replaces this preview; no audio waveform is streamed.':'Recording in progress';
 }
}
function openDrawer(title,html,kind,id){drawerVersion++;activeDrawer={kind,id};reportView();$('#drawerTitle').textContent=title;$('#drawerBody').innerHTML=html;delete $('#drawerBody').dataset.deviceMode;delete $('#drawerBody').dataset.deviceId;$('#drawer').hidden=false;updateDrawerPin();updateDrawerDeviceNav();}
// A tapped toggle shows at once and holds until Live answers, so an older snapshot still in
// flight cannot flick it back. Live's own change arrives as a patch (see applyPatch).
const holds=new Map();
function applyHolds(){for(const [key,value]of holds){const [id,op]=key.split(':'),t=trackBy(id);if(t)t[op]=value;}}
async function toggle(id,op){const t=trackBy(id);if(!t)return;const value=!t[op],key=id+':'+op;holds.set(key,value);t[op]=value;showToggles(t);const ok=await act('track_set',{target:id,property:op,value});if(holds.get(key)===value)holds.delete(key);if(ok===false){const now=trackBy(id);if(now){now[op]=!value;showToggles(now);}}}
function showToggles(t){for(const key of ['mute','solo','arm'])for(const b of document.querySelectorAll(`[data-op="${key}"][data-target="${t.id}"]`))b.classList.toggle('active',key==='mute'?!t.mute:!!t[key]);for(const c of document.querySelectorAll(`.track[data-track="${t.id}"] .clip`))c.classList.toggle('armed',!!t.arm);}
// Live's launch states: triggered (waiting for the launch quantum), playing, and stopping (a stop is
// waiting for the quantum: fired_slot_index -2). They change before the audio does, so they show first.
function showClips(t){const stopping=t.firedSlotIndex===-2;for(const c of t.clips)for(const b of document.querySelectorAll(`[data-op="clip_fire"][data-target="${c.id}"]`)){b.classList.toggle('playing',!!c.playing);b.classList.toggle('triggered',!!c.triggered);b.classList.toggle('stopping',stopping&&!!c.playing);b.classList.remove('queued');}for(const b of document.querySelectorAll(`.trackstop[data-target="${t.id}"]`))b.classList.toggle('stopping',stopping);}
function showParameter(p){if(dragging)return;for(const input of document.querySelectorAll(`[data-param="${p.id}"]`))if(DeviceGestures.owned(p.id)&&parameterSync.status(p.id)!=='pending')input.value=p.value;for(const out of document.querySelectorAll(`[data-read="${p.id}"]`))if(parameterSync.status(p.id)!=='pending')out.textContent=DeviceUI.formatDisplay(p.display);}
// Patches are single changes observed in Live. They update the DOM in place: rebuilding
// every strip for one mute would be the slowest part of the round trip on a large Set.
// Where a command's round trip went: Max and Live as the bridge measured them, and the way there
// and back. The legs use wall clocks, so across machines only their sum is exact.
function ackSplit(p,m,total){if(!Number.isFinite(m.liveMs))return null;const out={totalMs:Math.round(total),liveMs:m.liveMs};if(Number.isFinite(m.bridgeAt)&&Number.isFinite(m.doneAt)){out.upMs=m.bridgeAt-p.wall;out.downMs=Math.round(total)-out.liveMs-out.upMs;}return out;}
// The last patches as they arrived: when Live sent each, when Node forwarded it, when it got here.
// Across machines the clocks differ, so only same-machine legs are exact.
const patchLog=window.__patches=[];
function logPatch(m){if(!Number.isFinite(m.liveAt))return;const at=Date.now(),e={liveAt:m.liveAt,bridgeMs:Number.isFinite(m.bridgeAt)?m.bridgeAt-m.liveAt:null,arriveMs:at-(m.bridgeAt||m.liveAt),at,tracks:(m.tracks||[]).map(t=>t.id).concat((m.replace||[]).map(t=>t.id)),song:!!m.song,devices:(m.devices||[]).map(d=>d.id)};patchLog.push(e);if(patchLog.length>50)patchLog.shift();requestAnimationFrame(()=>{e.drawnMs=Date.now()-at;});}
// Patches are numbered from the snapshot on. A skipped number means one was lost: fetch the Set again.
function patchGap(m){if(!Number.isInteger(m.seq))return;if(Number.isInteger(state.seq)&&m.seq!==state.seq+1)act('refresh');state.seq=m.seq;}
// Patches change state as they arrive and only mark what they touched; drawFrame() shows it.
function applyPatch(m){if(!state||m.transport?.epoch!==state.epoch)return;logPatch(m);
 for(const info of m.tracks||[]){const t=trackBy(info.id);if(!t)continue;
  let toggles=false;for(const key of ['mute','solo','arm'])if(key in info&&!holds.has(t.id+':'+key)){t[key]=info[key];toggles=true;}if(toggles)dirty.toggles.add(t.id);
  if('playingSlotIndex' in info||'firedSlotIndex' in info){for(const c of t.clips){if('playingSlotIndex' in info)c.playing=!!c.clipId&&c.index===info.playingSlotIndex;if('firedSlotIndex' in info)c.triggered=c.index===info.firedSlotIndex;}if('playingSlotIndex' in info)t.playingSlotIndex=info.playingSlotIndex;if('firedSlotIndex' in info)t.firedSlotIndex=info.firedSlotIndex;dirty.clips.add(t.id);}
  for(const next of info.params||[]){const p=[t.volume,t.pan,...t.sends].find(p=>p?.id===next.id);if(p){p.value=next.value;p.display=next.display;parameterSync.reconcile({parameters:[p]});dirty.params.set(p.id,t.id);}}
 }
 // A structural change in Live (a rename, a device added or switched off, a clip created) arrives
 // as the whole changed track; only that strip is rebuilt.
 if(Array.isArray(m.replace)){const changed=[];for(const next of m.replace){const i=state.tracks.findIndex(t=>t.id===next?.id);if(i<0||!Array.isArray(next.clips))continue;
   if(scenePage&&sceneOffset)next.clips=state.tracks[i].clips; // This browser shows another scene page.
   state.tracks[i]=next;parameterSync.reconcile({parameters:[next.volume,next.pan,...next.sends]});changed.push(next.id);}
  if(changed.length){applyHolds();if(view==='session'||view==='mixer')for(const id of changed)dirty.strips.add(id);else if(view!=='pinned')dirty.render=true;dirty.head=dirty.clipDrawer=true;}}
 if(m.song){const {scenes,...song}=m.song;Object.assign(state,song);dirty.head=dirty.recording=true;
  // First-page scene names and colours; another page reloads itself on m.pages.
  if(Array.isArray(scenes)&&!sceneOffset&&JSON.stringify(scenes)!==JSON.stringify(state.scenes)){state.scenes=scenes;if(view==='session')dirty.render=true;}}
 if(m.pages&&sceneOffset)loadScenePage();
 applySceneStates(m.sceneTriggered);applyDevicePatches(m.devices);
 if(view==='pinned')dirty.pinned=true;recordingTracker.update(state);scheduleFrame();
}
// A scene waiting for the launch quantum, on whichever page this browser shows.
function applySceneStates(states){if(!states)return;for(const [id,on]of Object.entries(states)){for(const s of [...state.scenes,...(scenePage?.scenes||[])])if(s.id===Number(id))s.triggered=on;for(const b of document.querySelectorAll(`[data-op="scene_fire"][data-target="${id}"]`)){b.classList.toggle('triggered',on);b.classList.remove('queued');}}}
// Live watches the devices this browser shows (see sendView): parameter moves arrive here, and a
// changed parameter list asks for the device again.
// With device views Live pushes every change, so a device is fetched once and then only checked
// rarely, in case a change was missed.
let devicePaint=0;const DEVICE_SAFETY_MS=30000;
function applyDevicePatches(list){if(!Array.isArray(list))return;
 for(const next of list){const model=deviceModels.get(next.id)?.data;
  if(next.changed){if(activeDrawer?.kind==='device'&&activeDrawer.id===next.id)loadDevice(next.id,drawerVersion);else if(model)deviceModels.get(next.id).at=0;continue;}
  if(!model)continue;for(const v of next.params||[]){const p=model.parameters.find(p=>p.id===v.id);if(p){p.value=v.value;p.display=v.display;}}parameterSync.reconcile(model);}
 if(list.some(d=>d.changed&&view==='pinned'))pollPinnedDevices();
 if(!devicePaint)devicePaint=requestAnimationFrame(()=>{devicePaint=0;updateDevicePanels();});}
// Read-only, for tests: the open device panel's model (the bundle hides these names).
window.__openDevice=()=>activeDrawer?.kind==='device'?deviceModels.get(activeDrawer.id)?.data||null:null;
function deviceViews(){return state?.capabilities?.includes('device-views');}
// One paint per frame. Messages only change state and mark what changed (keyed by track or
// parameter, latest value wins, so a hidden tab's backlog stays bounded); drawFrame() reads the
// current state. ACKs never wait for it. A hidden tab gets no frames, so returning draws at once.
const newDirty=()=>({meters:new Map(),beat:null,toggles:new Set(),clips:new Set(),params:new Map(),strips:new Set(),render:false,head:false,recording:false,clipDrawer:false,pinned:false});
let dirty=newDirty(),frame=0;
const nextFrame=typeof requestAnimationFrame==='function'?fn=>requestAnimationFrame(fn):fn=>setTimeout(fn,16),cancelFrame=typeof cancelAnimationFrame==='function'?id=>cancelAnimationFrame(id):id=>clearTimeout(id);
function scheduleFrame(){if(!frame)frame=nextFrame(drawFrame);}
// A new snapshot redraws everything from state, so earlier per-track marks are superseded.
function redrawAll(){const levels=dirty.meters,beat=dirty.beat;dirty=newDirty();dirty.meters=levels;dirty.beat=beat;dirty.render=true;scheduleFrame();}
function drawFrame(){
 if(frame){cancelFrame(frame);frame=0;}
 const d=dirty;dirty=newDirty();if(!state)return;
 let rebuilt=false;if(d.render){render();rebuilt=!dragging;}
 if(!rebuilt){
  for(const id of d.toggles){const t=trackBy(id);if(t)showToggles(t);}
  for(const id of d.clips){const t=trackBy(id);if(t)showClips(t);}
  for(const [id,track]of d.params){const t=trackBy(track),p=t&&[t.volume,t.pan,...t.sends].find(p=>p?.id===id);if(p)showParameter(p);}
  if(d.strips.size)replaceStrips([...d.strips]);
 }
 if(!d.render){if(d.head)renderHead();if(d.clipDrawer)syncClipDrawer();}
 drawMeters(d.beat,d.meters);
 if(!d.render){if(d.recording)updateRecordingUI();if(d.pinned&&view==='pinned')renderPinned();}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&frame)drawFrame();});
// An open clip panel follows its slot when Live creates or deletes the clip.
function syncClipDrawer(){if(activeDrawer?.kind==='clip'&&!dragging&&!$('#drawerBody input:focus')){const t=state.tracks.find(t=>t.clips.some(c=>c.id===activeDrawer.id)),c=t?.clips.find(c=>c.id===activeDrawer.id);if(c&&c.clipId!==activeDrawer.clipId)clipPanel(c,t);}}
// A strip being touched is left alone until the finger lifts; replacing it would end the gesture.
const staleStrips=new Set();let pointerIn=null;
document.addEventListener('pointerdown',e=>{pointerIn=e.target.closest?.('.track[data-track]')||null;},{capture:true});
addEventListener('pointerup',()=>{pointerIn=null;if(staleStrips.size)setTimeout(()=>replaceStrips([...staleStrips]),0);},{capture:true});
addEventListener('pointercancel',()=>{pointerIn=null;},{capture:true});
function replaceStrips(ids){
 for(const id of ids){const t=trackBy(id),el=stripFor(id);staleStrips.delete(id);
  if(!t)continue;if(!el){render();return;}
  if(pointerIn===el||el.contains(document.activeElement)&&document.activeElement.matches('input[type=text],input[type=search],textarea,select')){staleStrips.add(id);continue;}
  const holder=document.createElement('div');holder.innerHTML=strip(t);const next=holder.firstElementChild,level=el.querySelector('.meter i')?.style.transform;if(level){const i=next.querySelector('.meter i');if(i)i.style.transform=level;}const old=meterCache.get(Number(id));if(old)meterWatch?.unobserve(old);el.replaceWith(next);stripCache.set(Number(id),next);meterCache.delete(Number(id));const meter=meterLevels.has(Number(id))&&meterFor(Number(id));if(meter)paintMeter(meter,meterLevels.get(Number(id)));} // The meter keeps its level until the next reading.
 updateRecordingUI();
}
// Live watches clips only for tracks some browser has on screen, so each browser reports its view.
let viewKey='',viewAt=0,viewTimer=0,viewUnsupported=false;
function reportView(){clearTimeout(viewTimer);viewTimer=setTimeout(sendView,150);}
function sendView(){
 if(viewUnsupported||!state||!hostOnline||!snapshotReady||!state.capabilities?.includes('views'))return;
 const main=$('#main'),box=main.getBoundingClientRect(),ids=[];
 for(const el of main.querySelectorAll('.track[data-track],.lane[data-track]')){const r=el.getBoundingClientRect();if(r.right>box.left&&r.left<box.right&&r.bottom>box.top&&r.top<box.bottom)ids.push(Number(el.dataset.track));}
 const devices=shownDevices(),key=ids.join()+'|'+sceneOffset+'|'+devices.join()+'|'+state.epoch;if(key===viewKey&&Date.now()-viewAt<10000)return;viewKey=key;viewAt=Date.now();
 send('view',{tracks:ids.slice(0,48),offset:sceneOffset,devices}).catch(e=>{if(/Unsupported operation/.test(e.message))viewUnsupported=true;else viewKey='';});
}
// Scroll does not bubble, so it is caught on the way down.
document.addEventListener('scroll',e=>{if(e.target?.id==='main')reportView();},{capture:true,passive:true});addEventListener('resize',reportView);setInterval(sendView,5000);
// The open device and, on the Pinned page, the pinned ones: Live observes their parameters.
function shownDevices(){const out=activeDrawer?.kind==='device'?[activeDrawer.id]:[];if(view==='pinned')for(const p of pins.items)if(p.kind==='device'&&pinTarget(p)&&!out.includes(p.id))out.push(p.id);return out.slice(0,8);}
function trackBy(id){return state.tracks.find(t=>t.id===Number(id));}
function field(label,input){return `<label class="field"><span>${label}</span>${input}</label>`;}
// Match the order of the track's device buttons, including nested rack chains.
function neighbouringDevices(){
 if(activeDrawer?.kind!=='device')return null;
 const location=deviceLocation(activeDrawer.id);if(!location)return null;
 const order=[];function visit(devices){for(const d of devices||[]){order.push(d);for(const chain of d.chains||[])visit(chain.devices);}}
 visit(location.track.devices);
 const index=order.findIndex(d=>d.id===activeDrawer.id);
 return {previous:order[index-1],next:order[index+1]};
}
function updateDrawerDeviceNav(){
 const nav=$('#drawerDeviceNav'),neighbours=neighbouringDevices();nav.hidden=!neighbours;
 if(!neighbours)return;
 for(const direction of ['previous','next']){
  const button=nav.querySelector(`[data-op="device_${direction}"]`);if(!button)continue;
  const target=neighbours[direction];
  button.disabled=!target;
  button.title=target?.name||`No ${direction} device on this track`;
 }
}
function openDeviceDrawer(id){
 const location=deviceLocation(id);if(!location)return;
 deviceDetails=currentDevice(id);
 openDrawer(location.device.name,'<p class="hint">Reading parameters from Live…</p>','device',id);
 $('#drawer').scrollTop=0;
 if(deviceDetails)renderDevice();
 loadDevice(id,drawerVersion);
}
async function loadDevice(id,version){deviceBusy=true;devicePoll=Date.now();try{const d=await send('device_get',{target:id});if(version!==drawerVersion||activeDrawer?.kind!=='device'||activeDrawer.id!==id)return;deviceDetails=rememberDevice(d);renderDevice();}catch(e){if(version===drawerVersion)toast(e.message);}finally{deviceBusy=false;}}
function parameterControl(p){const attr=`data-param="${p.id}" aria-label="${esc(p.name)}" ${p.enabled?'':'disabled'}`;if(p.quantized&&p.items?.length&&p.items.length===p.max-p.min+1)return `<select ${attr}>${p.items.map((v,i)=>`<option value="${p.min+i}" ${p.min+i===p.value?'selected':''}>${esc(v)}</option>`).join('')}</select>`;return `<input type="range" min="${p.min}" max="${p.max}" step="${p.quantized?1:(p.max-p.min)/1000||.001}" value="${p.value}" ${attr}>`;}
function deviceClass(id){let found='';function visit(list){for(const d of list||[]){if(d.id===id)found=d.className;for(const c of d.chains||[])visit(c.devices);}}for(const t of state?.tracks||[])visit(t.devices);return found;}
function deviceProfile(d){return DeviceUI.find(d,d.className||deviceClass(d.id));}
function utilityView(d){return UtilityProfile.matches(d,d.className||deviceClass(d.id));}
function renderDevice(){const d=deviceDetails;if(!d||d.id!==activeDrawer?.id)return;$('#drawerTitle').textContent=d.name;const root=$('#drawerBody'),profile=deviceProfile(d),mode=(profile?.spec.id||'generic')+':'+!!activeDrawer.allParameters;if(root.dataset.deviceMode===mode&&root.dataset.deviceId===String(d.id)){DeviceUI.update(root,d,id=>parameterSync.status(id));return;}if(dragging||root.querySelector('input:focus,select:focus'))return;$('#drawerTitle').textContent=d.name;updateDrawerPin();const scroll=$('#drawer').scrollTop;root.innerHTML=(!profile||activeDrawer.allParameters?`<input id="paramsearch" type="search" placeholder="Find a parameter…" aria-label="Search device parameters" value="${esc(activeDrawer.search||'')}">`:'')+genericDeviceBody(d,activeDrawer.allParameters,activeDrawer.search)+`<div class="section actions"><button data-op="device_add_here"><span aria-hidden="true">＋</span> Add device</button><button class="danger" data-op="device_delete" data-target="${d.id}">Delete device</button></div>`;root.dataset.deviceMode=mode;root.dataset.deviceId=d.id;DeviceUI.update(root,d,id=>parameterSync.status(id));$('#drawer').scrollTop=scroll;}

function filterParameters(q){document.querySelectorAll('#drawerBody .parameter[data-name]').forEach(p=>p.hidden=!p.dataset.name.includes(q.toLowerCase()));}
function trackDrawer(id){const t=trackBy(id);if(!t)return;openDrawer(t.name,`${field('Name',`<input data-edit="track_name" data-target="${id}" value="${esc(t.name)}">`)}${field('Color',`<input type="color" data-edit="track_color" data-target="${id}" value="${color(t.color)}">`)}${t.monitor!==null?field('Monitor',`<select data-edit="monitor" data-target="${id}">${['In','Auto','Off'].map((s,i)=>`<option value="${i}" ${i===t.monitor?'selected':''}>${s}</option>`).join('')}</select>`):''}<div class="actions">${t.canArm?`<button data-op="arm" data-target="${id}">${t.arm?'Disarm':'Arm for recording'}</button>`:''}<button data-op="track_stop" data-target="${id}">Stop clips</button><button data-op="routing" data-target="${id}">Routing</button></div><div class="section"><h3>Devices</h3>${deviceButtons(t.devices)||'<p class="hint">No devices on this track.</p>'}<button class="adddevice" data-op="device_browser" data-target="${id}">＋ Add device</button></div>${t.kind!=='master'?`<div class="section actions">${t.kind==='track'?`<button data-op="duplicate_track" data-target="${id}" ${t.isBridge?'disabled':''}>Duplicate track</button>`:''}<button class="danger" data-op="delete_track" data-target="${id}" ${t.isBridge?'disabled':''}>Delete track</button></div>`:''}`,'track',id);}
function clipDrawer(track,id){const t=trackBy(track),c=t.clips.find(c=>c.id===Number(id));if(!c)return;clipPanel(c,t);}
function clipPanel(c,t){openDrawer(c.name||`Empty slot · ${t.name}`,`<div class="actions"><button data-op="clip_fire" data-target="${c.id}">${c.clipId?'▶ Launch':t.arm?'● Record clip':'Launch'}</button><button data-op="clip_stop" data-target="${c.id}">■ Stop</button></div>${c.clipId?`${field('Name',`<input value="${esc(c.name)}" data-edit="clip_name" data-target="${c.clipId}">`)}${field('Loop',`<input type="checkbox" ${c.looping?'checked':''} data-edit="clip_loop" data-target="${c.clipId}">`)}${field('Muted',`<input type="checkbox" ${c.muted?'checked':''} data-edit="clip_mute" data-target="${c.clipId}">`)}${field('Loop start',`<input type="number" min="0" step=".25" value="${c.loopStart}" data-edit="clip_field" data-property="loop_start" data-target="${c.clipId}">`)}${field('Loop end',`<input type="number" min=".25" step=".25" value="${c.loopEnd}" data-edit="clip_field" data-property="loop_end" data-target="${c.clipId}">`)}${field('Launch mode',`<select data-edit="clip_field" data-property="launch_mode" data-target="${c.clipId}">${['Trigger','Gate','Toggle','Repeat'].map((v,i)=>`<option value="${i}" ${i===c.launchMode?'selected':''}>${v}</option>`).join('')}</select>`)}<p class="hint">Length: ${c.length} beats</p>${c.midi?`<button data-op="notes" data-target="${c.clipId}" data-length="${c.length}">♪ Edit MIDI notes</button>`:''}<div class="actions"><button data-op="clip_double" data-target="${c.clipId}">Double loop</button><button data-op="clip_quantize" data-target="${c.clipId}">Quantize 1/16</button><button data-op="clip_duplicate" data-track="${t.id}" data-index="${c.index}">Duplicate to next slot</button><button data-op="clip_to_arrangement" data-track="${t.id}" data-clip="${c.clipId}">Copy to Arrangement</button><button class="danger" data-op="clip_delete" data-target="${c.id}">Delete clip</button></div>`:t.midi?`<p class="hint">Create an empty MIDI clip, or arm the track and press Record.</p>${field('Length in beats','<input id="cliplength" type="number" min=".25" max="1024" value="4">')}<button data-op="clip_create" data-target="${c.id}">Create MIDI clip</button>`:'<p class="hint">Arm this audio track, select its input in Routing, then press Record. Recording uses Live’s configured input and launch quantization.</p>'}`,'clip',c.id);activeDrawer.clipId=c.clipId;}
function settings(){openDrawer('Live Set',`${field('Launch quantization',`<select data-edit="song" data-property="clip_trigger_quantization">${['None','8 bars','4 bars','2 bars','1 bar','1/2','1/2 triplet','1/4','1/4 triplet','1/8','1/8 triplet','1/16','1/16 triplet','1/32'].map((s,i)=>`<option value="${i}" ${i===state.quantization?'selected':''}>${s}</option>`).join('')}</select>`)}${field('Loop',`<input data-edit="song" data-property="loop" type="checkbox" ${state.loop?'checked':''}>`)}${field('Loop start (beats)',`<input type="number" min="0" step="1" value="${state.loopStart}" data-edit="song" data-property="loop_start">`)}${field('Loop length',`<input type="number" min=".25" step="1" value="${state.loopLength}" data-edit="song" data-property="loop_length">`)}${field('Punch in',`<input type="checkbox" data-edit="song" data-property="punch_in" ${state.punchIn?'checked':''}>`)}${field('Punch out',`<input type="checkbox" data-edit="song" data-property="punch_out" ${state.punchOut?'checked':''}>`)}${field('Automation arm',`<input type="checkbox" data-edit="song" data-property="session_automation_record" ${state.automationArm?'checked':''}>`)}${field('MIDI overdub',`<input type="checkbox" data-edit="song" data-property="overdub" ${state.overdub?'checked':''}>`)}${field('Session record',`<input type="checkbox" data-edit="song" data-property="session_record" ${state.sessionRecord?'checked':''}>`)}${field('Beats per bar',`<input type="number" min="1" max="32" value="${state.signature[0]}" data-edit="song" data-property="signature_numerator">`)}${field('Beat unit',`<select data-edit="song" data-property="signature_denominator">${[1,2,4,8,16].map(n=>`<option value="${n}" ${n===state.signature[1]?'selected':''}>1/${n}</option>`).join('')}</select>`)}<div class="section actions"><button data-op="capture_midi">Capture MIDI</button><button data-op="re_enable_automation">Re-enable automation</button><button data-op="continue">Continue playback</button></div><p class="hint">Arrangement recording is the red button in the transport. To record a Session clip, arm a track and tap an empty slot. Input monitoring and routing are in each track’s menu.</p><p class="hint">Your session link is a private remote-control key. Share it only with people you want to control this set. Sessions expire after 24 hours.</p>`,'settings');}
async function routing(id){const version=drawerVersion;try{const r=await send('routing_get',{target:Number(id)});if(version!==drawerVersion)return;let html='';for(const [key,label,prop] of [['inputs','Audio/MIDI input','input_routing_type'],['inputChannels','Input channel','input_routing_channel'],['outputs','Output','output_routing_type'],['outputChannels','Output channel','output_routing_channel']]){const data=r[key];let arr=Array.isArray(data)?data:Object.values(data||{}).find(Array.isArray)||[];html+=field(label,`<select data-edit="routing" data-property="${prop}" data-target="${id}"><option value="">Choose…</option>${arr.map(x=>`<option value="${esc(JSON.stringify(x))}" ${Object.values(r[{inputs:'input',inputChannels:'inputChannel',outputs:'output',outputChannels:'outputChannel'}[key]]||{}).some(v=>v.identifier===x.identifier)?'selected':''}>${esc(x.display_name||x.name||x.identifier)}</option>`).join('')}</select>`);}openDrawer('Routing · '+trackBy(id).name,html+'<p class="hint">Available choices come from Live. Reopen this panel after changing a routing type to refresh its channels.</p>','routing',id);}catch(e){toast(e.message);}}
const catalog={
 'MIDI effects':['Arpeggiator','Chord','MIDI Effect Rack','Note Length','Pitch','Random','Scale','Velocity'],
 'Instruments':['Analog','Collision','Drift','Drum Rack','Electric','Impulse','Instrument Rack','Meld','Operator','Sampler','Simpler','Tension','Wavetable'],
 'Audio effects':['Amp','Audio Effect Rack','Auto Filter','Auto Pan','Beat Repeat','Cabinet','Channel EQ','Chorus-Ensemble','Compressor','Corpus','Delay','Drum Buss','Dynamic Tube','Echo','EQ Eight','EQ Three','Erosion','Filter Delay','Gate','Glue Compressor','Grain Delay','Hybrid Reverb','Limiter','Multiband Dynamics','Overdrive','Pedal','Phaser-Flanger','Redux','Resonators','Reverb','Roar','Saturator','Shifter','Spectral Resonator','Spectral Time','Spectrum','Tuner','Utility','Vocoder']};
function deviceBrowser(id){const track=trackBy(id);if(!track)return;openDrawer('Add device · '+track.name,`<input id="devicesearch" type="search" placeholder="Search Live devices…" aria-label="Search devices" autocomplete="off"><div id="devicecatalog"></div><p class="hint">Native Live devices only. Availability depends on your Live edition. Samples, presets, plug-ins and Max devices must be loaded in Live.</p>`,'browser',id);$('#drawer').scrollTop=0;filterDevices('');if(!matchMedia('(pointer:coarse)').matches)$('#devicesearch').focus({preventScroll:true});}
function filterDevices(q){
 const track=trackBy(activeDrawer.id);
 const categories=track?.midi?['Instruments','MIDI effects','Audio effects']:['Audio effects','Instruments','MIDI effects'];
 const query=q.trim().toLowerCase();
 $('#devicecatalog').innerHTML=categories.map(cat=>{const hits=catalog[cat].filter(n=>n.toLowerCase().includes(query));return hits.length?`<h3>${cat}</h3><div class="catalog">${hits.map(n=>`<button data-op="device_insert" data-name="${esc(n)}" data-target="${activeDrawer.id}">${esc(n)}</button>`).join('')}</div>`:'';}).join('')||'<p class="hint">No matching native devices.</p>';}
let noteModel=[],noteClip=0,noteLength=4,noteRoot=60,noteGrid=.25;
async function notes(id,length){const version=drawerVersion;try{const data=await send('clip_notes_get',{target:id});if(version!==drawerVersion)return;noteModel=data.notes||[];noteClip=id;noteLength=length||noteLength;openDrawer('MIDI note editor',`<div class="notecontrols">${field('Lowest pitch',`<select id="noteroot">${[36,48,60,72,84].map(n=>`<option value="${n}" ${n===noteRoot?'selected':''}>C${n/12-2}</option>`).join('')}</select>`)}${field('Grid',`<select id="notegrid"><option value="0.25">1/16</option><option value="0.5">1/8</option><option value="1">1/4</option></select>`)}${field('Velocity','<input id="notevelocity" type="number" min="1" max="127" value="100">')}</div><p class="hint">Tap an empty cell to add a note; tap a note to remove it. Scroll for longer clips.</p><div id="pianoroll"></div><p class="hint" id="notecount"></p>`,'notes',id);$('#notegrid').value=noteGrid;drawNotes();}catch(e){toast(e.message);}}
function pitchName(p){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][p%12]+(Math.floor(p/12)-2);}
function drawNotes(){const steps=Math.min(256,Math.ceil(noteLength/noteGrid));$('#pianoroll').innerHTML=`<div class="pianogrid" style="--steps:${steps}"><label class="pitchkey">Beat</label>${Array.from({length:steps},(_,j)=>`<span class="gridbeat">${j%(1/noteGrid)===0?Math.floor(j*noteGrid)+1:''}</span>`).join('')}${Array.from({length:13},(_,i)=>{const pitch=noteRoot+12-i;return `<label class="pitchkey ${[1,3,6,8,10].includes(pitch%12)?'black':''}">${pitchName(pitch)}</label>${Array.from({length:steps},(_,j)=>{const n=noteModel.find(n=>n.pitch===pitch&&n.start_time>=j*noteGrid-.001&&n.start_time<(j+1)*noteGrid-.001);return `<button class="notecell ${n?'filled':''} ${j%(1/noteGrid)===0?'beat':''}" data-op="note_toggle" data-pitch="${pitch}" data-start="${j*noteGrid}" ${n?`data-note="${n.note_id}"`:''} aria-label="${pitchName(pitch)}, beat ${(j*noteGrid+1).toFixed(2)}${n?', remove note':''}">${n?'●':''}</button>`;}).join('')}`;}).join('')}</div>`;$('#notecount').textContent=`${noteModel.length} ${noteModel.length===1?'note':'notes'} · ${noteLength} beats${noteLength/noteGrid>256?' · showing first '+(256*noteGrid)+' beats':''}`;}
DeviceGestures.configure(busy=>{dragging=busy;},()=>hostOnline);
DeviceGestures.installTouchGuard();
// Range gestures are handled below; suppress native absolute-position scrubbing.
window.addEventListener('blur',()=>{if(DeviceGestures.busy())resetInteractions();});
window.addEventListener('focus',()=>{if(state&&hostOnline)act('refresh');});

function syncState(id,status){const nodes=new Set(document.querySelectorAll(`[data-control="${id}"],[data-value="${id}"],[data-read="${id}"],[data-param="${id}"],[data-target="${id}"]`));for(const node of nodes){node.dataset.syncState=status;node.setAttribute('aria-busy',String(status==='pending'));const group=node.closest('.parameter');if(group)group.dataset.syncState=status;}}
const parameterSync=new ParameterSync({
 send:(target,value)=>send('parameter',{target,value,display:true}),
 commit:(target,result)=>{if(!result||typeof result!=='object')throw Error('Live returned an invalid parameter acknowledgement');updateParameter(target,result.value,result.display);document.querySelectorAll(`[data-value="${target}"],[data-read="${target}"]`).forEach(n=>n.textContent=DeviceUI.formatDisplay(result.display));devicePoll=0;updateDevicePanels();},
 state:syncState,error:e=>{devicePoll=0;toast(e.message);}
});
// One cancellation boundary for parameter queues, view queues, gesture streams
// and outstanding reads. Nothing from the old connection may resume afterward.
function resetInteractions(){
 interactionGeneration++;sceneRead=null;tempoEdit=null;DeviceGestures.clear();parameterSync.reset();EQ8Profile.reset();EchoProfile.reset();
 rejectPending('Live connection or set changed');
}
function updateWriteAvailability(){
 for(const button of document.querySelectorAll('[data-op="tempo_up"],[data-op="tempo_down"]'))button.disabled=!hostOnline;
 for(const el of document.querySelectorAll('input[data-param],select[data-param],[data-knob-input],[data-op="reset_parameter"],[data-op="utility_switch"]')){
  const id=Number(el.dataset.param||el.dataset.knobInput||el.dataset.target),p=parameterBy(id);el.disabled=!hostOnline||!p?.enabled;
 }
 for(const face of document.querySelectorAll('[data-device-face]'))face.setAttribute('aria-disabled',String(!hostOnline));
}
function writeParameter(target,value,pointer){
 target=Number(target);value=Number(value);const p=parameterBy(target);
 if(!p?.enabled||!DeviceGestures.canWrite(target,pointer))return false;
 updateParameter(target,value);parameterSync.write(target,value);updateDevicePanels();return true;
}
document.addEventListener('input',e=>{
 if(e.target.id==='tempo'){tempoEdit={text:e.target.value};return;}
 if(e.target.id==='paramsearch'){activeDrawer.search=e.target.value;filterParameters(e.target.value);return;}
 if(e.target.id==='devicesearch'){filterDevices(e.target.value);return;}
 const id=Number(e.target.dataset.param);if(!id||e.target.tagName==='SELECT')return;
 const p=parameterBy(id),value=Number(e.target.value),owner=e.gesturePointer;
 if(!p?.enabled||!DeviceGestures.canWrite(id,owner)){if(p)e.target.value=p.value;return;}
 if(Object.is(p.value,value))return;
 const knob=e.target.closest('.ut-knob');if(knob)knob.style.setProperty('--turn',(-135+270*(value-Number(e.target.min))/(Number(e.target.max)-Number(e.target.min)))+'deg');
 parameterSync.preview(id,value);updateParameter(id,value);updateDevicePanels();
 DeviceGestures.stream(id,value,writeParameter,owner);
});

document.addEventListener('change',e=>{if(e.target.id==='noteroot'){noteRoot=Number(e.target.value);drawNotes();return;}if(e.target.id==='notegrid'){noteGrid=Number(e.target.value);drawNotes();return;}if(e.target.dataset.param&&e.target.tagName==='SELECT'){writeParameter(Number(e.target.dataset.param),Number(e.target.value));return;}const d=e.target.dataset,v=e.target.type==='checkbox'?e.target.checked:e.target.value,id=Number(d.target);if(e.target.id==='tempo')commitTempo(e.target);else if(d.edit==='song')act('song_set',{property:d.property,value:typeof v==='boolean'?v:Number(v)});else if(d.edit==='scene_name')act('scene_rename',{target:id,value:v});else if(d.edit==='track_name')act('track_set',{target:id,property:'name',value:v});else if(d.edit==='track_color')act('track_set',{target:id,property:'color',value:parseInt(v.slice(1),16)});else if(d.edit==='monitor')act('track_set',{target:id,property:'current_monitoring_state',value:Number(v)});else if(d.edit==='clip_field')act('clip_set',{target:id,property:d.property,value:Number(v)});else if(d.edit==='clip_name')act('clip_set',{target:id,property:'name',value:v});else if(d.edit==='clip_loop'||d.edit==='clip_mute')act('clip_set',{target:id,property:d.edit==='clip_loop'?'looping':'muted',value:v});else if(d.edit==='routing'&&v)act('routing_set',{target:id,property:d.property,value:JSON.parse(v)});});
function closeDrawer(){drawerVersion++;$('#drawer').hidden=true;activeDrawer=null;}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-op],[data-view]');if(!el)return;if(el.dataset.view){view=el.dataset.view;if(view==='pinned')closeDrawer();try{if(view==='pinned')sessionStorage.setItem(pinnedViewKey,'1');else sessionStorage.removeItem(pinnedViewKey);}catch{}updateViewButtons();render();reportView();if(view==='pinned')pollPinnedDevices();return;}const op=el.dataset.op,id=Number(el.dataset.target);if(op==='close'){closeDrawer();reportView();return;}if(op==='share'){try{await navigator.clipboard.writeText(location.href);toast('Private session link copied');}catch{openDrawer('Controller link',`<p class="hint">Select this link to copy or share it.</p><input id="sharelink" type="text" readonly value="${esc(location.href)}" aria-label="Controller link">`,'share');$('#sharelink').focus();$('#sharelink').select();}return;}if(!state){toast('Waiting for Live');return;}
 if(op==='tempo_down'||op==='tempo_up'){stepTempo(op==='tempo_up'?1:-1);return;}
 if(op==='pin_toggle'){togglePin(el.dataset.pinKind,id);return;}
 if(op==='device_help'){toast(el.dataset.help);return;}
 if(op==='device_parameter_view'){const card=el.closest('.pinned-card');if(card){const device=Number(card.dataset.device);pinnedAll.has(device)?pinnedAll.delete(device):pinnedAll.add(device);renderPinned();}else if(activeDrawer?.kind==='device'){activeDrawer.allParameters=!activeDrawer.allParameters;renderDevice();}return;}
 if(op==='utility_switch'){const p=parameterBy(id);if(!p||!p.enabled||!DeviceGestures.canWrite(id))return;const value=el.getAttribute('aria-pressed')==='true'?p.min:p.max;p.value=value;el.setAttribute('aria-pressed',String(value===p.max));el.classList.toggle('selected',value===p.max);parameterSync.preview(id,value);writeParameter(id,value);return;}
 if(op==='back_arrangement'){act('song_set',{property:'back_to_arranger',value:false});return;}if(op==='reset_parameter'){writeParameter(id,Number(el.dataset.value));return;}if(op==='device_browser'){deviceBrowser(id);return;}
 if(op==='device_previous'||op==='device_next'){const target=neighbouringDevices()?.[op==='device_previous'?'previous':'next'];if(target)openDeviceDrawer(target.id);return;}
 if(op==='device_add_here'){const location=activeDrawer?.kind==='device'&&deviceLocation(activeDrawer.id);if(location)deviceBrowser(location.track.id);return;}
 if(op==='device_insert'){
  const version=drawerVersion;el.disabled=true;
  try{
   const inserted=await send(op,{target:id,name:el.dataset.name});
   // The acknowledgement can arrive before the track with the new device.
   const deadline=Date.now()+3000;
   while(version===drawerVersion&&!deviceLocation(inserted)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,75));
   if(version===drawerVersion&&deviceLocation(inserted))openDeviceDrawer(inserted);
   toast('Device added');
  }catch(e){toast(e.message);}finally{el.disabled=false;}return;
 }
 if(op==='device_delete'){if(confirm('Delete this device?')){const version=drawerVersion;try{await send(op,{target:id});if(version===drawerVersion&&activeDrawer?.kind==='device'&&activeDrawer.id===id){drawerVersion++;$('#drawer').hidden=true;activeDrawer=null;}toast('Device deleted');}catch(e){toast(e.message);}}return;}
 if(op==='notes'){notes(id,Number(el.dataset.length));return;}
 if(op==='note_toggle'){el.disabled=true;try{if(el.dataset.note)await send('clip_note_delete',{target:noteClip,noteId:Number(el.dataset.note)});else await send('clip_note_add',{target:noteClip,pitch:Number(el.dataset.pitch),start:Number(el.dataset.start),duration:noteGrid,velocity:Number($('#notevelocity').value)});const d=await send('clip_notes_get',{target:noteClip});noteModel=d.notes||[];drawNotes();}catch(e){el.disabled=false;toast(e.message);}return;}
 if(op==='clip_duplicate'){act(op,{target:Number(el.dataset.track),index:Number(el.dataset.index)});return;}
 if(op==='clip_to_arrangement'){act(op,{target:Number(el.dataset.track),clip:Number(el.dataset.clip),position:state.position}).then(ok=>{if(ok!==false)toast('Copied to Arrangement at playhead');});return;}
 if(op==='record'){act('song_set',{property:'record_mode',value:!state.record});return;}if(op==='metro'){act('song_set',{property:'metronome',value:!state.metronome});return;}if(['mute','solo','arm'].includes(op)){toggle(id,op);return;}if(op==='device'){openDeviceDrawer(id);return;}if(op==='track'){trackDrawer(id);return;}if(op==='clip'){clipDrawer(el.dataset.track,id);return;}if(op==='settings'){settings();return;}if(op==='routing'){routing(id);return;}if(op==='add'){openDrawer('Add track','<div class="actions"><button data-op="create_midi">＋ MIDI track</button><button data-op="create_audio">＋ Audio track</button><button data-op="create_return">＋ Return track</button></div>','add');return;}if(op.startsWith('create_')){await act('track_create',{kind:op.slice(7)});return;}if(op==='next'||op==='previous'){navigateScenes(sceneOffset+(op==='next'?8:-8));return;}
 if(op==='duplicate_track'){act('track_duplicate',{target:id});return;}if(op==='delete_track'){if(confirm('Delete this track? You can undo in Live.'))act('track_delete',{target:id});return;}
 if(op==='clip_create'){await act(op,{target:id,length:Number($('#cliplength').value)});return;}if(op==='clip_delete'){if(confirm('Delete this clip?'))await act(op,{target:id});return;}if(op==='clip_quantize'){act(op,{target:id,grid:5,amount:1});return;}
 if(op==='scene'){const s=state.scenes.find(x=>x.id===id);openDrawer(s.name,`${field('Name',`<input data-edit="scene_name" data-target="${id}" value="${esc(s.name)}">`)}<div class="actions"><button data-op="scene_fire" data-target="${id}">▶ Launch scene</button><button data-op="scene_duplicate" data-target="${id}">Duplicate</button><button data-op="scene_delete" data-target="${id}" class="danger">Delete</button></div>`,'scene',id);return;}if(op==='scene_delete'&&!confirm('Delete this scene?'))return;
 if(op==='arrclip'){const t=trackBy(el.dataset.track),c=t.arrangement.find(c=>c.id===id);openDrawer(c.name,`<p class="hint">Arrangement clip, beats ${c.start.toFixed(2)}–${c.end.toFixed(2)}</p><button data-op="seek" data-beat="${c.start}">Move playhead here</button>`,'arrclip',id);return;}if(op==='seek'){act('song_set',{property:'current_song_time',value:Number(el.dataset.beat)});return;}
 // A launch or stop pulses from the tap until Live reports its own state (or answers).
 if(['clip_fire','clip_stop','scene_fire','track_stop','stop_all'].includes(op)){el.classList.add('queued');Promise.resolve(act(op,id?{target:id}:{})).finally(()=>setTimeout(()=>el.classList.remove('queued'),250));return;}
 act(op,id?{target:id}:{});
});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)||!state)return;if(e.code==='Space'){e.preventDefault();act(state.playing?'stop':'play');}if(e.code==='Escape'){closeDrawer();reportView();}});
setInterval(()=>{if(hostOnline&&lastMessage&&Date.now()-lastMessage>6000){status(false,'Live not responding');ws?.close();}},2000);
window.addEventListener('online',()=>{if(!ws||ws.readyState>1){clearTimeout(reconnectTimer);connect();}});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInteractions();return;}if(!document.hidden&&(!ws||ws.readyState>1)){clearTimeout(reconnectTimer);connect();}else if(!document.hidden&&state)act('refresh');});connect();

// Ranges drag relative to their current value along their displayed axis.
// Dials accept either axis, and all controls can drag beyond their bounds.
const rangeGestures=new Map();
DeviceGestures.onCancel(()=>rangeGestures.clear());
document.addEventListener('pointerdown',e=>{
 const hit=e.target.closest('[data-knob-input]');
 const input=hit?hit.closest('.ut-knob').querySelector('input[data-param]'):e.target.closest('input[type=range][data-param]');
 if(!input||input.disabled||e.button!==0)return;
 e.preventDefault();
 const id=Number(input.dataset.param);
 if(!DeviceGestures.begin(e.pointerId,'html-range',[id]))return;
 const surface=hit||input;surface.focus({preventScroll:true});surface.setPointerCapture(e.pointerId);
 const axis=input.closest('.ut-dial,.af-value')?'either':input.matches('.fader')?'vertical':'horizontal';
 rangeGestures.set(e.pointerId,{input,surface,pointer:e.pointerId,motion:DeviceGestures.scalar(Number(input.value),e,axis)});
});
document.addEventListener('pointermove',e=>{
 const g=rangeGestures.get(e.pointerId);if(!g||!DeviceGestures.canWrite(Number(g.input.dataset.param),g.pointer))return;e.preventDefault();
 g.input.value=DeviceGestures.moveScalar(g.motion,e,Number(g.input.min),Number(g.input.max));
 const event=new Event('input',{bubbles:true});event.gesturePointer=g.pointer;g.input.dispatchEvent(event);
});
function finishRangeGesture(e){
 const targets=e?[rangeGestures.get(e.pointerId)]:[...rangeGestures.values()];
 for(const g of targets){if(!g)continue;rangeGestures.delete(g.pointer);
  DeviceGestures.flush(Number(g.input.dataset.param),g.pointer);g.surface.blur();DeviceGestures.end(g.pointer);}
}
document.addEventListener('pointerup',finishRangeGesture);document.addEventListener('pointercancel',finishRangeGesture);document.addEventListener('lostpointercapture',finishRangeGesture);window.addEventListener('blur',()=>finishRangeGesture());

document.addEventListener('keydown',e=>{
 const hit=e.target.closest('[data-knob-input]');if(!hit||hit.disabled||e.altKey||e.ctrlKey||e.metaKey)return;
 if(!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End',' '].includes(e.key))return;
 e.preventDefault();e.stopImmediatePropagation();if(e.key===' ')return;
 const input=hit.closest('.ut-knob').querySelector('input[data-param]'),id=Number(input.dataset.param);if(!DeviceGestures.owned(id))return;
 const lo=Number(input.min),hi=Number(input.max),parameter=parameterBy(id),step=parameter?.quantized?1:(hi-lo)/(e.shiftKey?1000:100);
 input.value=e.key==='Home'?lo:e.key==='End'?hi:Number(input.value)+(['ArrowUp','ArrowRight'].includes(e.key)?step:-step);
 input.dispatchEvent(new Event('input',{bubbles:true}));DeviceGestures.flush(id);
},true);

document.addEventListener('dblclick',e=>{const hit=e.target.closest('[data-knob-input]'),input=hit?hit.closest('.ut-knob').querySelector('input[data-param]'):e.target.closest('.ut-dial input,.af-value input');if(!input)return;const p=parameterBy(Number(input.dataset.param));if(p?.defaultValue!==null&&p?.enabled&&DeviceGestures.canWrite(p.id)){input.value=p.defaultValue;input.dispatchEvent(new Event('input',{bubbles:true}));DeviceGestures.flush(p.id);}});

function deviceLocation(id){let found=null;function visit(devices,t){for(const d of devices||[]){if(d.id===id)found={device:d,track:t};for(const chain of d.chains||[])visit(chain.devices,t);}}for(const t of state?.tracks||[])visit(t.devices,t);return found;}
function parameterBy(id){for(const {data}of deviceModels.values()){const p=data.parameters.find(p=>p.id===id);if(p)return p;}for(const t of state?.tracks||[]){const p=[t.volume,t.pan,...t.sends].find(p=>p.id===id);if(p)return p;}return null;}
function pruneDeviceModels(previous){
 for(const [id,{data}]of deviceModels)if(!deviceLocation(id)){for(const p of data.parameters)parameterSync.cancel(p.id);deviceModels.delete(id);}
 for(const t of previous?.tracks||[])for(const p of [t.volume,t.pan,...(t.sends||[])])if(p&&!parameterBy(p.id))parameterSync.cancel(p.id);
 if(activeDrawer?.kind==='device'&&!deviceLocation(activeDrawer.id)){deviceDetails=null;drawerVersion++;activeDrawer=null;$('#drawer').hidden=true;}
}
function currentDevice(id){return deviceLocation(id)?deviceModels.get(id)?.data:undefined;}
function rememberDevice(d){if(!deviceLocation(d.id))return null;const previous=deviceModels.get(d.id)?.data;for(const p of previous?.parameters||[])if(!d.parameters.some(next=>next.id===p.id&&next.enabled))parameterSync.cancel(p.id);d={...d,className:d.className||deviceClass(d.id)};d=parameterSync.reconcile(d);deviceModels.set(d.id,{data:d,at:Date.now()});if(activeDrawer?.kind==='device'&&activeDrawer.id===d.id)deviceDetails=d;return d;}
function updateParameter(id,value,display){for(const {data}of deviceModels.values())for(const p of data.parameters)if(p.id===id){p.value=value;if(display!==undefined)p.display=display;}for(const t of state?.tracks||[])for(const p of [t.volume,t.pan,...t.sends])if(p.id===id){p.value=value;if(display!==undefined)p.display=display;}}
function updateDevicePanels(){if(activeDrawer?.kind==='device'&&deviceDetails)renderDevice();if(view==='pinned')renderPinned();}
const pinIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6Zm3 12v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
function pinButton(kind,id,name){const on=pins.has(kind,id);return `<button class="pin-button ${on?'is-pinned':''}" data-op="pin_toggle" data-pin-kind="${kind}" data-target="${id}" aria-pressed="${on}" aria-label="${on?'Unpin':'Pin'} ${esc(name)}" title="${on?'Remove from Pinned':'Add to Pinned'}">${pinIcon}<span>${on?'Pinned':'Pin'}</span></button>`;}
function updateDrawerPin(){const button=$('#drawerPin'),kind=activeDrawer?.kind,id=activeDrawer?.id;button.hidden=!['device','track'].includes(kind);if(button.hidden)return;const target=kind==='track'?trackBy(id):deviceLocation(id)?.device;if(!target){button.hidden=true;return;}const on=pins.has(kind,id);button.classList.toggle('is-pinned',on);button.dataset.op='pin_toggle';button.dataset.pinKind=kind;button.dataset.target=id;button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',`${on?'Unpin':'Pin'} ${target.name}`);const html=pinIcon+`<span>${on?'Pinned':'Pin'}</span>`;if(button.dataset.pinState!==String(on)){button.innerHTML=html;button.dataset.pinState=String(on);}}
function togglePin(kind,id){const t=kind==='track'?trackBy(id):deviceLocation(id)?.track,d=kind==='device'?deviceLocation(id)?.device:null,existing=pins.items.find(p=>p.kind===kind&&p.id===id);if(!existing&&!t)return;try{pins.toggle(existing||{kind,id,trackId:t.id,trackKind:t.kind,trackName:t.name,name:d?.name||t.name,className:d?.className||''});}catch(e){toast(e.message);}updateDrawerPin();$('#pinCount').textContent=pins.items.length?`(${pins.items.length})`:'';reportView();if(view==='pinned')renderPinned();else document.querySelectorAll(`[data-op="pin_toggle"][data-pin-kind="${kind}"][data-target="${id}"]`).forEach(b=>{const on=pins.has(kind,id);b.classList.toggle('is-pinned',on);b.setAttribute('aria-pressed',String(on));});pollPinnedDevices();}
function pinTarget(pin){const t=trackBy(pin.trackId);if(!t||t.kind!==pin.trackKind)return null;if(pin.kind==='track')return t;const location=deviceLocation(pin.id);return location?.track.id===pin.trackId&&location.device.className===pin.className?location.device:null;}
function genericDeviceBody(d,all=false,search=''){const profile=deviceProfile(d);if(profile&&!all)return profile.render(d);return `${profile?`<button class="ut-all" data-op="device_parameter_view" data-device="${d.id}">${esc(d.name)} device view</button>`:''}<p class="hint">Controls use Live’s actual units and available choices.</p>${d.parameters.map(p=>`<div class="parameter" data-name="${esc(p.name.toLowerCase())}" ${search&&!p.name.toLowerCase().includes(search.toLowerCase())?'hidden':''}><label>${esc(p.name)}<output data-value="${p.id}">${esc(DeviceUI.formatDisplay(p.display)||Number(p.value).toFixed(p.quantized?0:3))}</output></label>${parameterControl(p)}<div class="paramactions">${p.defaultValue!==null?`<button class="paramreset" aria-label="Reset ${esc(p.name)}" data-op="reset_parameter" data-target="${p.id}" data-value="${p.defaultValue}" ${p.enabled&&hostOnline?'':'disabled'}>Reset</button>`:''}${p.automation===2?`<button class="paramreset" data-op="parameter_automation" data-target="${p.id}">Re-enable automation</button>`:''}</div></div>`).join('')}`;}
function pinnedTrackBody(t){return `<div class="pinned-track-controls"><div class="toggles">${t.kind!=='master'?`<button class="activator ${!t.mute?'active':''}" data-op="mute" data-target="${t.id}">On</button><button class="solo ${t.solo?'active':''}" data-op="solo" data-target="${t.id}">Solo</button>`:''}${t.canArm?`<button class="arm ${t.arm?'active':''}" data-op="arm" data-target="${t.id}">● Arm</button>`:''}</div>${[t.volume,t.pan,...t.sends].map((p,i)=>`<label class="pinned-track-param"><span>${i===0?'Volume':i===1?'Pan':'Send '+String.fromCharCode(63+i)}<output data-read="${p.id}">${esc(DeviceUI.formatDisplay(p.display))}</output></span>${parameterControl(p)}</label>`).join('')}<div class="meter pinned-meter" data-meter="${t.id}"><i></i></div><button data-op="track" data-target="${t.id}">Track settings</button></div>`;}
function renderPinned(){
 const main=$('#main');if(!main.querySelector('.pinned-grid'))main.innerHTML='<section class="pinned-page"><h1 class="pinned-title">Pinned</h1><div class="pinned-grid"></div></section>';
 const grid=main.querySelector('.pinned-grid'),keys=new Set(pins.items.map(p=>p.kind+':'+p.id));for(const card of grid.querySelectorAll('.pinned-card'))if(!keys.has(card.dataset.pinKey))card.remove();
 let empty=main.querySelector('.pinned-empty');if(!pins.items.length){if(!empty){empty=document.createElement('p');empty.className='pinned-empty';empty.textContent='Open a device or track and tap Pin to build your control panel.';grid.append(empty);}return;}empty?.remove();
 for(const pin of pins.items){
  const key=pin.kind+':'+pin.id,target=pinTarget(pin),t=trackBy(pin.trackId);let card=[...grid.children].find(c=>c.dataset.pinKey===key);
  if(!card){card=document.createElement('article');card.className='pinned-card';card.dataset.pinKey=key;card.dataset.device=pin.kind==='device'?pin.id:'';card.innerHTML='<div class="pinned-card-head"></div><fieldset class="pinned-card-body"></fieldset>';grid.append(card);}
  const head=card.querySelector('.pinned-card-head'),body=card.querySelector('.pinned-card-body'),d=target&&pin.kind==='device'?deviceModels.get(pin.id)?.data:null;
  const title=target?.name||pin.name,subtitle=pin.kind==='device'?(t?.name||pin.trackName):'Track controls';const headingKey=JSON.stringify([title,subtitle,pin.kind,pin.id]);if(head.dataset.heading!==headingKey){head.innerHTML=`<div><span>${esc(subtitle)}</span><h2>${esc(title)}</h2></div>${pinButton(pin.kind,pin.id,title)}`;head.dataset.heading=headingKey;}card.style.setProperty('--pin-color',color(t?.color));body.disabled=!hostOnline||!target;
  const profile=d&&deviceProfile(d);
  const loading=pin.kind==='device'&&t?.kind===pin.trackKind&&t.pending;
  const mode=!target?(loading?'loading':'missing'):pin.kind==='track'?'track:'+JSON.stringify([t.volume.id,t.pan.id,t.sends.map(p=>p.id),t.canArm]):!d?'loading':(profile?.spec.id||'generic')+':'+!!pinnedAll.has(pin.id)+':'+d.parameters.map(p=>p.id).join(',');
  card.classList.toggle('pinned-wide',pin.kind==='device'&&['AutoFilter2','Eq8','Echo'].includes(target?.className||pin.className));
  if(card.dataset.mode!==mode){card.dataset.mode=mode;body.innerHTML=mode==='missing'?'<p class="hint">This target is no longer available in the current set.</p>':mode==='loading'?'<p class="hint">Loading device…</p>':pin.kind==='track'?pinnedTrackBody(t):genericDeviceBody(d,pinnedAll.has(pin.id));}
  if(d)DeviceUI.update(body,d,id=>parameterSync.status(id));
  if(target&&pin.kind==='track'){
   for(const p of [t.volume,t.pan,...t.sends]){for(const input of body.querySelectorAll(`[data-param="${p.id}"]`))if(DeviceGestures.owned(p.id)&&parameterSync.status(p.id)!=='pending')input.value=p.value;for(const out of body.querySelectorAll(`[data-read="${p.id}"]`))if(parameterSync.status(p.id)!=='pending')out.textContent=DeviceUI.formatDisplay(p.display);}
   for(const key of ['mute','solo','arm']){const button=body.querySelector(`[data-op="${key}"]`);button?.classList.toggle('active',key==='mute'?!t.mute:t[key]);}
  }
 }
}
async function pollPinnedDevices(){if(pinnedBusy||!state||!hostOnline||document.hidden||view!=='pinned')return;pinnedBusy=true;const epoch=state.epoch;
 try{const targets=pins.items.filter(p=>p.kind==='device'&&pinTarget(p)).sort((a,b)=>(deviceModels.get(a.id)?.at||0)-(deviceModels.get(b.id)?.at||0)).filter(p=>Date.now()-(deviceModels.get(p.id)?.at||0)>(deviceViews()?DEVICE_SAFETY_MS:1500)).slice(0,4);
  for(const p of targets){const d=await send('device_get',{target:p.id});if(state?.epoch!==epoch||!pinTarget(p))continue;rememberDevice(d);if(view==='pinned')renderPinned();}
 }catch(e){if(hostOnline)toast(e.message);}finally{pinnedBusy=false;}}
setInterval(pollPinnedDevices,750);

const filterGestures=new Map();
DeviceGestures.onCancel(()=>filterGestures.clear());
function moveFilterGesture(e){
 const g=filterGestures.get(e.pointerId);if(!g||!DeviceGestures.canWrite())return;
 const d=deviceModels.get(g.device)?.data;if(!d)return;
 const ps=AutoFilterProfile.scaled(d),freq=ps.find(p=>p.name==='Frequency'),res=ps.find(p=>p.name==='Resonance');if(!freq?.enabled||!res?.enabled)return;
 e.preventDefault();if(e.clientX===g.lastX&&e.clientY===g.lastY)return;const rect=g.svg.getBoundingClientRect();
 const width=Math.max(rect.width*(1-28/646),g.touch?320:1),height=Math.max(rect.height*(1-28/192),g.touch?180:1),speed=e.shiftKey?.1:1;
 g.x=AutoFilterModel.clamp(g.x+(e.clientX-g.lastX)/width*speed,0,1);
 g.y=AutoFilterModel.clamp(g.y+(e.clientY-g.lastY)/height*speed,0,1);g.lastX=e.clientX;g.lastY=e.clientY;
 const value=AutoFilterModel.valueAtFrequency(freq,AutoFilterModel.xFrequency(g.x));if(value===null)return;
 for(const [p,v]of [[freq,value],[res,res.min+(1-g.y)*(res.max-res.min)]]){if(Object.is(p.value,v))continue;updateParameter(p.id,v);parameterSync.preview(p.id,v);g.changed.add(p.id);DeviceGestures.stream(p.id,v,writeParameter,g.pointer);}updateDevicePanels();
}
document.addEventListener('pointerdown',e=>{
 const svg=e.target.closest('svg[data-af-graph]');if(!svg||e.button!==0||!DeviceGestures.canWrite())return;
 const d=deviceModels.get(Number(svg.dataset.afGraph))?.data;if(!d)return;
 const params=AutoFilterProfile.scaled(d),model=AutoFilterModel.graphPlugins['filter-response'].model(params);if(model.unsupported)return;
 const targets=params.filter(p=>['Frequency','Resonance'].includes(p.name));if(targets.some(p=>!p.enabled))return;
 e.preventDefault();if(!DeviceGestures.begin(e.pointerId,'auto-filter-graph',targets.map(p=>p.id)))return;
 svg.setPointerCapture(e.pointerId);
 filterGestures.set(e.pointerId,{svg,device:d.id,pointer:e.pointerId,changed:new Set(),touch:e.pointerType==='touch',lastX:e.clientX,lastY:e.clientY,x:AutoFilterModel.frequencyX(model.hz),y:1-model.resonance});
});
document.addEventListener('pointermove',moveFilterGesture);
function finishFilterGesture(e){const targets=e?[filterGestures.get(e.pointerId)]:[...filterGestures.values()];for(const g of targets){if(!g)continue;filterGestures.delete(g.pointer);for(const id of g.changed)DeviceGestures.flush(id,g.pointer);DeviceGestures.end(g.pointer);}}
document.addEventListener('pointerup',finishFilterGesture);document.addEventListener('pointercancel',finishFilterGesture);document.addEventListener('lostpointercapture',finishFilterGesture);window.addEventListener('blur',()=>finishFilterGesture());window.addEventListener('resize',updateDevicePanels);

// Device renderers receive transport/state through this adapter, never a second socket.
DeviceUI.configure({canWrite:()=>hostOnline,tempo:()=>state?.tempo||120,sampleRateHz:()=>state?.sampleRateHz,pending:id=>parameterSync.status(id),refresh:updateDevicePanels,error:e=>toast(e.message),
 writeDeviceView:async(id,value)=>{const generation=interactionGeneration;const d=await send('eq8_view',{target:id,...value});if(generation!==interactionGeneration)throw Error('Live connection changed');if(!rememberDevice(d))throw Error('Device is no longer available');updateDevicePanels();return d.eq8;}
});
DeviceSVGControls.install({
 getDevice:currentDevice,canWrite:()=>hostOnline,
 preview:(id,value)=>{updateParameter(id,value);parameterSync.preview(id,value);updateDevicePanels();},
 write:writeParameter,refresh:updateDevicePanels,gesture:busy=>{dragging=busy;}
});

EQ8Controls.install({getDevice:currentDevice,canWrite:()=>hostOnline,preview:(id,value)=>{updateParameter(id,value);parameterSync.preview(id,value);updateDevicePanels();},write:writeParameter,gesture:busy=>{dragging=busy;}});
