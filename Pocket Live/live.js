/* All Live access stays in Max's scheduler. Typed operations; no eval endpoint. */
autowatch=0;inlets=1;outlets=1;
var song=null,cache={},cacheSize=0,allowed={},tracks=[],epoch='',ownTrack=0,slotCache={},sceneKey='',sampleRateHz=null,sceneViews={};
// Loading is incremental so set size can never stall Max or Live: each 100ms tick
// reads only what fits a time budget, touched tracks first, then round-robin.
// One track is cached as serialized JSON and only re-read when due.
var READ_MS=25,SWEEP_MS=12,WATCH_MS=50,DIRTY_MS=60,FIRST_MS=100,TRACK_MS=1000,IDLE_FACTOR=10,SONG_MS=500,METER_KEEPALIVE_MS=250,HEARTBEAT_MS=5000,DIGEST_MS=5000,METER_BATCH=32,AUDIO_MS=300000;
var loaded=false,controllers=-1,idleTick=0,meterAt=0,meterKey='',levels={},bridgeReady=false,order=[],kinds={},trackIndexes={},trackJSON={},readAt={},dirty={},owned={},ownerOf={},owning=null,leasing=false,leased={},armed={},audioOut={},audioCache={},cursor=0,meterCursor=0,head=null,sceneTotal=-1,songAt=0,forceEmit=false,lastKey='',stampSeq=0,headBody='',headStamp=0,emittedAt=0,lastLength=0,lastDiagnostic='',frameId=0;
// Creating a LiveAPI object costs several milliseconds and gets slower the more exist,
// while a get is about 40us. So objects are light Refs reading through one shared
// lens; only tracks and objects that keep being re-read get a real object of their own.
var REAL_MAX=1000,REAL_AFTER=2,lens=null,lensId=0,realCount=0,promotions=0;
function Ref(id){this.id=Number(id);this.key=this.id;this.real=null;this.switches=0;}
Ref.prototype.promote=function(){var a=new LiveAPI(null);a.id=this.id;this.real=a;realCount++;};
Ref.prototype.use=function(){
 if(this.real)return this.real;
 if(lensId===this.id)return lens;
 if(++this.switches>REAL_AFTER&&promotions>0&&realCount<REAL_MAX){promotions--;this.promote();return this.real;}
 if(!lens)lens=new LiveAPI(null);
 lens.id=this.id;lensId=this.id;return lens;
};
Ref.prototype.alive=function(){return !!this.use().id;};
Ref.prototype.get=function(p){return this.use().get(p);};
Ref.prototype.set=function(p,v){return this.use().set(p,v);};
Ref.prototype.call=function(){var a=this.use();return a.call.apply(a,arguments);};
function api(id){if(!cache[id]){if(++cacheSize>50000){cache={};cacheSize=1;constants={};recent={};displays={};realCount=0;}cache[id]=new Ref(id);}return cache[id];}
// Max truncates a symbol passed to node.script at 32,767 characters. Every JSON
// message leaves through here: escaped to ASCII, then split into safe frames.
// The ~ prefix stops Max treating a short numeric-looking frame as a number.
var FRAME_CHARS=16000;
function ascii(json){return json.replace(/[\u007f-\uffff]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);});}
function send(selector,json){json=ascii(json);if(json.length<=FRAME_CHARS){outlet(0,selector,json);return;}var id=++frameId,total=Math.ceil(json.length/FRAME_CHARS);for(var i=0;i<total;i++)outlet(0,'frame',id,i,total,selector,'~'+json.substr(i*FRAME_CHARS,FRAME_CHARS));}
function diagnostic(text){text=String(text);if(text!==lastDiagnostic){lastDiagnostic=text;if(bridgeReady)outlet(0,'diagnostic',text);}}
// Read each value only as often as it can change. Never-changing values are read
// once; rarely-changing ones refresh every SLOW_MS during background sweeps. Commands,
// touched tracks and first reads run with fresh=true and always ask Live.
// Cache hits never touch Live.
var STATIC={class_name:1,can_have_chains:1,is_quantized:1,min:1,max:1,default_value:1,is_midi_clip:1,is_audio_clip:1,can_be_armed:1,has_midi_input:1,is_foldable:1};
var SLOW={name:1,color:1,length:1,loop_start:1,loop_end:1,start_time:1,end_time:1,looping:1,muted:1,launch_mode:1,launch_quantization:1,is_enabled:1,automation_state:1};
var SLOW_LISTS={parameters:1,devices:1,chains:1,arrangement_clips:1,mixer_device:1,volume:1,panning:1,sends:1,clip:1};
// A sweep that comes back after its cache expired re-reads every clip and device: about 45 lens
// switches, 60ms a track. So the cache outlives one sweep cycle, which grows with the Set.
var SLOW_MS=5000,SLOW_PER_TRACK_MS=300,fresh=true,constants={},recent={},displays={};
function slowTTL(){return Math.max(SLOW_MS,order.length*SLOW_PER_TRACK_MS)*(controllers===0?IDLE_FACTOR:1);}
// Once a background tick has used its slot, expired values are served as they are and refreshed
// on a later visit: one track can hold a hundred objects, and a tick must not wait for all of them.
var sweepUntil=0;
function recall(key){if(fresh)return null;var hit=recent[key],now=Date.now();return hit&&(now<hit.until||sweepUntil&&now>=sweepUntil)?hit:null;}
// Each entry lives a random 75-125% of the TTL. Otherwise everything read by the first load
// expires together, and every later refresh repeats that burst.
function remember(key,value){recent[key]={value:value,until:Date.now()+slowTTL()*(.75+Math.random()/2)};}
function read(a,p,fallback){
 var id=a&&(a.key||a.id);if(!id)return fallback===undefined?0:fallback;
 // An object with its own LiveAPI reads in about 0.15ms, so its values are never left to age.
 var isStatic=STATIC[p]&&a!==song,isSlow=SLOW[p]&&a!==song&&!a.real,key=id+'.'+p,hit;
 if(isStatic&&key in constants)return constants[key];
 if(isSlow&&(hit=recall(key)))return hit.value;
 if(a.alive&&!a.alive())return fallback===undefined?0:fallback; // Deleted in Live; a get would print an error.
 try{var x=a.get(p),value=x instanceof Array?(x.length===1?x[0]:x.join(' ')):x;if(isStatic)constants[key]=value;else if(isSlow)remember(key,value);return value;}catch(e){return fallback===undefined?0:fallback;}
}
function ids(a,p){var id=a&&(a.key||a.id);if(!id)return [];var slow=SLOW_LISTS[p]&&a!==song,key=id+'#'+p,hit;if(slow&&(hit=recall(key)))return hit.value;if(a.alive&&!a.alive())return [];try{var x=a.get(p),out=[];for(var i=0;i<x.length;i++)if(x[i]==='id'&&Number(x[i+1]))out.push(Number(x[++i]));if(slow)remember(key,out);return out;}catch(e){return [];}}
function first(a,p){var x=ids(a,p);return x.length?x[0]:0;}
function allow(id,kind){if(leasing)leased[id]=kind;else{allowed[id]=kind;if(owning)owning[id]=kind;}}
function attach(id,kind){allow(id,kind);return api(id);}
function parameter(id){var a=attach(id,'parameter'),q=!!Number(read(a,'is_quantized')),display='',items=[],seen=displays[id],value=!fresh&&observedTargets[id+'.value']&&seen?seen.value:Number(read(a,'value'));
 // Formatting is a round trip too; a background sweep reuses it while the value is unchanged.
 if(!fresh&&seen&&seen.value===value)display=seen.display;else{try{display=String(a.call('str_for_value',value));}catch(e){}displays[id]={value:value,display:display};}
 if(q){var itemsKey=id+'.items';if(!(itemsKey in constants)){try{var raw=a.get('value_items');constants[itemsKey]=raw instanceof Array?raw:[];}catch(e){constants[itemsKey]=[];}}items=constants[itemsKey];}
 return {display:display,id:id,name:read(a,'name',''),defaultValue:q?null:Number(read(a,'default_value')),items:items,value:value,min:Number(read(a,'min')),max:Number(read(a,'max')),quantized:q,enabled:!!Number(read(a,'is_enabled')),automation:Number(read(a,'automation_state'))};}
