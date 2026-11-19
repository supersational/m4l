const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(ROOT+'/web/parameter-sync.js','utf8')+'\nglobalThis.Sync=ParameterSync;',context);const ParameterSync=context.Sync;
const tick=()=>new Promise(setImmediate);
(async()=>{
 const requests=[],commits=[],states=[],errors=[];let now=1000;
 const sync=new ParameterSync({send:(id,value)=>new Promise((resolve,reject)=>requests.push({id,value,resolve,reject})),commit:(id,result)=>commits.push({id,...result}),state:(id,state)=>states.push({id,state}),error:e=>errors.push(e.message),now:()=>now});
 sync.preview(1,.2);sync.write(1,.2);sync.write(1,.2);assert.equal(requests.length,1,'same in-flight intent should not duplicate');
 sync.preview(1,.2);sync.write(1,.2);assert.equal(requests.length,1,'repeated identical preview does not supersede a valid in-flight request');
 sync.preview(1,.4);sync.write(1,.4);sync.preview(1,.8);sync.write(1,.8);assert.equal(requests.length,1,'one write in flight per parameter');
 requests[0].resolve({value:.2,display:'old'});await tick();assert.equal(commits.length,0,'stale ack must not overwrite newer gesture');assert.equal(requests[1].value,.8,'coalesce to latest value');
 const d={parameters:[{id:1,value:0,display:'0 dB'}]};sync.reconcile(d);assert.equal(d.parameters[0].value,.8);
 requests[1].resolve({value:.8,display:'−2.00 dB'});await tick();assert.equal(commits[0].display,'−2.00 dB');assert.equal(sync.status(1),'idle');
 const stale={parameters:[{id:1,value:0,display:'old snapshot'}]};sync.reconcile(stale);assert.equal(stale.parameters[0].display,'−2.00 dB');
 now+=500;const external={parameters:[{id:1,value:.3,display:'external automation'}]};sync.reconcile(external);assert.equal(external.parameters[0].value,.3);
 sync.write(2,.5);sync.write(3,.7);assert.equal(requests.length,4,'independent parameters can proceed concurrently');requests[2].reject(Error('Offline'));requests[3].resolve({value:.7,display:'70 %'});await tick();assert.equal(sync.status(2),'error');assert.equal(sync.status(3),'idle');assert.deepEqual(errors,['Offline']);
 sync.write(2,.6);requests[4].resolve({value:.6,display:'60 %'});await tick();assert.equal(sync.status(2),'idle');
 const staleRequests=[],staleCommits=[],staleErrors=[];
 const resettable=new ParameterSync({send:(id,value)=>new Promise((resolve,reject)=>staleRequests.push({id,value,resolve,reject})),commit:(...args)=>staleCommits.push(args),state(){},error:e=>staleErrors.push(e)});
 resettable.write(10,.2);resettable.write(10,.8);resettable.reset();staleRequests[0].resolve({value:.2});await tick();
 assert.equal(staleRequests.length,1,'reset cancels queued trailing writes');assert.equal(staleCommits.length,0,'reset ignores old success');
 resettable.write(10,.3);resettable.reset();resettable.write(10,.7);staleRequests[1].reject(Error('old connection'));await tick();assert.equal(staleErrors.length,0,'reset ignores old errors');
 staleRequests[2].resolve({value:.7});await tick();assert.equal(staleCommits.length,1);assert.equal(staleCommits[0][1].value,.7,'new generation still commits');
 // Deleting one device must not cancel another device's in-flight gesture.
 const targetedRequests=[],targetedCommits=[],targetedStates=[],targetedErrors=[];
 const targeted=new ParameterSync({send:(id,value)=>new Promise((resolve,reject)=>targetedRequests.push({id,value,resolve,reject})),commit:(id,result)=>targetedCommits.push([id,result.value]),state:(id,status)=>targetedStates.push([id,status]),error:e=>targetedErrors.push(e.message)});
 targeted.write(50,.1);targeted.write(50,.9);
 targeted.write(51,.2);targeted.write(51,.8);
 targeted.write(52,.3);targeted.write(52,.7);
 assert.equal(targeted.cancel('50'),true,'cancel accepts parameter IDs from DOM attributes');
 assert.equal(targeted.cancel(50),false,'cancel is idempotent');targeted.cancel(52);
 assert.equal(targeted.status(50),'idle');assert.equal(targeted.intent(50),null);
 assert.equal(targeted.status(51),'pending','unrelated pending state survives targeted cancellation');
 const afterDeletion={parameters:[{id:50,value:.4,display:'native'}]};targeted.reconcile(afterDeletion);
 assert.equal(afterDeletion.parameters[0].value,.4,'cancel drops pending and confirmed snapshot protection');
 // Reuse the numeric ID before the old asynchronous response finishes.
 targeted.write(50,.6);targetedRequests[0].resolve({value:.1});targetedRequests[2].reject(Error('deleted parameter'));await tick();
 assert.equal(targetedRequests.length,4,'deleted parameters cannot drain their queued writes');
 assert.deepEqual(targetedCommits,[],'cancelled success cannot commit over a replacement entry');assert.deepEqual(targetedErrors,[],'cancelled rejection stays silent');
 targetedRequests[1].resolve({value:.2});await tick();
 assert.equal(targetedRequests[4].id,51);assert.equal(targetedRequests[4].value,.8,'unrelated queued latest intent still drains');
 targetedRequests[3].resolve({value:.6});targetedRequests[4].resolve({value:.8});await tick();
 assert.deepEqual(targetedCommits,[[50,.6],[51,.8]]);assert.equal(targeted.status(51),'idle');
 targeted.cancel(51);assert.equal(targeted.intent(51),null,'cancel removes settled readback protection as well');
 assert.ok(targetedStates.some(([id,status])=>id===52&&status==='idle'),'cancel clears per-control busy state');
 // Repeated events at a clamped endpoint must not send the same native write
 // again after its ACK. The initial request-count assertion alone misses this.
 const duplicates=[],duplicateCommits=[];
 const endpoint=new ParameterSync({send:(id,value)=>new Promise(resolve=>duplicates.push({id,value,resolve})),commit:(id,result)=>duplicateCommits.push(result.value),state(){},error:e=>{throw e;}});
 endpoint.write(40,1);for(let i=0;i<50;i++){endpoint.preview(40,1);endpoint.write(40,1);}
 duplicates[0].resolve({value:1,display:'100 %'});await tick();
 assert.equal(duplicates.length,1,'repeated identical previews must not queue a duplicate after ACK');
 assert.deepEqual(duplicateCommits,[1],'the original ACK still settles the unchanged intent');
 // A control can preview before the throttled writer gets its next turn.
 const delayed=[],delayedCommits=[],delayedErrors=[];
 const queued=new ParameterSync({send:(id,value)=>new Promise((resolve,reject)=>delayed.push({id,value,resolve,reject})),commit:(id,result)=>delayedCommits.push(result),state(){},error:e=>delayedErrors.push(e.message),now:()=>now});
 queued.write(20,.1);queued.preview(20,.9);
 delayed[0].resolve({value:.1,display:'10 %'});await tick();
 assert.equal(delayed.length,1,'a preview alone must never send a command');
 assert.equal(queued.intent(20),.9,'an old ACK cannot consume a preview waiting for its writer');
 assert.equal(delayedCommits.length,0);
 queued.write(20,.9);delayed[1].resolve({value:.875,display:'87.5 %'});await tick();
 assert.equal(delayedCommits[0].value,.875,'commit uses native readback, including clamping or quantization');
 const readback={parameters:[{id:20,value:.1,display:'stale'}]};queued.reconcile(readback);
 assert.equal(readback.parameters[0].value,.875,'temporary protection uses readback rather than requested value');
 queued.write(20,.2);queued.write(20,.8);delayed[2].reject(Error('superseded request failed'));await tick();
 assert.deepEqual(delayedErrors,[],'a superseded failure must not show an error for newer intent');
 assert.equal(delayed[3].value,.8,'a failed earlier request must still drain latest queued intent');
 delayed[3].resolve({value:.8,display:'80 %'});await tick();
 assert.equal(queued.status(20),'idle');
 // Other controllers can write between our request, ACK and the end of the
 // stale-snapshot guard. With no later patch, a masked update must request a
 // fresh read or the optimistic value would remain on this browser forever.
 let clock=5000;
 const conflicts=[];
 const receivers=[];
 const converging=new ParameterSync({
  now:()=>clock,
  send:()=>new Promise(resolve=>receivers.push(resolve)),
  commit(){},state(){},error:e=>{throw e;},
  recheck:(id,after)=>conflicts.push([id,after])
 });
 const incoming=(id,value)=>converging.reconcile({parameters:[{id,value,display:String(value)}]}).parameters[0].value;
 converging.write(60,.25);
 assert.equal(incoming(60,.5),.25,'a remote patch cannot replace pending input');
 assert.deepEqual(conflicts,[],'wait for ACK before checking a pending conflict');
 receivers[0]({value:.25,display:'25 %'});await tick();
 assert.deepEqual(conflicts,[[60,5400]],'a divergent patch arriving before ACK schedules readback');
 converging.write(61,.3);receivers[1]({value:.3,display:'30 %'});await tick();
 assert.equal(incoming(61,.3),.3);
 assert.equal(conflicts.length,1,'matching updates must not trigger a fresh read');
 clock=5020;
 assert.equal(incoming(61,.75),.3,'protect the control until the confirmed guard ends');
 assert.deepEqual(conflicts,[[60,5400],[61,5400]],'a competing write after ACK also schedules readback');
 clock=5400;
 assert.equal(incoming(60,.5),.5,'the scheduled refresh now accepts authoritative state');
 assert.equal(incoming(61,.75),.75);
 assert.equal(conflicts.length,2,'an authoritative refresh after the guard must not loop');
 // An immediately throwing transport must release the queue just like a rejected promise.
 let attempts=0;const immediateErrors=[],immediateCommits=[];
 const immediate=new ParameterSync({send:()=>{if(++attempts===1)throw Error('not connected');return {value:.6};},commit:(id,result)=>immediateCommits.push(result.value),state(){},error:e=>immediateErrors.push(e.message)});
 immediate.write(30,.4);assert.equal(immediate.status(30),'error');immediate.write(30,.6);await tick();
 assert.deepEqual(immediateErrors,['not connected']);assert.deepEqual(immediateCommits,[.6]);
 console.log('Passed: coalescing, latest-intent wins, duplicate suppression, stale snapshots, automation, independent writes, errors and recovery.');
})().catch(e=>{console.error(e);process.exitCode=1;});
