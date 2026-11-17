// Actual bridge coordinator, with only Max, platform and transport boundaries
// replaced. The separate transport tests exercise the real transport classes.
const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const handlers={},outputs=[],children=[],saved=[],accepted=[],published={local:[],cloud:[]};let local,cloud,closed=false;
class Local {
 constructor(options){Object.assign(this,options);local=this;this.port=0;this.count=0;this.starts=[];}
 get url(){return this.port?'http://127.0.0.1:'+this.port+'/s/test#local-test-key':'';}
 info(){return {port:this.port,url:this.url,lan:true,status:'Local ready'};}
 async start(scope,port){this.starts.push([scope,port]);this.port=port||32123;this.changed();}
 async halt(){this.port=0;this.count=0;}
 publish(m){published.local.push(m);}
}
class Cloud {
 constructor(options){Object.assign(this,options);cloud=this;this.online=false;this.count=null;this.status='Starting cloud';}
 start(){this.session={url:'https://example.test/s/test#cloud-test-key',room:'test',expires:Date.now()+60000};this.online=true;this.count=0;this.status='Cloud connected';this.created(this.session);this.changed();}
 stop(){this.online=false;this.count=null;}
 resume(){this.start();}
 publish(m){published.cloud.push(m);}
}
class Waveforms {constructor(send){this.send=send;}accept(m){accepted.push(m);this.send({type:'state',state:m});}refresh(){}close(){closed=true;}}
const stubs={'max-api':{outlet:(...args)=>outputs.push(args),addHandler:(name,fn)=>handlers[name]=fn},'qrcode':{create:()=>({modules:{size:1,data:[1]}})},'node:fs':{existsSync:()=>true,writeFileSync:(...args)=>saved.push(args)},'node:path':require('node:path'),'./local-transport.cjs':{LocalTransport:Local},'./cloud-transport.cjs':{CloudTransport:Cloud},'./frames.cjs':require(ROOT+'/maxnode/frames.cjs'),'./waveforms.cjs':{Waveforms},'../config.json':{worker:'https://example.test'},'node:child_process':{spawn(executable){assert.equal(executable,'/usr/bin/pbcopy');const child=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=value=>child.input=value;children.push(child);return child;}}};
const signals={};const context={require:name=>{assert.ok(name in stubs,'unexpected dependency '+name);return stubs[name];},__dirname:ROOT+'/maxnode',process:{platform:'darwin',on:(event,fn)=>signals[event]=fn,exit(){}},setInterval:()=>({unref(){}}),clearInterval(){},console};
vm.runInNewContext(fs.readFileSync(ROOT+'/maxnode/bridge.js','utf8'),context);
const latest=selector=>outputs.filter(o=>o[0]===selector).at(-1),tick=()=>new Promise(setImmediate);
(async()=>{
 assert.equal(latest('status')[1],'Cloud connected');assert.equal(latest('controllerslabel')[1],'0 controllers connected');assert.equal(saved.length,1);assert.equal(saved[0][2].mode,0o600);
 cloud.count=2;cloud.changed();assert.equal(latest('controllerslabel')[1],'2 controllers connected');
 handlers.copy();assert.equal(children[0].input,cloud.session.url);assert.notEqual(latest('notice')[1],'Controller link copied');children[0].emit('close',0);assert.equal(latest('notice')[1],'Controller link copied');
 handlers.copy();children[1].emit('close',1);assert.match(latest('notice')[1],/Cmd-C/);assert.equal(latest('status')[1],'Cloud connected','clipboard failure must not change connection status');
 handlers.mode(1);await tick();assert.equal(cloud.online,false);assert.equal(latest('status')[1],'Local · same Wi-Fi');assert.equal(latest('controllerslabel')[1],'0 controllers connected');assert.deepEqual(local.starts[0],['lan',0]);
 local.count=3;local.changed();assert.equal(latest('controllerslabel')[1],'3 controllers connected');handlers.copy();assert.equal(children[2].input,local.url,'copy must use selected local link');children[2].emit('error',Error('clipboard denied'));assert.match(latest('notice')[1],/Cmd-C/);
 const before=local.starts.length;handlers.localport(80);await tick();assert.equal(local.starts.length,before);assert.match(latest('notice')[1],/Auto port/);handlers.localport(0);await tick();assert.equal(local.starts.at(-1)[1],0);
 handlers.state(JSON.stringify({epoch:'fixture'}));assert.equal(accepted[0].epoch,'fixture');assert.equal(published.local.at(-1).type,'state');assert.equal(published.cloud.at(-1).type,'state');
 local.command({id:'local-command'});cloud.command({id:'cloud-command'});assert.equal(outputs.filter(o=>o[0]==='command').length,2,'both transports share the native command route');
 handlers.mode(0);await tick();assert.equal(local.port,0);assert.equal(latest('status')[1],'Cloud connected');handlers.open();assert.equal(latest('browse')[1],cloud.session.url);
 cloud.online=false;cloud.count=null;cloud.status='Cloud reconnecting';cloud.changed();assert.equal(latest('controllerslabel')[1],'Connecting controllers…');assert.equal(latest('connection')[2],0);
 signals.SIGTERM();await tick();assert(closed);
 console.log('Bridge coordination passed: local/cloud switching, presence, private persistence, clipboard feedback, port validation and shared routing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