// Eq8Device properties are outside its 84 DeviceParameters.
function eq8State(d){
 var mode=read(d,'global_mode',null),edit=read(d,'edit_mode',null),view=api(first(d,'view')),band=read(view,'selected_band',null);
 if(mode===null||edit===null||band===null||[0,1,2].indexOf(Number(mode))<0||Number(band)<0||Number(band)>7)return {available:false};
 return {available:true,globalMode:Number(mode),editMode:Number(edit)?1:0,selectedBand:Number(band)+1,oversample:!!Number(read(d,'oversample'))};
}
function sample_rate(value){var v=Number(value);if(isFinite(v)&&v>=8000&&v<=768000)sampleRateHz=v;}
function deviceDetail(id){var d=api(id),kind=read(d,'class_name',''),result={id:Number(id),name:read(d,'name'),className:kind,classDisplayName:read(d,'class_display_name',''),sampleRateHz:sampleRateHz,parameters:ids(d,'parameters').slice(0,256).map(parameter)};if(kind==='Eq8')result.eq8=eq8State(d);return result;}

function deviceOn(id){var key=id+'.on',hit=recall(key);if(hit)return hit.value;var value=Number(read(api(id),'value'));remember(key,value);return value;}
// Listing children makes Live mint an ID per child on first touch, about 0.5ms each. On an
// 80-track Set that was 34,000 device parameters and 85% of the load; clip slots grow the same
// way with every scene. So never list these: ask for the one child needed, by path.
var pathLens=null;
function childAt(id,path){try{if(!pathLens)pathLens=new LiveAPI(null);pathLens.goto(api(id).use().unquotedpath+' '+path);return Number(pathLens.id)||0;}catch(e){return 0;}}
// Device On is all a device needs until it is opened; device_get reads the other parameters.
function onParameter(id){var key=id+'.onId',found;if(key in constants)return constants[key];found=childAt(id,'parameters 0')||first(api(id),'parameters');if(found)constants[key]=found;return found;}
// A slot stays at its index until the scene list changes, which clears this cache (readSong).
function slotAt(track,index){var known=slotCache[track]||(slotCache[track]={});if(index<0||index>=sceneTotal)return 0;return known[index]||(known[index]=childAt(track,'clip_slots '+index));}
function devices(t,depth){var list=ids(t,'devices'),out=[];for(var i=0;i<list.length&&i<32;i++){var a=attach(list[i],'device'),d={id:list[i],name:read(a,'name','Device'),className:read(a,'class_name',''),on:1,onId:0,chains:[]},nested=depth<2&&Number(read(a,'can_have_chains')),onId=onParameter(list[i]);if(onId){d.on=deviceOn(onId);d.onId=onId;allow(onId,'parameter');}if(nested){var ch=ids(a,'chains');for(var j=0;j<ch.length&&j<16;j++){var ca=attach(ch[j],'chain');d.chains.push({id:ch[j],name:read(ca,'name','Chain'),devices:devices(ca,depth+1)});}}out.push(d);}return out;}
function routings(a,p){try{var x=read(a,p,'');return JSON.parse(x);}catch(e){return null;}}
// Read the active Session clip even when it is outside the visible eight scenes.
function recordingFacts(a){var can=!!Number(read(a,'can_be_armed')),rawIndex=read(a,'playing_slot_index',null),index=rawIndex===null?null:Number(rawIndex),slot=index!==null&&index>=0?slotAt(a.id,index):0,clip=slot?first(api(slot),'clip'):0,c=clip?api(clip):null;return {canArm:can,arm:can?!!Number(read(a,'arm')):false,implicitArm:can?!!Number(read(a,'implicit_arm')):false,frozen:!!Number(read(a,'is_frozen')),playingSlotIndex:index,sessionRecording:c?!!Number(read(c,'is_recording')):false,sessionPlaying:c?!!Number(read(c,'is_playing')):false};}
function recordingTransport(){return {epoch:String(song.id),playing:!!Number(read(song,'is_playing')),record:!!Number(read(song,'record_mode')),countingIn:!!Number(read(song,'is_counting_in')),punchIn:!!Number(read(song,'punch_in')),punchOut:!!Number(read(song,'punch_out')),loop:!!Number(read(song,'loop')),loopStart:Number(read(song,'loop_start')),loopLength:Number(read(song,'loop_length'))};}
// Local file paths are stripped by Node before any state reaches the relay.
function audioInfo(c){
 if(!Number(read(c,'is_audio_clip'))||Number(read(c,'is_recording')))return {};
 var raw,markers=[];try{raw=c.get('warp_markers');if(raw instanceof Array&&raw[0]==='dictionary')raw=JSON.parse(new Dict(raw[1]).stringify());else if(raw instanceof Array&&raw.length===1&&typeof raw[0]==='string')raw=JSON.parse(raw[0]);else if(typeof raw==='string')raw=JSON.parse(raw);if(raw&&raw.warp_markers)markers=raw.warp_markers;else if(raw instanceof Array)markers=raw;}catch(e){}
 return {audioFile:String(read(c,'file_path','')),audio:{warped:!!Number(read(c,'warping')),start:Number(read(c,'start_marker')),looping:!!Number(read(c,'looping')),loopStart:Number(read(c,'loop_start')),loopEnd:Number(read(c,'loop_end')),pitch:Number(read(c,'pitch_coarse'))+Number(read(c,'pitch_fine'))/100,markers:markers}};
}
// Warp markers are the most expensive clip read and rarely change. Live's generated
// end marker also jitters between reads, so re-reading often would look like a change.
function cachedAudioInfo(id,c){var hit=audioCache[id],now=Date.now();if(hit&&now-hit.at<AUDIO_MS)return hit.info;var info=audioInfo(c);if(info.audio)audioCache[id]={at:now,info:info};return info;}
// A background sweep learns playing/triggered from the track's indexes (trackSlots)
// instead of visiting every slot and clip. Fresh reads still ask each object.
var trackSlots=null;
function clipsAt(track,offset){var clips=[],quick=!fresh&&trackSlots; for(var i=offset;i<Math.min(sceneTotal,offset+8);i++){var slot=slotAt(track,i);if(!slot)continue;var s=attach(slot,'slot'),clip=first(s,'clip'),triggered=quick?quick.fired===i:!!Number(read(s,'is_triggered')),c=clip?attach(clip,'clip'):null,active=quick&&quick.playing===i;clips.push({id:slot,index:i,clipId:clip,midi:c?!!Number(read(c,'is_midi_clip')):false,name:c?read(c,'name','Clip'):'',color:c?Number(read(c,'color')):0,playing:!c?false:quick?active:!!Number(read(c,'is_playing')),recording:!c?false:quick&&!active?false:!!Number(read(c,'is_recording')),triggered:triggered,muted:c?!!Number(read(c,'muted')):false,length:c?Number(read(c,'length')):0,looping:c?!!Number(read(c,'looping')):false,loopStart:c?Number(read(c,'loop_start')):0,loopEnd:c?Number(read(c,'loop_end')):0,launchMode:c?Number(read(c,'launch_mode')):0,launchQuantization:c?Number(read(c,'launch_quantization')):0});}return clips;}
// Scene windows are reads scoped to one client. The shared snapshot stays on
// page zero. Short leases keep off-page clip targets valid across refreshes.
function scenePage(offset,client){
 var scenes=ids(song,'scenes'),last=Math.floor(Math.max(0,scenes.length-1)/8)*8;
 offset=Math.min(Math.floor(offset/8)*8,last);
 expireSceneViews();
 if(!sceneViews[client]&&Object.keys(sceneViews).length>=32)throw Error('Too many scene views; retry shortly');
 sceneViews[client]={offset:offset,at:Date.now()};
 var page={epoch:epoch,offset:offset,sceneCount:scenes.length,scenes:[],tracks:[]};
 for(var i=offset;i<Math.min(scenes.length,offset+8);i++){var a=attach(scenes[i],'scene');page.scenes.push({id:scenes[i],index:i,name:read(a,'name',''),color:Number(read(a,'color')),triggered:!!Number(read(a,'is_triggered'))});}
 var tr=ids(song,'tracks');leasing=true;try{for(var i=0;i<tr.length&&i<128;i++){var clips=clipsAt(tr[i],offset);for(var c=0;c<clips.length;c++){ownerOf[clips[c].id]=tr[i];if(clips[c].clipId)ownerOf[clips[c].clipId]=tr[i];}page.tracks.push({id:tr[i],clips:clips});}}finally{leasing=false;}
 return page;
}
// Off-page targets stay valid only while a client is looking at that page.
function expireSceneViews(){var now=Date.now(),keys=Object.keys(sceneViews);for(var k=0;k<keys.length;k++)if(now-sceneViews[keys[k]].at>15000)delete sceneViews[keys[k]];if(!Object.keys(sceneViews).length)leased={};}
// A mixer strip is a dozen reads; its clips and devices are hundreds. So a first read takes
// two passes: every strip (shell), which is enough to paint and control the whole Set, then
// the rest track by track. A shell is marked pending so browsers can show it is still filling.
function track(id,kind,index,shell){var a=attach(id,'track');if(!shell&&!a.real)a.promote();var mix=api(first(a,'mixer_device')),volumeId=first(mix,'volume'),panId=first(mix,'panning'),sends=ids(mix,'sends'),volume=parameter(volumeId),pan=parameter(panId),clips=[];audioOut[id]=!!Number(read(a,'has_audio_output'));
 trackSlots=!shell&&kind==='track'?{playing:Number(read(a,'playing_slot_index')),fired:Number(read(a,'fired_slot_index'))}:null;
 clips=shell||kind!=='track'?[]:clipsAt(id,0);var fired=trackSlots?trackSlots.fired:null;trackSlots=null;
 var arrangement=[];if(kind==='track'&&!shell){var ac=ids(a,'arrangement_clips');for(var i=0;i<ac.length&&i<128;i++){var c=attach(ac[i],'clip');arrangement.push({id:ac[i],name:read(c,'name',''),start:Number(read(c,'start_time')),end:Number(read(c,'end_time')),color:Number(read(c,'color')),recording:head&&!head.record?false:!!Number(read(c,'is_recording'))});var info=cachedAudioInfo(ac[i],c);for(var key in info)arrangement[arrangement.length-1][key]=info[key];}}
 var facts=kind==='track'&&!shell?recordingFacts(a):{};armed[id]=!!(facts.arm||facts.implicitArm);return {pending:!!shell,implicitArm:!!facts.implicitArm,frozen:!!facts.frozen,playingSlotIndex:facts.playingSlotIndex===undefined?null:facts.playingSlotIndex,firedSlotIndex:fired,sessionRecording:!!facts.sessionRecording,sessionPlaying:!!facts.sessionPlaying,id:id,index:index,kind:kind,name:read(a,'name','Track'),color:Number(read(a,'color')),midi:!!Number(read(a,'has_midi_input')),mute:kind==='master'?false:!!Number(read(a,'mute')),solo:kind==='master'?false:!!Number(read(a,'solo')),canArm:!!Number(read(a,'can_be_armed')),arm:Number(read(a,'can_be_armed'))?!!Number(read(a,'arm')):false,foldable:!!Number(read(a,'is_foldable')),folded:Number(read(a,'is_foldable'))?!!Number(read(a,'fold_state')):false,monitor:kind==='track'?Number(read(a,'current_monitoring_state')):null,volume:volume,pan:pan,sends:sends.slice(0,16).map(parameter),clips:clips,devices:shell?[]:devices(a,0),arrangement:arrangement,isBridge:id===ownTrack};
}
function refresh(){bridgeReady=true;forceEmit=true;}
function staleAll(){readAt={};songAt=0;recent={};}
// Nobody is connected: stop meters and refresh rarely, so an idle device costs almost nothing.
function presence(count){var before=controllers;controllers=Number(count)||0;if(before===0&&controllers>0)staleAll();}
function markDirty(id){var owner=ownerOf[id]||(kinds[id]?id:0);if(owner)dirty[owner]=true;}
// Structure and song-level values: a handful of reads.
function readSong(){
 var s=song,tr=ids(s,'tracks'),ret=ids(s,'return_tracks'),master=first(s,'master_track'),next=[],nextKinds={},indexes={};epoch=String(s.id);
 for(var i=0;i<tr.length&&i<128;i++){next.push(tr[i]);nextKinds[tr[i]]='track';indexes[tr[i]]=i;}
 for(i=0;i<ret.length&&i<16;i++){next.push(ret[i]);nextKinds[ret[i]]='return';indexes[ret[i]]=i;}
 if(master){next.push(master);nextKinds[master]='master';indexes[master]=0;}
 for(var id in trackJSON)if(!nextKinds[id])forget(id);
 for(i=0;i<next.length;i++)if(trackJSON[next[i]]&&trackJSON[next[i]].index!==indexes[next[i]])dirty[next[i]]=true;
 for(id in dirty)if(!nextKinds[id])delete dirty[id];
 order=next;kinds=nextKinds;trackIndexes=indexes;tracks=tr.concat(ret).concat(master?[master]:[]);
 var scenes=ids(s,'scenes'),sc=[],key=scenes.join(',');if(key!==sceneKey){sceneKey=key;slotCache={};}if(scenes.length!==sceneTotal){if(sceneTotal>=0)staleAll();sceneTotal=scenes.length;leased={};}
 for(i=0;i<scenes.length;i++)allowed[scenes[i]]='scene';
 for(i=0;i<Math.min(scenes.length,8);i++){var a=attach(scenes[i],'scene');sc.push({id:scenes[i],index:i,name:read(a,'name','Scene '+(i+1)),color:Number(read(a,'color')),triggered:!!Number(read(a,'is_triggered'))});}
 sceneList=scenes;planScenes();
 head={epoch:epoch,name:read(s,'name','')||'Untitled',playing:!!Number(read(s,'is_playing')),countingIn:!!Number(read(s,'is_counting_in')),tempo:Number(read(s,'tempo')),sampleRateHz:sampleRateHz,backToArrangement:!!Number(read(s,'back_to_arranger')),punchIn:!!Number(read(s,'punch_in')),punchOut:!!Number(read(s,'punch_out')),automationArm:!!Number(read(s,'session_automation_record')),record:!!Number(read(s,'record_mode')),sessionRecord:!!Number(read(s,'session_record')),metronome:!!Number(read(s,'metronome')),overdub:!!Number(read(s,'overdub')),loop:!!Number(read(s,'loop')),loopStart:Number(read(s,'loop_start')),loopLength:Number(read(s,'loop_length')),quantization:Number(read(s,'clip_trigger_quantization')),signature:[Number(read(s,'signature_numerator')),Number(read(s,'signature_denominator'))],canUndo:!!Number(read(s,'can_undo')),canRedo:!!Number(read(s,'can_redo')),scenes:sc,liveUpdates:watchesReady,sceneOffset:0,sceneCount:scenes.length,device:null,capabilities:['transport','record','session','mixer','sends','devices','parameters','arrangement','tracks','scenes','routing','clip-edit','undo','scene-pages','views','device-views']};
 var body=JSON.stringify(head);if(body!==headBody){headBody=body;headStamp++;}
 songAt=Date.now();
}
function forget(id){var mine=owned[id];if(mine)for(var k in mine){delete allowed[k];delete ownerOf[k];}delete owned[id];delete trackJSON[id];delete readAt[id];delete freshAt[id];delete dirty[id];delete slotCache[id];delete armed[id];delete audioOut[id];unwatch(id);delete patches[id];delete soft[id];}
// Reads one track and retires any targets that track no longer owns.
function readTrack(id,shell){
 var kind=kinds[id],index=trackIndexes[id],previous=owned[id]||{},mine={};owning=mine;
 try{var t=track(id,kind,index,shell),json=JSON.stringify(t),old=trackJSON[id];trackJSON[id]={index:index,pending:!!shell,json:json,stamp:old&&old.json===json?old.stamp:++stampSeq};if(!shell)planTrack(id,t);}catch(e){diagnostic('Could not read a track: '+e);}finally{owning=null;}
 for(var k in previous)if(!mine[k]){delete allowed[k];delete ownerOf[k];}
 for(k in mine)ownerOf[k]=id;owned[id]=mine;readAt[id]=Date.now();if(fresh)freshAt[id]=readAt[id];delete dirty[id];
}
// What browsers last received in full, so a change can go as just the tracks it touched.
// Node holds a copy of the Set built from these messages (maxnode/set-copy.cjs). Each state and patch
// carries a sequence number, so a lost one is noticed, and the versions it brings.
var freshAt={},sentStamps={},sentHead=-1,sentShape='',sentOrder=[],DELTA_TRACKS=24,DELTA_CHARS=200000,seqOut=0,resend=false,digestDue=false,digestAt=0;
function shape(){return order.join()+'|'+head.sceneCount+'|'+head.scenes.map(function(x){return x.id;}).join();}
function emitState(){
 if(!bridgeReady||!head)return;if(!resend&&!forceEmit&&(digestDue||loaded&&controllers!==0&&Date.now()-digestAt>=DIGEST_MS))sendDigest();var key=headStamp+':',i,t;for(i=0;i<order.length;i++){t=trackJSON[order[i]];if(!t)return;key+=t.stamp+',';}
 for(var d in dirty)return;
 // Versions, not text: a change already delivered as a patch does not resend the whole Set.
 var now=Date.now(),changed=key!==lastKey,gap=Math.max(100,lastLength/512),heartbeat=watchesReady?Infinity:Math.max(HEARTBEAT_MS,lastLength/16),age=now-emittedAt;
 // Once loaded, a change to a few tracks or to song values goes alone: on a large Set a whole
 // snapshot is hundreds of KB and rate-limited, a track is a few KB and goes at once.
 if(loaded&&!forceEmit&&(changed||pagesChanged||resend)&&shape()===sentShape){
  var parts=[],size=0,ids=[];for(i=0;i<order.length;i++){t=trackJSON[order[i]];if(t.stamp!==sentStamps[order[i]]){ids.push(order[i]);parts.push(t.json);size+=t.json.length;}}
  if(ids.length<=DELTA_TRACKS&&size<=DELTA_CHARS){
   lastKey=key;resend=false;if(!ids.length&&headStamp===sentHead&&!pagesChanged)return; // Only value patches, already sent.
   var songOut='';if(headStamp!==sentHead){var h={};for(var k in head)if(k!=='sceneOffset'&&k!=='capabilities'&&k!=='device')h[k]=head[k];songOut=',"song":'+JSON.stringify(h)+',"songVersion":'+headStamp;}
   var versions=[];for(i=0;i<ids.length;i++){sentStamps[ids[i]]=trackJSON[ids[i]].stamp;versions.push('"'+ids[i]+'":'+sentStamps[ids[i]]);}sentHead=headStamp;
   var m='{"patch":true,"liveAt":'+Date.now()+',"seq":'+(++seqOut)+',"versions":{'+versions.join(',')+'},"position":'+Number(read(song,'current_song_time'))+',"transport":'+JSON.stringify(liveTransport())+',"tracks":[]'+(parts.length?',"replace":['+parts.join(',')+']':'')+songOut+(pagesChanged?',"pages":true':'')+'}';
   pagesChanged=false;send('patch',m);return;
  }
 }
 if(age<gap||!(forceEmit||changed||resend||(controllers!==0&&age>=heartbeat)))return;
 var parts=[],stamps=[];for(i=0;i<order.length;i++){parts.push(trackJSON[order[i]].json);stamps.push(trackJSON[order[i]].stamp);}
 var json=JSON.stringify(head).slice(0,-1)+',"seq":'+(++seqOut)+',"songVersion":'+headStamp+',"versions":['+stamps.join(',')+'],"position":'+Number(read(song,'current_song_time'))+',"tracks":['+parts.join(',')+']}';
 sentStamps={};for(i=0;i<order.length;i++)sentStamps[order[i]]=trackJSON[order[i]].stamp;sentHead=headStamp;sentShape=shape();sentOrder=order.slice();pagesChanged=false;resend=false;
 lastKey=key;lastLength=json.length;emittedAt=now;forceEmit=false;send('state',json);if(!loaded&&!firstLoadStep())finishedLoading();
}
// What Node should hold: the versions last sent, so a digest is valid at any moment. Node compares it
// with its copy and asks again (op sync) for just the tracks that differ, or for a whole snapshot.
function sendDigest(){
 digestDue=false;digestAt=Date.now();if(!sentShape){forceEmit=true;return;}
 var v=[];for(var i=0;i<sentOrder.length;i++)v.push(sentStamps[sentOrder[i]]);
 send('digest',JSON.stringify({epoch:epoch,seq:seqOut,shape:sentShape,song:sentHead,tracks:v}));
}
function stateSync(p){
 var r=p.resync,i;if(p.digest)digestDue=true;if(!r)return;
 if(r.full||!(r.tracks instanceof Array)||r.tracks.length>DELTA_TRACKS)forceEmit=true;
 else{for(i=0;i<r.tracks.length;i++)delete sentStamps[r.tracks[i]];if(r.song)sentHead=-1;resend=true;}
 digestDue=true; // Confirms the repair once it has gone: digests wait while a resend or snapshot is due.
}
// Value patches edit the cached track and the song in place. Each gets a new version, counted as
// delivered unless an earlier change is still waiting to go (which then carries the value too).
function stampPatch(m){
 var v={},i,id,t;for(i=0;i<m.tracks.length;i++){id=m.tracks[i].id;t=trackJSON[id];if(t&&sentStamps[id]===t.stamp){t.stamp=sentStamps[id]=++stampSeq;v[id]=t.stamp;}}
 m.versions=v;if(m.song&&sentHead===headStamp){sentHead=++headStamp;m.songVersion=headStamp;}m.seq=++seqOut;return m;
}
// The next read of the first load: all shells, then each track in full. Null when loaded.
function firstLoadStep(){var i;for(i=0;i<order.length;i++)if(!trackJSON[order[i]])return {id:order[i],shell:true};for(i=0;i<order.length;i++)if(trackJSON[order[i]].pending)return {id:order[i],shell:false};return null;}
function sync(){
 if(!bridgeReady||!song||!song.id)return;
 try{
  var now=Date.now(),hasDirty=false,factor=controllers===0?IDLE_FACTOR:1;for(var d in dirty){hasDirty=true;break;}
  if(hasDirty||!head||now-songAt>=SONG_MS*factor){fresh=false;try{readSong();}finally{fresh=true;}}
  expireSceneViews();refreshVisible(false);
  var start=Date.now(),deadline=start+DIRTY_MS,step;
  for(d in dirty){if(Date.now()>=deadline)break;readTrack(Number(d));}
  if(loaded)readSoft(deadline);
  // Unread tracks (the first load, or a new track) go ahead of the background refresh.
  deadline=start+FIRST_MS;
  while(Date.now()<deadline&&(step=firstLoadStep())){readTrack(step.id,step.shell);var next=firstLoadStep();if(step.shell&&(!next||!next.shell)){deadline=0;break;}} // Paint the strips right away.
  // Observers deliver everything time-critical, so the background sweep only has to catch edits:
  // a small fixed slot, whatever the Set size. Installing observers has its own larger slot, and
  // the sweep keeps running meanwhile so nothing goes unseen until they are in place.
  if(deadline&&loaded){installWatches(Date.now()+WATCH_MS);deadline=Date.now()+SWEEP_MS;}else if(deadline)deadline=start+READ_MS;
  sweepUntil=deadline;
  try{for(var seen=0;seen<order.length&&Date.now()<deadline;seen++){var id=order[cursor++%order.length];if(Date.now()-(readAt[id]||0)>=TRACK_MS*factor){fresh=false;try{readTrack(id);}finally{fresh=true;}}}}finally{sweepUntil=0;}
  emitState();
 }catch(e){diagnostic('Could not read the Live Set: '+e);}
}
// Meters rotate through at most METER_BATCH tracks per tick and send only what moved,
// with a small keepalive so a stalled host is still noticed. Browsers apply partial updates.
function liveTransport(){if(!head)return recordingTransport();return {epoch:head.epoch,playing:!!Number(read(song,'is_playing')),record:!!Number(read(song,'record_mode')),countingIn:!!Number(read(song,'is_counting_in')),punchIn:head.punchIn,punchOut:head.punchOut,loop:head.loop,loopStart:head.loopStart,loopLength:head.loopLength};}
function meters(){
 if(!bridgeReady||!song||!song.id)return;
 try{
  var transport=liveTransport(),position=Number(read(song,'current_song_time')),list=[],n=tracks.length,now=Date.now();
  for(var i=0;i<n&&i<METER_BATCH;i++){
   var id=tracks[meterCursor++%n],a=api(id),level=Math.round(Number(read(a,'output_meter_level'))*100)/100,entry=null;
   if(levels[id]!==level){levels[id]=level;entry={id:id,level:level};}
   if(kinds[id]==='track'&&(transport.record||transport.playing&&armed[id])){var facts=recordingFacts(a);if(!entry)entry={id:id,level:level};for(var key in facts)entry[key]=facts[key];}
   if(entry)list.push(entry);
  }
  var key2=position+JSON.stringify(transport);
  if(!list.length&&key2===meterKey&&now-meterAt<METER_KEEPALIVE_MS)return;
  meterKey=key2;meterAt=now;send('meters',JSON.stringify({position:position,transport:transport,tracks:list}));
 }catch(e){}
}

