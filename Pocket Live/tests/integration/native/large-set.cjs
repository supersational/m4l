// Regression for "Syncing… forever" on real Sets: Max truncates symbols at 32,767
// characters, and one snapshot of a big Set could block its thread for seconds.
// Reads are a fake Live whose clock advances per read, so budgets are deterministic.
const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict');
const {Frames}=require(ROOT+'/maxnode/frames.cjs');const {fitState}=require(ROOT+'/maxnode/waveforms.cjs');
const {LIMIT,host,received}=require('../../harness/fake-live.cjs');

{ // Silent before the bridge is ready ("Node script not ready can't handle message").
 const h=host(4);for(let i=0;i<5;i++)h.tick();assert.equal(h.out.length,0);assert.equal(h.reads(),0);
}
{ // A snapshot far over the limit arrives whole, with non-ASCII intact, through ASCII frames.
 const h=host(40);h.context.refresh();let state=null;
 for(let i=0;i<200&&!state;i++){h.tick();state=received(h.out).find(m=>m[0]==='state'&&!m[1].includes('"pending":true'));}
 assert.ok(state,'state must be delivered');assert.ok(state[1].length>LIMIT,'fixture must exceed the limit');assert.ok(h.out.some(m=>m[0]==='frame'));
 for(const m of h.out)for(const x of m)if(typeof x==='string')assert.ok(/^[\x00-\x7e]*$/.test(x),'frames must be ASCII');
 const parsed=JSON.parse(state[1]);assert.equal(parsed.tracks.length,41);assert.equal(parsed.name,'Big 日本語');assert.equal(parsed.tracks[0].devices[0].name,'Device 🎹');assert.equal(parsed.device,null);
 console.log('Passed: '+state[1].length+'-character snapshot framed under Max\'s limit, non-ASCII intact.');
}
{ // Reading `parameters` makes Live mint an ID per parameter: 85% of a large Set's load time.
 const h=host(40);h.context.refresh();for(let i=0;i<400;i++)h.tick();
 assert.equal(h.asked.parameters||0,0,'loading and refreshing must not list device parameters');assert.equal(h.asked.clip_slots||0,0,'loading and refreshing must not list clip slots');
 const last=JSON.parse(received(h.out).filter(m=>m[0]==='state').at(-1)[1]);
 const device=last.tracks[0].devices[0];assert.ok(device.onId,'Device On must still be found');
 assert.equal(h.native[device.onId].name,'On');
 console.log('Passed: loading never lists device parameters or clip slots; Device On is still resolved.');
}
{ // Every mixer strip paints first and is already controllable; the rest fills in afterwards.
 const h=host(40);h.context.refresh();let state=null,ticks=0;
 while(!state&&ticks++<200){h.tick();state=received(h.out).find(m=>m[0]==='state');}
 const first=JSON.parse(state[1]);assert.equal(first.tracks.length,41);
 assert.ok(first.tracks.every(t=>t.pending&&t.volume.id&&t.pan.id&&t.clips.length===0&&t.devices.length===0),'first state is mixer strips');
 const reads=h.reads();assert.ok(ticks<=2,'strips took '+ticks+' ticks');
 h.context.command(JSON.stringify({id:1,client:'c',request:{op:'track_set',epoch:first.epoch,target:first.tracks[3].id,property:'mute',value:1}}));
 assert.equal(JSON.parse(received(h.out).find(m=>m[0]==='result')[1]).ok,true,'a pending track must accept commands');
 for(let i=0;i<200;i++)h.tick();
 const states=received(h.out).filter(m=>m[0]==='state').map(m=>JSON.parse(m[1])),last=states.at(-1);
 assert.ok(last.tracks.every(t=>!t.pending),'every track must finish');assert.ok(last.tracks[0].clips.length&&last.tracks[0].devices.length);
 assert.ok(states.length<40,'filling in sent '+states.length+' snapshots');
 console.log('Passed: strips painted within '+ticks+' ticks ('+reads+' reads), then filled in '+states.length+' snapshots.');
}
{ // Slots are cached by index, so inserting a scene must not leave a track showing the old ones.
 const h=host(2);h.context.refresh();for(let i=0;i<100;i++)h.tick();
 const tr=h.native[h.native[1].tracks[1]],moved=tr.clip_slots[1],added=90000;h.native[added]={clip:[]};tr.clip_slots.unshift('id',added);
 const scene=90001;h.native[scene]={name:'New',color:0};h.native[1].scenes.unshift('id',scene);
 for(let i=0;i<60;i++)h.tick();
 const clips=JSON.parse(received(h.out).filter(m=>m[0]==='state').at(-1)[1]).tracks[0].clips;
 assert.equal(clips[0].id,added);assert.equal(clips[1].id,moved);
 console.log('Passed: inserting a scene re-resolves cached clip slots.');
}
{ // No tick may block for long, however large the Set is.
 const h=host(128);h.context.refresh();let first=0;for(let i=0;i<200;i++)first=Math.max(first,h.tick());
 assert.ok(first<150,'first load blocked a tick for '+first+'ms');
 // Observers install in their own slot after loading; then a tick is only the cheap sweep.
 let installing=0,ticks=0;while(!h.context.allWatched&&ticks++<2000)installing=Math.max(installing,h.tick());
 assert.ok(h.context.allWatched,'observers never finished installing');assert.ok(installing<80,'installing observers blocked a tick for '+installing+'ms');
 let worst=0;for(let i=0;i<200;i++)worst=Math.max(worst,h.tick());
 assert.ok(worst<60,'a running tick blocked for '+worst+'ms');
 assert.ok(received(h.out).some(m=>m[0]==='state'));
 console.log('Passed: 128-track Set: first-load tick <= '+first.toFixed(0)+'ms, installing <= '+installing.toFixed(0)+'ms ('+h.created()+' observers in '+ticks+' ticks), running tick <= '+worst.toFixed(0)+'ms.');
}
{ // Idle sets heartbeat only until observers are in place, never constantly; a change is sent promptly.
 const h=host(8);h.context.refresh();for(let i=0;i<100;i++)h.tick();
 const count=()=>received(h.out).filter(m=>m[0]==='state').length,before=count();
 for(let i=0;i<30;i++)h.tick();assert.ok(count()-before<=1,'idle resend');
 // Once observers are in place there is no heartbeat at all: Node holds the Set, and digests check it.
 while(!h.context.watchesReady)h.tick();for(let i=0;i<60;i++)h.tick();const settled=count();for(let i=0;i<200;i++)h.tick();assert.equal(count()-settled,0,'settled Set resent '+(count()-settled)+' snapshots in 20s');
 // A song value changed in Live goes as a song patch (or a snapshot), not after a heartbeat.
 h.native[1].tempo=99;const sent=()=>received(h.out).some(m=>m[0]==='state'&&JSON.parse(m[1]).tempo===99||m[0]==='patch'&&JSON.parse(m[1]).song?.tempo===99);let ticks=0;while(!sent()&&ticks<20){h.tick();ticks++;}
 assert.ok(ticks<20,'tempo change never sent');
 console.log('Passed: settled Set sends no snapshots; a change is sent within '+ticks*100+'ms.');
}
{ // After first load, background sweeps skip values that cannot have changed.
 const h=host(40);h.context.refresh();for(let i=0;i<150;i++)h.tick();
 let before=h.reads();for(let i=0;i<50;i++)h.tick();const busy=(h.reads()-before)/50;
 assert.ok(busy<340,'idle reads per tick: '+busy);
 // With nobody connected it goes almost silent, and wakes on the first controller.
 h.context.presence(0);for(let i=0;i<20;i++)h.tick();const sent=h.out.length;before=h.reads();for(let i=0;i<50;i++)h.tick();const quiet=(h.reads()-before)/50;
 assert.ok(quiet<busy/3,'no-controller reads per tick: '+quiet+' vs '+busy);assert.equal(h.out.filter((m,i)=>i>=sent&&m[0]==='meters').length,0,'no meters without controllers');
 const heard=h.out.length;h.context.presence(1);for(let i=0;i<5;i++)h.tick();assert.ok(h.out.length>heard,'must wake on presence');
 // Quiet meters only send a keepalive.
 for(let i=0;i<30;i++)h.tick();const m0=h.out.filter(m=>m[0]==='meters').length;for(let i=0;i<40;i++)h.tick();const quietMeters=h.out.filter(m=>m[0]==='meters').length-m0;assert.ok(quietMeters<=20,'meter keepalive only: '+quietMeters);
 console.log('Passed: '+busy.toFixed(0)+' reads/tick with a controller, '+quiet.toFixed(0)+' with none; quiet meters only keepalive.');
}
{ // A command re-reads only its track, immediately, and removed targets go stale.
 const h=host(40);h.context.refresh();for(let i=0;i<200;i++)h.tick();
 const before=h.reads(),track=h.native[1].tracks[1];
 h.context.command(JSON.stringify({id:'a',client:'c',request:{epoch:'1',op:'track_set',target:track,property:'mute',value:1}}));
 assert.ok(h.reads()-before<800,'command re-read too much: '+(h.reads()-before));
 assert.ok(received(h.out).some(m=>m[0]==='result'&&JSON.parse(m[1]).id==='a'&&JSON.parse(m[1]).ok));
 const gone=h.native[1].tracks.splice(2,2)[1];for(let i=0;i<20;i++)h.tick();
 h.context.command(JSON.stringify({id:'b',client:'c',request:{epoch:'1',op:'track_set',target:gone,property:'mute',value:1}}));
 assert.equal(JSON.parse(received(h.out).filter(m=>m[0]==='result').at(-1)[1]).ok,false);
 console.log('Passed: commands re-read one track; deleted track targets are rejected.');
}
{ // Frames: incomplete or out-of-order messages are reported, never parsed.
 const got=[],errors=[],f=new Frames((s,j)=>got.push([s,j]),e=>errors.push(e));
 f.accept(1,0,2,'state','~{"a"');f.accept(1,1,2,'state','~:1}');assert.deepEqual(got,[['state','{"a":1}']]);
 f.accept(2,0,3,'state','~x');f.accept(2,2,3,'state','~y');assert.equal(got.length,1);assert.equal(errors.length,1);
 f.accept(3,0,2,'state','~x');f.accept(4,0,1,'result','~{}');assert.deepEqual(got.at(-1),['result','{}']);assert.equal(errors.length,2);
}
{ // Relay guard: arrangement detail is shed before a snapshot can exceed 2 MiB.
 const huge={tracks:Array.from({length:128},()=>({arrangement:Array.from({length:128},()=>({name:'x'.repeat(40),audio:{markers:Array(40).fill({beat_time:1,sample_time:2})}}))}))};
 assert.ok(Buffer.byteLength(JSON.stringify(huge))>2097152);const fitted=fitState(huge);assert.ok(Buffer.byteLength(JSON.stringify(fitted))<=1500000);assert.equal(fitted.arrangementLimited,true);
 console.log('Passed: frames reject incomplete messages; oversized snapshots shed arrangement detail.');
}

