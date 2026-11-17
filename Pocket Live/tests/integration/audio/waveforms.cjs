const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {analyse}=require(ROOT+'/maxnode/waveform-worker.cjs'),{Waveforms}=require(ROOT+'/maxnode/waveforms.cjs');
function wav(samples,{bits=16,channels=1,float=false}={}){const bytes=bits/8,b=Buffer.alloc(44+samples.length*bytes);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(float?3:1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*channels*bytes,28);b.writeUInt16LE(channels*bytes,32);b.writeUInt16LE(bits,34);b.write('data',36);b.writeUInt32LE(samples.length*bytes,40);samples.forEach((v,i)=>{if(float)b.writeFloatLE(v,44+i*bytes);else b.writeIntLE(Math.round(v*(2**(bits-1)-1)),44+i*bytes,bytes);});return b;}
function aiff(){const b=Buffer.alloc(58);b.write('FORM');b.writeUInt32BE(50,4);b.write('AIFFCOMM',8);b.writeUInt32BE(18,16);b.writeUInt16BE(1,20);b.writeUInt32BE(2,22);b.writeUInt16BE(16,26);b.writeUInt16BE(16398,28);b.writeUInt32BE(0xbb800000,30);b.write('SSND',38);b.writeUInt32BE(12,42);b.writeInt16BE(-32768,54);b.writeInt16BE(32767,56);return b;}
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-peaks-test-'));let service;
 try{
  const file=path.join(dir,'recording.wav');await fs.writeFile(file,wav([-1,.5,.25,-.25]));const result=await analyse(file,2);assert.equal(result.duration,4/48000);assert.deepEqual([...Buffer.from(result.peaks,'base64')],[1,192,96,160]);
  const stereo=path.join(dir,'stereo.wav');await fs.writeFile(stereo,wav([-.25,.75,-.5,.25],{bits:24,channels:2}));assert.deepEqual([...Buffer.from((await analyse(stereo,2)).peaks,'base64')],[96,223,65,160]);
  const float=path.join(dir,'float.wav');await fs.writeFile(float,wav([NaN,-2,2,0],{bits:32,float:true}));assert.deepEqual([...Buffer.from((await analyse(float,2)).peaks,'base64')],[1,128,128,255]);
  const ai=path.join(dir,'recording.aiff');await fs.writeFile(ai,aiff());assert.equal((await analyse(ai)).duration,2/48000);
  const large=path.join(dir,'large.wav'),samples=Array(200000).fill(.2);samples[131072]=-1;await fs.writeFile(large,wav(samples));const big=await analyse(large,4);assert.equal(Buffer.from(big.peaks,'base64')[4],1,'do not miss transients across read blocks');
  const truncated=path.join(dir,'broken.wav');await fs.writeFile(truncated,wav([.2]).subarray(0,45));await assert.rejects(analyse(truncated));
  const packets=[];service=new Waveforms(m=>packets.push(m));const clip={id:1,start:0,end:4,audioFile:file,audio:{warped:false,start:0}};
  const model={epoch:'test',tracks:[{arrangement:[clip,{...clip,id:2}]}]};service.accept(model);
  const until=Date.now()+3000;while(!packets.some(m=>m.type==='waveform')&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  assert.equal(packets.filter(m=>m.type==='waveform').length,1,'shared files analysed/sent once');assert.ok(packets.findIndex(m=>m.type==='waveform')>packets.findIndex(m=>m.state?.tracks[0].arrangement[0].waveformKey),'state precedes first peaks');assert.ok(!JSON.stringify(packets).includes(file),'local paths never sent');
  async function idle(){const deadline=Date.now()+3000;while(service.jobs.size||service.busy||service.queue.length){if(Date.now()>deadline)throw Error('Waveform scan did not settle');await new Promise(r=>setTimeout(r,5));}}
  const key=packets.find(m=>m.type==='waveform').key;service.accept(model);await idle();assert.equal(packets.filter(m=>m.type==='waveform').length,1,'cached files not resent each snapshot');
  service.refresh();assert.equal(packets.filter(m=>m.type==='waveform').length,2,'new controller gets cached peaks');await idle();
  await fs.writeFile(file,wav(Array(100).fill(-.5)));service.accept(model);const deadline=Date.now()+3000;while(!packets.some(m=>m.type==='waveform'&&m.key!==key)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(packets.some(m=>m.type==='waveform'&&m.key!==key),'changed file invalidates cache');
  service.accept({epoch:'next',tracks:[{arrangement:[{...clip,recording:true}]}]});assert.ok(!packets.at(-1).state.tracks[0].arrangement[0].waveformKey,'recording file never shown as finished');
  const context={Uint8Array,atob,Map};vm.createContext(context);vm.runInContext(await fs.readFile(path.join(ROOT,'web/waveform.js'),'utf8'),context);const {sourceTime}=context.ClipWaveform;
  const audio={start:4,warped:true,markers:[{beat_time:4,sample_time:0},{beat_time:8,sample_time:2}],looping:false};assert.equal(sourceTime(audio,2,120),1);assert.equal(sourceTime({...audio,looping:true,loopStart:4,loopEnd:8},5,120),.5);assert.equal(sourceTime({warped:false,start:1},2,120),2);assert.equal(sourceTime({warped:true,start:0},2,120),null,'never invent alignment when markers missing');
  const native={Task:function(){},Dict:function(){this.stringify=()=>JSON.stringify({warp_markers:[{beat_time:4,sample_time:0},{beat_time:8,sample_time:2}]});}};vm.createContext(native);vm.runInContext(await fs.readFile(path.join(ROOT,'live.js'),'utf8'),native);
  vm.runInContext(`var info=audioInfo({id:1,get:function(p){return {is_audio_clip:[1],is_recording:[0],warp_markers:['dictionary','test'],file_path:['/local/recording.wav'],warping:[1],start_marker:[4],looping:[0],loop_start:[4],loop_end:[8],pitch_coarse:[0],pitch_fine:[0]}[p];}});`,native);
  assert.equal(native.info.audioFile,'/local/recording.wav');assert.equal(native.info.audio.markers.length,2);assert.equal(native.info.audio.start,4);
  console.log('Passed: PCM16/24 stereo, float/clipping/NaN, AIFF, cross-block transients, incomplete files, worker cache/invalidation, reconnect delivery/order, no paths uploaded, recording exclusion, trim/warp/loop mapping.');
 }finally{await service?.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