// Observers: Live calls back the moment a watched value changes, so state reaches browsers in
// milliseconds instead of waiting for a sweep (measured: under 1ms, against 7.5ms of every tick to
// poll 64 tracks). Watching costs nothing until a change; creating one observer costs about 7ms,
// so they are installed after the first load: on-screen tracks first, then the most urgent kinds.
// What to watch is derived from the data: each group (a track, the song, the scene rows, an open
// device) lists the observers it needs now, and reconcile() installs what is missing and drops
// what is no longer listed. A watch is one of two kinds:
//  value  mute, solo, arm, clip launch, mixer and device parameters, scene launch: the new value
//         is patched straight in;
//  touch  names, colours, device and clip lists, Device On: the change drops just those cached
//         reads, the owner is re-read from cache (a few ms) and only that track is sent.
// Every track's core is watched. What only shows on screen (sends, clips, Device On, device and
// chain names) is watched only where some browser is looking (see setView): watching all of it on
// a large Set takes seconds to minutes and slows every Live call; the sweep keeps the rest.
var CORE_RANKS=['song','mute','playing_slot_index','fired_slot_index','solo','arm','mixer'];
var WATCH_ORDER=CORE_RANKS.concat(['structure','clips','devices']);
var SONG_WATCH={is_playing:'playing',record_mode:'record',session_record:'sessionRecord',metronome:'metronome',overdub:'overdub',loop:'loop',back_to_arranger:'backToArrangement',tempo:'tempo',can_undo:'canUndo',can_redo:'canRedo'};
var SONG_STRUCTURE=['tracks','return_tracks','scenes'];
var CONTINUOUS={param:1,tempo:1}; // Can change every frame; sent once per tick, not per change.
var watchesReady=false,allWatched=false,watching={},wanted={},watchQueue={},queuedWatch={},watchPool=[],patches={},observedTargets={},soft={},replanClips={},replanDevices={},pagesChanged=false;
// The observers one group wants, keyed by what they observe. Urgent groups install first.
function wants(owner,urgent){var list={};function add(w){w.owner=owner;w.urgent=urgent;w.key=w.target+'.'+w.prop+(w.page?'.page':'');list[w.key]=w;}
 return {list:list,
  value:function(target,prop,field,rank,param){if(Number(target))add({target:Number(target),prop:prop,field:field,param:param,rank:rank});},
  // A touch carries no value: any change drops these cached reads and re-reads its owner.
  touch:function(target,prop,keys,rank,page){if(Number(target))add({target:Number(target),prop:prop,field:prop,touch:keys,page:!!page,rank:rank});}};}
