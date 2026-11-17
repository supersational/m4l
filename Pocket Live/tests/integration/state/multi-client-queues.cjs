/* Deterministic queue integration with a separate simulated authoritative host.
 * This exercises production ParameterSync, not Ableton or a real browser. */
const assert=require('node:assert/strict');
const {ROOT}=require('../../harness/paths.cjs');
const fs=require('node:fs'),vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(ROOT+'/web/parameter-sync.js','utf8')+'\nglobalThis.Sync=ParameterSync;',context);
const ParameterSync=context.Sync;
const tick=()=>new Promise(setImmediate);
function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
async function scenario(seed){
 const rand=random(seed),trace=[],violations=[],host=new Map([[1,0],[2,0],[3,0]]),incoming=[],acks=[];let now=0;
 const clients=Array.from({length:3},(_,client)=>{
  const model=new Map(host),latest=new Map(),inFlight=new Set();
  const sync=new ParameterSync({
   now:()=>now,
   send:(id,value)=>new Promise(resolve=>{assert.ok(!inFlight.has(id),'only one request per client/parameter may be in flight');inFlight.add(id);trace.push(['send',client,id,value]);incoming.push({client,id,value,resolve:result=>{inFlight.delete(id);resolve(result);}});}),
   commit:(id,result)=>{if(result.value!==latest.get(id))violations.push({client,id,committed:result.value,latest:latest.get(id)});model.set(id,result.value);},state(){},error:e=>{throw e;}
  });
  return {sync,model,latest};
 });
 const snapshot=()=>{
  for(const client of clients){
   const device={parameters:[...host].map(([id,value])=>({id,value,display:String(value)}))};
   const pending=new Map(device.parameters.filter(p=>client.sync.status(p.id)==='pending').map(p=>[p.id,client.sync.intent(p.id)]));
   client.sync.reconcile(device);
   for(const p of device.parameters)if(pending.has(p.id))assert.equal(p.value,pending.get(p.id),'snapshot cannot overwrite pending intent');
   for(const p of device.parameters)client.model.set(p.id,p.value);
  }
 };
 function accept(){
  if(!incoming.length)return;
  // Requests from different clients may reach the host in any order. Native
  // acceptance order, rather than client clocks, determines the shared winner.
  const request=incoming.splice(Math.floor(rand()*incoming.length),1)[0];
  host.set(request.id,request.value);trace.push(['accept',request.client,request.id,request.value]);
  acks.push({...request,result:{value:request.value,display:String(request.value)}});
 }
 async function acknowledge(){
  if(!acks.length)return;
  const ack=acks.splice(Math.floor(rand()*acks.length),1)[0];
  trace.push(['ack',ack.client,ack.id,ack.value]);ack.resolve(ack.result);await tick();
  assert.deepEqual(violations,[],'stale ACK must not commit over a newer local edit');
 }
 try{
  for(let i=0;i<120;i++){
   const client=Math.floor(rand()*clients.length),id=1+Math.floor(rand()*3),value=Math.round(rand()*20)/20;
   const entry=clients[client];entry.latest.set(id,value);entry.model.set(id,value);entry.sync.preview(id,value);entry.sync.write(id,value);
   trace.push(['edit',client,id,value]);
   if(rand()<.65)accept();if(rand()<.5)await acknowledge();
   if(rand()<.5)snapshot();now+=Math.floor(rand()*15);
  }
  // Finite queued work must drain without needing another user event.
  let iterations=0;
  while(incoming.length||acks.length){assert.ok(++iterations<500,'queues did not settle');accept();await acknowledge();}
  for(const client of clients)for(const id of host.keys())assert.equal(client.sync.status(id),'idle');
  // Late ACK display protection is intentionally temporary; a fresh host
  // snapshot after its window must replace every optimistic client value.
  now+=401;snapshot();
  for(const client of clients)assert.deepEqual([...client.model],[...host],'stable client must equal authoritative simulated host');
 }catch(error){error.message+=`\nseed=${seed}\ntrace=${JSON.stringify(trace)}`;throw error;}
}
(async()=>{for(let seed=1;seed<=40;seed++)await scenario(seed);console.log('Passed: 40 seeded three-client queue schedules, delayed/reordered ACKs, interleaved snapshots and stable simulated-host convergence.');})().catch(error=>{console.error(error);process.exitCode=1;});