{ // Observers: a change made in Live reaches browsers as a small patch, without a snapshot.
 const h=host(40);h.context.refresh();
 for(let i=0;i<400&&!h.context.loaded;i++)h.tick();assert.ok(h.context.loaded,'first load finished');
 // Installed gradually: no tick may spend long creating them, and mute comes first.
 let worst=0;for(let i=0;i<200;i++){worst=Math.max(worst,h.tick());}
 assert.ok(worst<80,'observer installation stays inside a tick budget: '+worst+'ms');
 const tr=h.native[1].tracks.filter((_,i)=>i%2).map(Number),watched=[...h.observers];
 assert.ok(watched.filter(o=>o.watched==='mute').length>=tr.length,'every track mute is observed');
 const before=h.created();
 const messages=()=>received(h.out.splice(0));messages();
 // Once the core observers are in place there is no heartbeat: start each window settled and drained.
 const settled=()=>{for(let i=0;i<4000&&!h.context.watchesReady;i++)h.tick();for(let i=0;i<3;i++)h.tick();messages();};
 settled();h.change(tr[3],'mute',1);h.settle();
 let got=messages(),patch=got.find(m=>m[0]==='patch');
 assert.ok(patch,'mute patch sent before the next tick');const p=JSON.parse(patch[1]);
 assert.deepEqual(p.tracks.map(t=>[t.id,t.mute]),[[tr[3],true]]);assert.ok(p.transport&&'position' in p,'patch is a valid meters message for older browsers');
 // A sweep can read Live's new value before Live notifies the observer: the patch must still go.
 h.native[tr[6]].mute=1;for(let i=0;i<80;i++)h.tick();messages();
 h.change(tr[6],'mute',1);h.settle();
 assert.deepEqual(messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]).tracks.map(t=>[t.id,t.mute])),[[[tr[6],true]]],'observed change patched even when the sweep saw it first');
 // Sweeps that re-read the same value must not resend the whole Set.
 settled();
 for(let i=0;i<20;i++)h.tick();got=messages();
 assert.equal(got.filter(m=>m[0]==='state').length,0,'no snapshot for a change already patched');
 // A fader move: the first change goes at once with Live's display text, the rest of the burst
 // is coalesced into one trailing patch.
 const vol=JSON.parse(h.context.trackJSON[tr[5]].json).volume.id;h.change(vol,'value',.25);
 got=messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]));
 assert.equal(got.length,1,'first fader change sent at once');assert.deepEqual(got[0].tracks[0].params.map(p=>[p.id,p.value]),[[vol,.25]]);assert.ok(got[0].tracks[0].params[0].display!==undefined,'display text sent');
 h.change(vol,'value',.28);h.change(vol,'value',.3);
 assert.equal(messages().filter(m=>m[0]==='patch').length,0,'the rest of the burst waits');
 h.settle();got=messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]));
 assert.equal(got.length,1);assert.deepEqual(got[0].tracks[0].params.map(p=>[p.id,p.value]),[[vol,.3]]);
 // Sweeps trust the observed value instead of asking Live again.
 // (Off-screen sends are not observed, so only the volume and pan reads are counted.)
 const mixerIds=tr.flatMap(id=>{const t=JSON.parse(h.context.trackJSON[id].json);return [t.volume.id,t.pan.id];}),mixerReads=()=>mixerIds.reduce((n,id)=>n+(h.asked[id+'.value']||0),0);
 const asked=mixerReads();for(let i=0;i<40;i++)h.tick();assert.equal(JSON.parse(h.context.trackJSON[tr[5]].json).volume.value,.3);
 assert.ok(mixerReads()-asked<tr.length,'observed mixer values are not re-read: '+(mixerReads()-asked));
 // A clip launch: fired then playing, both observed, and the cached clip agrees.
 settled();h.change(tr[2],'fired_slot_index',2);h.settle();h.change(tr[2],'fired_slot_index',-1);h.change(tr[2],'playing_slot_index',2);h.settle();
 got=messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]).tracks[0]);
 // Each is sent from Live's notification as it happens, without waiting for a task or a tick.
 assert.deepEqual(got.map(t=>[t.firedSlotIndex,t.playingSlotIndex]),[[2,undefined],[-1,undefined],[undefined,2]]);
 assert.ok(JSON.parse(h.context.trackJSON[tr[2]].json).clips[2].playing,'cache updated, so later snapshots agree');
 for(let i=0;i<20;i++)h.tick();assert.equal(messages().filter(m=>m[0]==='state').length,0,'sweep agrees with the patched clip state');
 // A browser mute is set, observed and patched, with no track re-read.
 h.context.epoch=h.context.epoch;const reads=h.reads();
 h.context.command(JSON.stringify({id:1,client:'c',request:{op:'track_set',epoch:h.context.epoch,target:tr[4],property:'mute',value:true}}));h.settle();
 got=messages();assert.ok(got.find(m=>m[0]==='result'&&JSON.parse(m[1]).ok));
 assert.deepEqual(JSON.parse(got.find(m=>m[0]==='patch')[1]).tracks.map(t=>t.mute),[true]);
 assert.ok(h.reads()-reads<10,'observed command reads almost nothing: '+(h.reads()-reads));
 // Song values too: a tempo change shows without a snapshot.
 settled();h.change(1,'tempo',140);h.tick();got=messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]));
 assert.equal(got[0].song.tempo,140);for(let i=0;i<5;i++)h.tick();assert.equal(messages().filter(m=>m[0]==='state').length,0);
 // A deleted track stops its observers; their objects are reused, not recreated.
 const gone=tr[7];h.native[1].tracks.splice(h.native[1].tracks.indexOf(gone)-1,2);for(let i=0;i<10;i++)h.tick();
 assert.ok(![...h.observers].some(o=>o.id===gone),'deleted track unobserved');
 h.native[1].tracks.push('id',gone);for(let i=0;i<60;i++)h.tick();
 assert.ok([...h.observers].some(o=>o.id===gone&&o.watched==='mute'),'re-added track observed again');
 assert.equal(h.created(),before,'observers were reused from the pool');
}
{ // Structural edits made in Live: one track is re-read from cache and sent alone, at once.
 const h=host(24);h.context.refresh();
 for(let i=0;i<400&&!h.context.loaded;i++)h.tick();
 for(let i=0;i<2000&&!h.context.allWatched;i++)h.tick();assert.ok(h.context.allWatched,'all observers installed');
 const tr=h.native[1].tracks.filter((_,i)=>i%2).map(Number);
 const messages=()=>received(h.out.splice(0));
 let viewed=null,viewId=100;const keepView=()=>{if(viewed)h.context.command(JSON.stringify({id:++viewId,client:'c',request:{op:'view',epoch:h.context.epoch,tracks:viewed,offset:0}}));};
 // Browsers renew their view every 10s.
 const settled=()=>{keepView();for(let i=0;i<3;i++)h.tick();messages();};
 // The change is sent from Live's notification, before the next tick, as only that track.
 const edit=(fn)=>{settled();const reads=h.reads();fn();h.settle();const got=messages(),patches=got.filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]));
  assert.equal(got.filter(m=>m[0]==='state').length,0,'no whole snapshot for one edit');if(process.env.SHOW)console.log('   edit:',h.reads()-reads,'reads,',patches.map(p=>JSON.stringify(p).length+' chars').join());return {patches,replaced:patches.flatMap(p=>p.replace||[]),reads:h.reads()-reads};};
 let r=edit(()=>h.change(tr[2],'name','Renamed in Live'));
 assert.deepEqual(r.replaced.map(t=>[t.id,t.name]),[[tr[2],'Renamed in Live']]);assert.ok(r.reads<200,'rename re-read '+r.reads+' values');
 r=edit(()=>h.change(tr[2],'color',123));assert.equal(r.replaced[0].color,123);
 // Device On.
 const t3=JSON.parse(h.context.trackJSON[tr[3]].json),on=t3.devices[0].onId;assert.equal(t3.devices[0].on,.5);
 r=edit(()=>h.change(on,'value',0));assert.equal(r.replaced[0].devices[0].on,0);
 // A device added in Live.
 const added=90100,addedOn=90101;h.native[addedOn]={name:'On',value:1,min:0,max:1,is_quantized:1,is_enabled:1};h.native[added]={name:'Added Device',class_name:'Thing',parameters:['id',addedOn],can_have_chains:0};
 r=edit(()=>h.change(tr[4],'devices',[...h.native[tr[4]].devices,'id',added]));
 assert.deepEqual(r.replaced[0].devices.map(d=>d.name),['Device 🎹','Added Device']);
 for(let i=0;i<20;i++)h.tick();assert.ok([...h.observers].some(o=>o.id===addedOn&&o.watched==='value'),'the new device is observed too');
 r=edit(()=>h.change(addedOn,'value',0));assert.equal(r.replaced[0].devices[1].on,0);
 // A rename sent from a browser is observed as well, so the command re-reads nothing itself.
 settled();let reads=h.reads();
 h.context.command(JSON.stringify({id:2,client:'c',request:{op:'track_set',epoch:h.context.epoch,target:tr[5],property:'name',value:'From phone'}}));h.settle();
 let got=messages();assert.ok(JSON.parse(got.find(m=>m[0]==='result')[1]).ok);assert.equal(got.filter(m=>m[0]==='state').length,0);
 assert.deepEqual(got.filter(m=>m[0]==='patch').flatMap(m=>JSON.parse(m[1]).replace||[]).map(t=>t.name),['From phone']);
 // Clips are watched only where a browser is looking.
 const clipWatch=id=>{const slots=h.native[id].clip_slots.filter((_,i)=>i%2).slice(0,8);return [...h.observers].filter(o=>slots.includes(o.id)&&o.watched==='has_clip').length;};
 assert.equal(clipWatch(tr[1]),8,'with no view reported, the first tracks stand in');assert.equal(clipWatch(tr[20]),0,'off-screen clips are not watched');
 // An edit made while a track was off screen: nothing watched it, so scrolling it into view re-reads it.
 const offSlot=h.native[tr[21]].clip_slots[3],offClip=h.native[offSlot].clip[1];h.native[offClip].name='Edited off screen';
 const devName=id=>[...h.observers].some(o=>o.id===h.native[id].devices[1]&&o.watched==='name');
 assert.ok(devName(tr[1])&&!devName(tr[20]),'device names are watched only on screen');
 viewed=[tr[20],tr[21]];h.context.command(JSON.stringify({id:3,client:'c',request:{op:'view',epoch:h.context.epoch,tracks:viewed,offset:0}}));
 for(let i=0;i<20;i++)h.tick();assert.equal(clipWatch(tr[20]),8,'on-screen track clips watched');assert.equal(clipWatch(tr[1]),0,'scrolled-away track released');
 assert.ok(devName(tr[20])&&!devName(tr[1]),'device names follow the view');
 assert.equal(JSON.parse(h.context.trackJSON[tr[21]].json).clips[1].name,'Edited off screen','a track scrolled into view is re-read');
 r=edit(()=>h.change(h.native[tr[20]].devices[1],'name','Renamed device'));assert.equal(r.replaced[0].devices[0].name,'Renamed device');
 const slot=h.native[tr[20]].clip_slots[1],clip=h.native[slot].clip[1];
 r=edit(()=>h.change(clip,'name','Clip renamed'));assert.equal(r.replaced[0].clips[0].name,'Clip renamed');
 // A clip deleted in Live.
 r=edit(()=>{h.native[slot].clip=[];h.change(slot,'has_clip',0);});assert.equal(r.replaced[0].clips[0].clipId,0);
 // Song values that change with every edit go as a patch, not a snapshot.
 r=edit(()=>h.change(1,'can_undo',1));assert.equal(r.patches[0].song.canUndo,true);
 // Sends are watched only on screen; off screen the sweep keeps them.
 const sendOf=id=>JSON.parse(h.context.trackJSON[id].json).sends[0].id,sendWatched=id=>[...h.observers].some(o=>o.id===sendOf(id)&&o.watched==='value');
 assert.ok(sendWatched(tr[20])&&!sendWatched(tr[1]),'sends follow the view');
 // A stop waiting for the launch quantum (fired_slot_index -2) is kept and patched.
 settled();h.change(tr[20],'fired_slot_index',-2);h.settle();
 assert.deepEqual(messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]).tracks?.[0]?.firedSlotIndex),[-2]);
 assert.equal(JSON.parse(h.context.trackJSON[tr[20]].json).firedSlotIndex,-2);
 // A first-page scene renamed in Live: the song patch carries the scenes, no snapshot.
 const scene0=h.native[1].scenes[1];r=edit(()=>h.change(scene0,'name','Verse'));
 assert.equal(r.patches.find(p=>p.song)?.song.scenes[0].name,'Verse');
 // Scene launch state is observed on visible scene rows and patched beside the song.
 settled();h.change(scene0,'is_triggered',1);h.settle();
 assert.deepEqual(messages().filter(m=>m[0]==='patch').map(m=>JSON.parse(m[1]).sceneTriggered),[{[scene0]:true}]);
 // Device On is watched only on screen, like device names; off screen the sweep keeps it.
 const onOf=id=>JSON.parse(h.context.trackJSON[id].json).devices[0].onId,onWatched=id=>[...h.observers].some(o=>o.id===onOf(id)&&o.watched==='value');
 assert.ok(onWatched(tr[20])&&!onWatched(tr[1]),'Device On follows the view');
 // An open device: its parameters are observed while a browser shows it, and patched live.
 const dev=h.native[tr[1]].devices[1],dry=h.native[dev].parameters[3],paramWatched=()=>[...h.observers].some(o=>o.id===dry&&o.watched==='value');
 assert.ok(!paramWatched(),'device parameters are not watched unless shown');
 const view=(devices)=>h.context.command(JSON.stringify({id:++viewId,client:'c',request:{op:'view',epoch:h.context.epoch,tracks:viewed,offset:0,devices}}));
 view([dev]);for(let i=0;i<20;i++)h.tick();assert.ok(paramWatched(),'an open device is observed');messages();
 h.change(dry,'value',.25);h.settle();for(let i=0;i<2;i++)h.tick();
 const devicePatches=messages().filter(m=>m[0]==='patch').flatMap(m=>JSON.parse(m[1]).devices||[]);
 assert.deepEqual(devicePatches.map(d=>[d.id,d.params?.[0]?.id,d.params?.[0]?.value]),[[dev,dry,.25]]);
 h.change(dev,'parameters',[...h.native[dev].parameters]);h.settle();
 assert.ok(messages().some(m=>m[0]==='patch'&&JSON.parse(m[1]).devices?.some(d=>d.id===dev&&d.changed)),'a changed parameter list asks browsers to fetch the device');
 view([]);for(let i=0;i<20;i++)h.tick();assert.ok(!paramWatched(),'a closed device is released');
 // A track added in Live is noticed through the track list straight away.
 settled();const extra=h.native[1].tracks[1];h.native[1].tracks.push('id',extra);h.change(1,'tracks',h.native[1].tracks);h.settle();
 let ticks=0;while(!messages().some(m=>m[0]==='state'&&JSON.parse(m[1]).tracks.length===26)&&ticks++<20)h.tick();
 assert.ok(ticks<=3,'added track took '+ticks+' ticks');
 console.log('Passed: Live renames, colours, Device On, added devices, clip edits and new tracks are sent at once as one track.');
}
console.log('Large sets: framing, budgeted reads, two-pass first load, observers and patches passed.');