function trackWants(id,t){
 var vis=!!visibleIds[id],w=wants(id,vis),i;
 if(t.kind!=='master'){w.value(id,'mute','mute','mute');w.value(id,'solo','solo','solo');}
 if(t.kind==='track'){w.value(id,'playing_slot_index','playingSlotIndex','playing_slot_index');w.value(id,'fired_slot_index','firedSlotIndex','fired_slot_index');if(t.canArm)w.value(id,'arm','arm','arm');}
 w.value(t.volume.id,'value','param','mixer',t.volume.id);w.value(t.pan.id,'value','param','mixer',t.pan.id);
 w.touch(id,'name',[id+'.name'],'structure');w.touch(id,'color',[id+'.color'],'structure');w.touch(id,'devices',[id+'#devices'],'structure');
 if(t.kind==='track')w.touch(id,'arrangement_clips',[id+'#arrangement_clips'],'structure');
 if(!vis)return w.list;
 for(i=0;i<t.sends.length;i++)w.value(t.sends[i].id,'value','param','mixer',t.sends[i].id);
 if(t.kind==='track')for(var v=0;v<visibleOffsets.length;v++){var o=visibleOffsets[v];
  if(o===0){for(i=0;i<t.clips.length;i++)slotWants(w,t.clips[i].id,t.clips[i].clipId,false);}
  else for(i=o;i<Math.min(sceneTotal,o+8);i++){var slot=slotAt(id,i);if(slot)slotWants(w,slot,first(api(slot),'clip'),true);}}
 (function walk(list){for(var i=0;i<list.length;i++){var d=list[i];w.touch(d.onId,'value',[d.onId+'.on'],'structure');w.touch(d.id,'name',[d.id+'.name'],'devices');if(d.chains.length)w.touch(d.id,'chains',[d.id+'#chains'],'devices');
  for(var j=0;j<d.chains.length;j++){var c=d.chains[j];w.touch(c.id,'name',[c.id+'.name'],'devices');w.touch(c.id,'devices',[c.id+'#devices'],'devices');walk(c.devices);}}})(t.devices);
 return w.list;
}
// A slot on another scene page reloads that page in browsers instead of re-reading the track.
function slotWants(w,slot,clip,page){w.touch(slot,'has_clip',[slot+'#clip'],'clips',page);w.touch(clip,'name',[clip+'.name'],'clips',page);w.touch(clip,'color',[clip+'.color'],'clips',page);}
function songWants(){var w=wants('song',true),s=Number(song.id);for(var p in SONG_WATCH)w.value(s,p,SONG_WATCH[p],'song');for(var i=0;i<SONG_STRUCTURE.length;i++)w.touch(s,SONG_STRUCTURE[i],[],'song');return w.list;}
// Scene names, colours and launch state on every page some browser shows. The first page is part
// of the song; a rename on another page reloads that page.
var sceneList=[];
function planScenes(){
 var w=wants('song',true),o,i;for(var v=0;v<visibleOffsets.length;v++){o=visibleOffsets[v];for(i=o;i<Math.min(sceneList.length,o+8);i++){var id=sceneList[i];
  w.touch(id,'name',[id+'.name'],'structure',o>0);w.touch(id,'color',[id+'.color'],'structure',o>0);w.value(id,'is_triggered','scene','fired_slot_index');}}
 reconcile('scenes',w.list);
}
// An open or pinned device: every parameter it shows, and its name and parameter list.
function deviceWants(id){var w=wants('d'+id,true),list=ids(api(id),'parameters').slice(0,256);w.touch(id,'name',[id+'.name'],'devices');w.touch(id,'parameters',[id+'#parameters'],'devices');
 for(var i=0;i<list.length;i++){allow(list[i],'parameter');w.value(list[i],'value','param','mixer',list[i]);}return w.list;}
