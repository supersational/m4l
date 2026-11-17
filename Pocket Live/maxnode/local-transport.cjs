// Private local HTTP/WebSocket transport, owned by the device's Node process.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
function addresses(){return Object.entries(os.networkInterfaces()).flatMap(([name,list])=>(list||[]).filter(a=>(a.family==='IPv4'||a.family===4)&&!a.internal&&!a.address.startsWith('169.254.')&&!/^(utun|tun|tap|docker|veth|bridge)/.test(name)).map(a=>({name,address:a.address}))).sort((a,b)=>(/^(en|eth|wlan)/.test(b.name)?1:0)-(/^(en|eth|wlan)/.test(a.name)?1:0));}
class LocalTransport{
 constructor({webRoot,command,refresh,changed}){Object.assign(this,{webRoot,command,refresh,changed});this.room=crypto.randomUUID();this.token=crypto.randomBytes(32).toString('hex');this.clients=new Map();this.peaks=new Map();this.state=null;this.stateAt=0;this.server=null;this.wss=null;this.scope='lan';this.port=0;this.preferredPort=0;this.starting=null;this.message='Offline';this.generation=0;}
 get online(){return !!this.state&&Date.now()-this.stateAt<6000;}
 get url(){if(!this.port)return '';const host=this.scope==='lan'?(addresses()[0]?.address||'127.0.0.1'):'127.0.0.1';return `http://${host}:${this.port}/s/${this.room}#${this.token}`;}
 get count(){return [...this.clients.values()].filter(c=>c.authenticated).length;}
 info(){return {url:this.url,port:this.port,scope:this.scope,lan:this.scope==='lan'&&!!addresses().length,count:this.count,status:this.message};}
 start(scope='lan',preferredPort=0){
  const generation=++this.generation;const operation=(this.chain||Promise.resolve()).then(()=>generation!==this.generation?this.info():this.server&&this.scope===scope&&this.preferredPort===preferredPort?this.info():this.listen(scope,preferredPort,generation));this.chain=operation.catch(()=>{});return operation;
 }
 async listen(scope,preferredPort,generation){
  await this.stop();if(generation!==this.generation)return this.info();this.scope=scope;this.preferredPort=preferredPort;this.message='Starting local server';this.changed();
  // Snapshots of a big Set are hundreds of KB of repetitive JSON; deflate shrinks them several-fold.
  // Meter, patch and ACK frames stay under the threshold and skip zlib entirely; ws applies the
  // threshold only without server context takeover, which also keeps no deflate window per socket.
  // maxPayload still limits the inflated size of anything a browser sends.
  this.wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,zlibDeflateOptions:{level:4,memLevel:8},concurrencyLimit:4}});
  this.server=http.createServer((req,res)=>this.serve(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end('Unable to load controller');}));
  this.server.on('upgrade',(req,socket,head)=>{
   let url;try{url=new URL(req.url,'http://localhost');}catch{socket.destroy();return;}
   if(!this.allowedHost(req.headers.host)||req.headers.origin!==`http://${req.headers.host}`||url.pathname!==`/api/ws/${this.room}`||url.searchParams.get('role')!=='control'||this.clients.size>=16){socket.destroy();return;}
   this.wss.handleUpgrade(req,socket,head,ws=>this.attach(ws));
  });
  const host=scope==='mac'?'127.0.0.1':'0.0.0.0';
  const bind=port=>new Promise((resolve,reject)=>{const failed=e=>{this.server.off('listening',ready);reject(e);},ready=()=>{this.server.off('error',failed);resolve();};this.server.once('error',failed);this.server.once('listening',ready);this.server.listen(port,host);});
  try{try{await bind(preferredPort);}catch(e){if(e.code!=='EADDRINUSE'||!preferredPort)throw e;await bind(0);}
   if(generation!==this.generation){await this.stop();return this.info();}this.port=this.server.address().port;this.message='Local ready';this.server.on('error',()=>{this.message='Local server error';this.changed();});this.changed();this.refresh();return this.info();
  }catch(e){await this.stop();this.message=e.code==='EACCES'?'Local port unavailable':'Could not start local server';this.changed();throw e;}
 }
 allowedHost(value){const hosts=new Set(['127.0.0.1','localhost',...addresses().map(a=>a.address)]);return [...hosts].some(host=>value===`${host}:${this.port}`);}
 async serve(req,res){
  if(!this.allowedHost(req.headers.host)){res.writeHead(403);res.end('Invalid host');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://localhost');
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data:; frame-ancestors 'none'"};
  let name;if(url.pathname==='/'||url.pathname===`/s/${this.room}`)name='index.html';else if(/^\/[a-z0-9-]+\.(js|css|ico)$/.test(url.pathname))name=url.pathname.slice(1);else{res.writeHead(404,headers);res.end('Not found');return;}
  try{const bytes=await fs.readFile(path.join(this.webRoot,name));res.writeHead(200,{...headers,'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'image/x-icon'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(404,headers);res.end('Controller build not found. Build the bundled web assets.');}
 }
 attach(ws){
  const client={id:'local-'+crypto.randomUUID(),authenticated:false,count:0,window:Date.now()};this.clients.set(ws,client);
  const timeout=setTimeout(()=>ws.close(1008,'Connection key required'),10000);timeout.unref();
  ws.on('error',()=>{});ws.on('close',()=>{clearTimeout(timeout);this.clients.delete(ws);this.changed();});
  ws.on('message',(raw,binary)=>{
   if(this.clients.get(ws)!==client||ws.readyState!==WebSocket.OPEN)return;
   if(binary){ws.close(1003,'JSON text required');return;}
   let m;try{m=JSON.parse(String(raw));}catch{ws.close(1003,'JSON required');return;}
   if(!m||typeof m!=='object'||Array.isArray(m)){ws.close(1003,'JSON object required');return;}
   if(!client.authenticated){
    const received=Buffer.from(String(m.token||'')),expected=Buffer.from(this.token);if(received.length!==expected.length||!crypto.timingSafeEqual(received,expected)){ws.close(1008,'Invalid connection key');return;}
    clearTimeout(timeout);client.authenticated=true;this.write(ws,{type:'welcome',role:'control',transport:'local',online:this.online});if(this.online){this.write(ws,{type:'state',state:this.state});for(const peak of this.peaks.values())if(peak.epoch===this.state.epoch)this.write(ws,peak);}this.changed();this.refresh();return;
   }
   if(m.type!=='command'||typeof m.op!=='string'||m.op.length>64)return;
   if(Date.now()-client.window>=1000){client.window=Date.now();client.count=0;}if(++client.count>30){this.write(ws,{type:'result',id:m.id,ok:false,error:'Slow down'});return;}
   this.command({type:'command',id:m.id,client:client.id,request:m});
  });
 }
 write(ws,m){
  if(ws.readyState!==WebSocket.OPEN)return;
  // Disconnect a stalled reader rather than silently losing snapshots or ACKs.
  // Rejoining gets a current snapshot and cannot replay abandoned writes.
  if(ws.bufferedAmount>=2*1024*1024){ws.terminate();return;}
  try{ws.send(JSON.stringify(m));}catch{ws.terminate();}
 }
 publish(m){
  if(m.type==='state'){if(this.state?.epoch!==m.state.epoch)this.peaks.clear();this.state=m.state;this.stateAt=Date.now();}
  if(m.type==='meters')this.stateAt=Date.now(); // Snapshots are now sent on change; meters prove Live is alive.
  if(m.type==='waveform'){this.peaks.set(m.key,m);while(this.peaks.size>128)this.peaks.delete(this.peaks.keys().next().value);}
  for(const [ws,c]of this.clients)if(c.authenticated&&(m.type!=='result'||m.client===c.id))this.write(ws,m);
 }
 halt(){this.generation++;const operation=(this.chain||Promise.resolve()).then(()=>this.stop());this.chain=operation.catch(()=>{});return operation;}
 async stop(){this.port=0;for(const ws of this.clients.keys())ws.terminate();this.clients.clear();this.wss?.close();this.wss=null;const server=this.server;this.server=null;if(server)await new Promise(resolve=>{server.close(()=>resolve());server.closeAllConnections?.();});}
}
module.exports={LocalTransport};