// What browsers show: each reports its visible tracks, its scene page and its open or pinned
// devices (op "view"). With no reports (an older browser, or nobody connected) the first tracks
// stand in.
var views={},visibleIds={},visibleOffsets=[0],visibleDevices={},visibleKey='',viewsAt=0,VIEW_MS=30000,DEFAULT_VISIBLE=8,VIEW_DEVICES=16;
function setView(client,list,offset,devices){
 if(!(list instanceof Array))throw Error('Track list required');
 if(!views[client]&&Object.keys(views).length>=32)throw Error('Too many views; retry shortly');
 var seen={},open={},n=0,i,id;for(i=0;i<list.length&&n<48;i++){id=Number(list[i]);if(kinds[id]&&!seen[id]){seen[id]=1;n++;}}
 if(devices instanceof Array)for(i=0,n=0;i<devices.length&&n<VIEW_DEVICES;i++){id=Number(devices[i]);if(allowed[id]==='device'&&!open[id]){open[id]=1;n++;}}
 views[client]={ids:seen,devices:open,offset:Math.floor(integer(offset,0,100000)/8)*8,at:Date.now()};
 if(sceneViews[client])sceneViews[client].at=Date.now(); // A browser still on that page keeps its targets.
 refreshVisible(true);
}
function refreshVisible(force){
 var now=Date.now();if(!force&&now-viewsAt<1000)return;viewsAt=now;
 var next={},offsets={},devs={},n=0,any=false,c,id,i;
 for(c in views){if(now-views[c].at>VIEW_MS){delete views[c];continue;}any=true;for(id in views[c].ids)if(kinds[id])next[id]=1;offsets[views[c].offset]=1;
  for(id in views[c].devices)if(allowed[id]==='device'&&!devs[id]&&n<VIEW_DEVICES){devs[id]=1;n++;}}
 if(!any){for(i=0,c=0;i<order.length&&c<DEFAULT_VISIBLE;i++)if(kinds[order[i]]==='track'){next[order[i]]=1;c++;}offsets[0]=1;}
 var list=Object.keys(offsets).map(Number).sort(function(a,b){return a-b;}).slice(0,2),key=Object.keys(next).sort().join()+'|'+list.join()+'|'+Object.keys(devs).sort().join();
 if(key===visibleKey)return;visibleKey=key;
 // What was off screen was only swept (from cache), so a track scrolled into view is re-read in
 // full first, unless it was read fresh in the last 2s.
 for(id in next)if(!visibleIds[id]&&trackJSON[id]&&!trackJSON[id].pending&&now-(freshAt[id]||0)>2000)dirty[id]=true;
 var was=visibleIds;visibleIds=next;visibleOffsets=list;
 for(id in was)if(!next[id])planTrack(Number(id));
 for(id in next)planTrack(Number(id));planScenes();
 for(id in visibleDevices)if(!devs[id])unwatch('d'+id);
 for(id in devs)if(!visibleDevices[id])reconcile('d'+id,deviceWants(Number(id)));
 visibleDevices=devs;
}
function planTrack(id,t){var cached=trackJSON[id];if(!cached||cached.pending){unwatch(id);return;}reconcile(id,trackWants(id,t||JSON.parse(cached.json)));}
function reconcile(group,next){
 var have=watching[group]||{},k;wanted[group]=next;
 for(k in have)if(!next[k])release(group,k);
 for(k in next)if(!have[k]&&!queuedWatch[group+'|'+k]){queuedWatch[group+'|'+k]=true;(watchQueue[next[k].rank]||(watchQueue[next[k].rank]=[])).push([group,k]);}
}
function release(group,k){var have=watching[group],rec=have[k];delete have[k];if(rec.w){var t=rec.w.target+'.'+rec.w.prop;if(!--observedTargets[t])delete observedTargets[t];}rec.w=null;try{rec.api.property='';}catch(e){}watchPool.push(rec);}
function unwatch(group){for(var k in watching[group])release(group,k);delete watching[group];delete wanted[group];}
function install(group,w){
 var rec=watchPool.pop();
 try{if(rec){rec.w=w;rec.api.id=w.target;}else{rec={w:w};rec.api=new LiveAPI(function(args){if(rec.w)observed(rec.w,args);},'id '+w.target);}rec.api.property=w.prop;}
 catch(e){if(rec&&rec.api){rec.w=null;watchPool.push(rec);}return;}
 (watching[group]||(watching[group]={}))[w.key]=rec;var t=w.target+'.'+w.prop;observedTargets[t]=(observedTargets[t]||0)+1;
}
function queued(ranks){for(var r=0;r<ranks.length;r++){var q=watchQueue[ranks[r]];if(q&&q.length)return true;}return false;}
// Installs queued observers until the deadline: every urgent group first (on screen, the song,
// open devices), then the rest by rank. True while some are still waiting.
function installWatches(deadline){
 var was=watchesReady,more=installQueued(deadline);if(watchesReady!==was)songAt=0; // Re-read so liveUpdates goes out now.
 return more;
}
function installQueued(deadline){
 if(!wanted.song&&song&&Number(song.id))reconcile('song',songWants());
 for(var pass=0;pass<2;pass++)for(var r=0;r<WATCH_ORDER.length;r++){var q=watchQueue[WATCH_ORDER[r]];if(!q)continue;
  for(var i=0;i<q.length;){var g=q[i][0],k=q[i][1],w=wanted[g]&&wanted[g][k];
   if(!w||watching[g]&&watching[g][k]){q.splice(i,1);delete queuedWatch[g+'|'+k];continue;} // Re-planned meanwhile.
   if(pass===0&&!w.urgent){i++;continue;}
   if(Date.now()>=deadline){watchesReady=!queued(CORE_RANKS);allWatched=false;return true;}
   q.splice(i,1);delete queuedWatch[g+'|'+k];install(g,w);}}
 watchesReady=true;allWatched=true;return false;
}
// Runs inside Live's notification, where changing the Set is not allowed but reading is. Discrete
// values are sent from here at once; fader and tempo streams are coalesced into one patch per tick.
// The first call reports the current value. After that each call is a real change and is always
// sent, even if a sweep already cached the new value: otherwise that race costs a whole snapshot.
function observed(w,args){if(!args||args[0]!==w.prop)return;
 if(w.touch){if(!w.seen){w.seen=true;return;}for(var i=0;i<w.touch.length;i++)delete recent[w.touch[i]];
  // A device's name or parameter list: browsers showing it fetch it again.
  if(String(w.owner).charAt(0)==='d'){replanDevices[w.owner.slice(1)]=true;(patches[w.owner]||(patches[w.owner]={})).changed=1;if(!flushing)flushPatches(true);else patchTask.schedule(0);}
  else if(w.page){pagesChanged=true;if(w.owner!=='song')replanClips[w.owner]=true;}else if(w.owner==='song')songAt=0;else soft[w.owner]=true;
  if(!softBusy)softSync();else softTask.schedule(0);return;}
 var v=Number(args[1]);if(!('last' in w)){w.last=v;return;}if(v===w.last)return;w.last=v;
 (patches[w.owner]||(patches[w.owner]={}))[w.field==='scene'?'s'+w.target:w.param?'p'+w.param:w.field]=v;
 if(!CONTINUOUS[w.field]){if(!flushing)flushPatches(true);else patchTask.schedule(0);return;}
 // A fader or tempo move: the first change goes at once, the rest at most every CONTINUOUS_MS.
 var wait=continuousAt+CONTINUOUS_MS-Date.now();if(wait<=0&&!flushing)flushPatches(false);else patchTask.schedule(Math.max(1,wait));}
function displayOf(id,v){var d='';try{d=String(api(id).call('str_for_value',v));}catch(e){}displays[id]={value:v,display:d};return d;}
function trackPatch(id,p){
 var cached=trackJSON[id];if(!cached||cached.pending)return null;
 var t=JSON.parse(cached.json),e={id:id,level:levels[id]||0},changed=false,k,i,v;
 for(k in p){v=p[k];
  if(k==='mute'||k==='solo'||k==='arm'){v=!!v;if(k==='arm'&&!t.canArm)continue;if(k==='arm')armed[id]=v||t.implicitArm;t[k]=v;e[k]=v;changed=true;}
  else if(k==='playingSlotIndex'||k==='firedSlotIndex'){
   var flag=k==='playingSlotIndex'?'playing':'triggered';
   for(i=0;i<t.clips.length;i++){var c=t.clips[i];c[flag]=c.index===v&&(flag==='triggered'||!!c.clipId);}
   t[k]=v;e[k]=v;changed=true;
  }
  else if(k.charAt(0)==='p'){var pid=Number(k.slice(1)),list=[t.volume,t.pan].concat(t.sends),q=null;for(i=0;i<list.length;i++)if(list[i]&&list[i].id===pid)q=list[i];
   if(q){q.value=v;q.display=displayOf(pid,v);(e.params||(e.params=[])).push({id:pid,value:v,display:q.display});changed=true;}}
 }
 if(!changed)return null;cached.json=JSON.stringify(t);return e;
}
// Scene launch state (s<id>) goes beside the song: a browser on another scene page shows it too.
function songPatch(p,scenes){if(!head)return null;var out=null,k,v,i;for(k in p){v=k==='tempo'?p[k]:!!p[k];
  if(/^s\d/.test(k)){var sid=Number(k.slice(1));scenes[sid]=v;for(i=0;i<head.scenes.length;i++)if(head.scenes[i].id===sid)head.scenes[i].triggered=v;continue;}
  head[k]=v;(out||(out={}))[k]=v;}
 headBody=JSON.stringify(head);return out;}
function devicePatch(id,p){var e={id:id},any=false;for(var k in p){if(k==='changed')e.changed=any=true;else if(k.charAt(0)==='p'){var pid=Number(k.slice(1));(e.params||(e.params=[])).push({id:pid,value:p[k],display:displayOf(pid,p[k])});any=true;}}return any?e:null;}
// Discrete changes are sent from the notification itself (a Task waited behind Live's redraw, like
// softSync); fader and tempo streams wait for the tick, which also formats their display text.
var flushing=false,continuousAt=0,CONTINUOUS_MS=30;
function flushPatches(discrete){
 var all=patches,list=[],devs=[],scenes={},songOut=null,e,id,k,later={};patches={};if(!discrete)continuousAt=Date.now();
 if(discrete)for(id in all)for(k in all[id])if(k==='tempo'||/^p\d/.test(k)){(later[id]||(later[id]={}))[k]=all[id][k];delete all[id][k];}
 for(id in later)patches[id]=later[id];
 flushing=true;try{for(id in all){if(id==='song')songOut=songPatch(all[id],scenes);else if(id.charAt(0)==='d'){if((e=devicePatch(Number(id.slice(1)),all[id])))devs.push(e);}else if((e=trackPatch(Number(id),all[id])))list.push(e);}}finally{flushing=false;}
 var anyScene=false;for(k in scenes){anyScene=true;break;}
 if(!bridgeReady||!list.length&&!songOut&&!devs.length&&!anyScene)return;
 var m={patch:true,liveAt:Date.now(),position:Number(read(song,'current_song_time')),transport:liveTransport(),tracks:list};if(songOut)m.song=songOut;if(devs.length)m.devices=devs;if(anyScene)m.sceneTriggered=scenes;
 send('patch',JSON.stringify(stampPatch(m)));
}
var patchTask=new Task(flushPatches,this);
// A structural change is read inside Live's notification itself: reading is allowed there, only
// changing the Set is not. A Task waited 70-180ms behind Live redrawing the change (measured on a
// 64-track Set); this way a rename shows as fast as a mute. Only what the change touched is
// re-read, from cache (1-3ms), and only the tracks that changed are sent (see emitState).
var softBusy=false;
function readSoft(deadline){for(var id in soft){if(Date.now()>=deadline)return true;delete soft[id];if(trackJSON[id]&&!dirty[id]){fresh=false;try{readTrack(Number(id));}finally{fresh=true;}}}for(id in replanClips){delete replanClips[id];planTrack(Number(id));}for(id in replanDevices){delete replanDevices[id];if(visibleDevices[id])reconcile('d'+id,deviceWants(Number(id)));}return false;}
function softSync(){
 if(!bridgeReady||!song||!Number(song.id)||!loaded||softBusy)return; // Otherwise the next tick reads it.
 softBusy=true;var more=false;
 try{if(!songAt){fresh=false;try{readSong();}finally{fresh=true;}}more=readSoft(Date.now()+DIRTY_MS);emitState();}
 catch(e){diagnostic('Could not read a change: '+e);}
 softBusy=false;if(more)softTask.schedule(5);
}
var softTask=new Task(softSync,this);

function target(r,kind){var id=Number(r.target);if(!id||(allowed[id]!==kind&&leased[id]!==kind))throw Error('Target is stale; refresh the controller');return api(id);}
function finite(v,min,max){v=Number(v);if(!isFinite(v)||v<min||v>max)throw Error('Value outside allowed range');return v;}
function integer(v,min,max){v=finite(v,min,max);if(Math.round(v)!==v)throw Error('Integer required');return v;}
function boolean(v){if(v!==true&&v!==false&&v!==0&&v!==1)throw Error('Boolean required');return Number(v);}
function name(v){v=String(v);if(v.length>128)throw Error('Name is too long');return v;}
function call_(a,f,args){return a.call.apply(a,[f].concat(args||[]));}
function createdId(list,before){
 var after=ids(song,list),added=[];
 for(var i=0;i<after.length;i++)if(before.indexOf(after[i])<0)added.push(after[i]);
 if(added.length!==1)throw Error('Live did not confirm the new item');
 return added[0];
}
function command(raw){var packet=null;try{packet=JSON.parse(raw);if(packet.type==='sync'){stateSync(packet);return;}var r=packet.request,op=r.op,result=true;if(r.epoch!==epoch)throw Error('Live Set changed; wait for refresh');
 if(op==='refresh'){staleAll();forceEmit=true;}
 else if(op==='play')song.call('start_playing');else if(op==='stop')song.call('stop_playing');else if(op==='continue')song.call('continue_playing');else if(op==='stop_all')song.call('stop_all_clips');else if(op==='tap')song.call('tap_tempo');else if(op==='undo'||op==='redo'||op==='capture_midi'||op==='re_enable_automation')song.call(op);
 else if(op==='song_set'){
  var bools=['back_to_arranger','record_mode','session_record','metronome','overdub','loop','punch_in','punch_out','session_automation_record','arrangement_overdub'];var ranges={tempo:[20,999],loop_start:[0,100000],loop_length:[.0625,100000],current_song_time:[0,100000],groove_amount:[0,1]};
  if(bools.indexOf(r.property)>=0)song.set(r.property,boolean(r.value));else if(ranges[r.property])song.set(r.property,finite(r.value,ranges[r.property][0],ranges[r.property][1]));else if(r.property==='clip_trigger_quantization')song.set(r.property,integer(r.value,0,13));else if(r.property==='signature_numerator')song.set(r.property,integer(r.value,1,32));else if(r.property==='signature_denominator'){var den=integer(r.value,1,16);if([1,2,4,8,16].indexOf(den)<0)throw Error('Invalid denominator');song.set(r.property,den);}else throw Error('Unsupported song property');
 }
 else if(op==='track_set'){var a=target(r,'track');if(['mute','solo','arm','fold_state'].indexOf(r.property)>=0)a.set(r.property,boolean(r.value));else if(r.property==='current_monitoring_state')a.set(r.property,integer(r.value,0,2));else if(r.property==='name')a.set('name',name(r.value));else if(r.property==='color')a.set('color',integer(r.value,0,16777215));else throw Error('Unsupported track property');}
 else if(op==='parameter'){var a=target(r,'parameter');if(!Number(read(a,'is_enabled')))throw Error('Parameter is disabled');var v=finite(r.value,Number(read(a,'min')),Number(read(a,'max')));if(Number(read(a,'is_quantized')))v=Math.round(v);a.set('value',v);result=Number(read(a,'value'));if(r.display===true)result={id:Number(r.target),value:result,display:String(a.call('str_for_value',result))};}
 else if(op==='track_stop')target(r,'track').call('stop_all_clips');
 else if(op==='track_create'){
  var list=r.kind==='return'?'return_tracks':'tracks',before=ids(song,list);
  if(r.kind==='midi')song.call('create_midi_track',-1);
  else if(r.kind==='audio')song.call('create_audio_track',-1);
  else if(r.kind==='return')song.call('create_return_track');
  else throw Error('Invalid track kind');
  result=createdId(list,before);
 }
 else if(op==='track_duplicate'||op==='track_delete'){var a=target(r,'track');if(a.id===ownTrack)throw Error('Move the remote device before deleting or duplicating its track');var index=ids(song,'tracks').indexOf(Number(a.id));if(index<0){var ri=ids(song,'return_tracks').indexOf(Number(a.id));if(op==='track_delete'&&ri>=0){song.call('delete_return_track',ri);}else throw Error('Only ordinary tracks can be duplicated');}else song.call(op==='track_delete'?'delete_track':'duplicate_track',index);}
 else if(op==='scene_fire')target(r,'scene').call('fire');
 else if(op==='scene_create'){
  var before=ids(song,'scenes');
  song.call('create_scene',-1);
  var id=createdId('scenes',before);
  result={id:id,name:read(attach(id,'scene'),'name','Scene')};
 }
 else if(op==='scene_duplicate'||op==='scene_delete'){var a=target(r,'scene'),idx=ids(song,'scenes').indexOf(Number(a.id));song.call(op==='scene_delete'?'delete_scene':'duplicate_scene',idx);}
 else if(op==='scene_rename')target(r,'scene').set('name',name(r.value));
 else if(op==='view')setView(String(packet.client),r.tracks,r.offset,r.devices);
 else if(op==='scene_window'){result=scenePage(integer(r.offset,0,100000),String(packet.client));send('result',JSON.stringify({type:'result',id:packet.id,client:packet.client,ok:true,result:result}));return;}
 else if(op==='clip_fire')target(r,'slot').call('fire');else if(op==='clip_stop')target(r,'slot').call('stop');
 else if(op==='clip_create')target(r,'slot').call('create_clip',finite(r.length, .25,1024));else if(op==='clip_delete')target(r,'slot').call('delete_clip');
 else if(op==='clip_set'){var a=target(r,'clip');if(r.property==='name')a.set('name',name(r.value));else if(['looping','muted','warping'].indexOf(r.property)>=0)a.set(r.property,boolean(r.value));else if(r.property==='launch_mode')a.set(r.property,integer(r.value,0,3));else if(r.property==='launch_quantization')a.set(r.property,integer(r.value,0,14));else if(r.property==='color')a.set(r.property,integer(r.value,0,16777215));else if(['loop_start','loop_end','start_marker','end_marker'].indexOf(r.property)>=0)a.set(r.property,finite(r.value,0,100000));else if(r.property==='gain')a.set('gain',finite(r.value,0,1));else throw Error('Unsupported clip property');}
 else if(op==='clip_double')target(r,'clip').call('duplicate_loop');
 else if(op==='clip_quantize')target(r,'clip').call('quantize',integer(r.grid,0,8),finite(r.amount,0,1));

 else if(op==='clip_notes_get'){var a=target(r,'clip');var raw=a.call('get_notes_extended',0,128,0,100000);if(raw instanceof Array&&raw[0]==='dictionary')result=JSON.parse(new Dict(raw[1]).stringify());else if(typeof raw==='string')result=JSON.parse(raw);else result={raw:raw};}
 else if(op==='clip_note_add'){var a=target(r,'clip');var nd=new Dict();nd.parse(JSON.stringify({notes:[{pitch:integer(r.pitch,0,127),start_time:finite(r.start,0,100000),duration:finite(r.duration,.015625,1024),velocity:finite(r.velocity,1,127)}]}));result=a.call('add_new_notes',nd.stringify());}
 else if(op==='clip_note_delete'){var a=target(r,'clip');a.call('remove_notes_by_id',integer(r.noteId,0,2147483647));}
 else if(op==='device_insert'){var a=target(r,'track');var nm=name(r.name);var before=ids(a,'devices');a.call('insert_device',nm);var after=ids(a,'devices');if(after.length<=before.length)throw Error('Live could not insert this device. Check that it is installed and valid for this track.');result=after[after.length-1];}
 else if(op==='device_delete'){var d=target(r,'device');var parent=api(first(d,'canonical_parent'));if(Number(d.id)===Number(new LiveAPI(null,'this_device').id))throw Error('The controller cannot delete itself');var index=ids(parent,'devices').indexOf(Number(d.id));if(index<0)throw Error('Device is no longer present');var deletedId=Number(d.id);parent.call('delete_device',index);if(ids(parent,'devices').indexOf(deletedId)>=0)throw Error('Live could not delete this device');}
 else if(op==='clip_duplicate'){var a=target(r,'track');a.call('duplicate_clip_slot',integer(r.index,0,10000));}
 else if(op==='clip_to_arrangement'){var a=target(r,'track');var c=api(integer(r.clip,1,2147483647));if(allowed[c.id]!=='clip'&&leased[c.id]!=='clip')throw Error('Clip is stale');a.call('duplicate_clip_to_arrangement','id',c.id,finite(r.position,0,100000));}
 else if(op==='arrangement_create'){var a=target(r,'track');a.call('create_midi_clip',finite(r.position,0,100000),finite(r.length,.25,1024));}
 else if(op==='arrangement_delete'){var c=target(r,'clip');var parent=api(first(c,'canonical_parent'));parent.call('delete_clip','id',c.id);}
 else if(op==='eq8_view'){
  var d=target(r,'device');if(read(d,'class_name','')!=='Eq8')throw Error('Target is not EQ Eight');
  var current=eq8State(d);if(!current.available)throw Error('EQ Eight view API unavailable; update Live/Max');
  var mode=r.globalMode===undefined?current.globalMode:Number(r.globalMode),edit=r.editMode===undefined?current.editMode:Number(r.editMode),band=r.selectedBand===undefined?current.selectedBand:Number(r.selectedBand);
  if([0,1,2].indexOf(mode)<0||[0,1].indexOf(edit)<0||band!==Math.floor(band)||band<1||band>8)throw Error('Invalid EQ Eight view state');
  if(mode===0)edit=0;
  if(mode!==current.globalMode)d.set('global_mode',mode);
  if(edit!==current.editMode||mode!==current.globalMode)d.set('edit_mode',edit);
  if(band!==current.selectedBand)api(first(d,'view')).set('selected_band',band-1);
  result=deviceDetail(Number(r.target));
 }
 else if(op==='device_get'){target(r,'device');result=deviceDetail(Number(r.target));}
 else if(op==='parameter_automation'){target(r,'parameter').call('re_enable_automation');}
 else if(op==='device_select'){target(r,'device');}
 else if(op==='routing_get'){var a=target(r,'track');result={inputs:routings(a,'available_input_routing_types'),inputChannels:routings(a,'available_input_routing_channels'),outputs:routings(a,'available_output_routing_types'),outputChannels:routings(a,'available_output_routing_channels'),input:routings(a,'input_routing_type'),output:routings(a,'output_routing_type'),inputChannel:routings(a,'input_routing_channel'),outputChannel:routings(a,'output_routing_channel')};}
 else if(op==='routing_set'){var a=target(r,'track');if(['input_routing_type','input_routing_channel','output_routing_type','output_routing_channel'].indexOf(r.property)<0)throw Error('Invalid routing property');var dict=new Dict();dict.parse(JSON.stringify(r.value));a.set(r.property,dict.stringify());}
 else throw Error('Unsupported operation: '+op);
 send('result',JSON.stringify({type:'result',id:packet.id,client:packet.client,ok:true,result:result}));afterCommand(op,r);
 }catch(e){send('result',JSON.stringify({type:'result',id:packet?packet.id:null,client:packet?packet.client:null,ok:false,error:String(e)}));}}
var READ_ONLY={view:1,refresh:1,device_get:1,routing_get:1,clip_notes_get:1,scene_window:1,device_select:1};
// Re-read just what the command touched, straight away, so its ACK is followed
// by accurate state and targets. Song-wide operations age every track instead.
function afterCommand(op,r){
 if(READ_ONLY[op])return;
 // Watched values come back through their observer the instant they change; nothing to re-read.
 var watchedProp={track_set:r.property,clip_set:r.property,parameter:'value',clip_create:'has_clip',clip_delete:'has_clip'}[op];
 if(watchedProp&&observedTargets[r.target+'.'+watchedProp])return;
 if(op==='song_set'){songAt=0;return;} // The next tick re-reads the song; tracks are unaffected.
 if(r.target)markDirty(Number(r.target));
 songAt=0;
 if(op==='parameter')return;
 forceEmit=true;
 if(!/^(track_set|track_stop|clip_|device_|arrangement_|routing_)/.test(op))staleAll();
 sync();
}
function pulse(){promotions=loaded?1:0;if(!song||!Number(song.id)){song=new LiveAPI(null,"live_set");}if(!loaded){sync();return;}flushPatches();if(controllers===0){if(++idleTick%10===0)sync();else if(bridgeReady)installWatches(Date.now()+WATCH_MS);return;}meters();sync();}
// The first read runs flat out even with nobody connected, so opening the link later is instant.
function finishedLoading(){loaded=true;task.cancel();task.interval=100;task.repeat();}
var task=new Task(pulse,this);task.interval=30;
// Nothing is read or sent until the bridge says it is listening (see refresh).
function initialize(){try{song=new LiveAPI(null,'live_set');ownTrack=Number(new LiveAPI(null,'this_device canonical_parent').id);task.repeat();}catch(e){diagnostic(e);}}
function notifydeleted(){task.cancel();for(var id in watching)unwatch(id);cache={};}
