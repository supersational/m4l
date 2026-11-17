const WebSocket=require('ws');
class CloudTransport{
 constructor({worker,command,refresh,changed,created}){Object.assign(this,{worker,command,refresh,changed,created});this.session=null;this.ws=null;this.timer=null;this.stopped=false;this.attempt=0;this.count=null;this.status='Starting cloud';this.online=false;this.generation=0;}
 update(status){this.status=status;this.changed();}
 async start(){
  if(this.stopped)return;
  const generation=++this.generation;
  clearTimeout(this.timer);this.timer=null;this.abort?.abort();
  const previous=this.ws;this.ws=null;previous?.close();this.online=false;this.count=null;
  try{
   if(!this.session||this.session.expires<Date.now()){
    this.update('Creating cloud link');const abort=this.abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),10000);
    const r=await fetch(this.worker+'/api/session',{method:'POST',signal:abort.signal}).finally(()=>clearTimeout(timeout));if(!r.ok)throw Error();
    const session=await r.json();if(this.stopped||generation!==this.generation)return;this.session=session;this.created(this.session);this.changed();
   }
   this.update('Connecting cloud');const socket=this.ws=new WebSocket(this.worker.replace(/^http/,'ws')+'/api/ws/'+this.session.room+'?role=host',{maxPayload:2097152});
   const current=()=>!this.stopped&&generation===this.generation&&this.ws===socket;
   socket.on('open',()=>{if(!current()){socket.close();return;}socket.send(JSON.stringify({token:this.session.hostToken}));this.update('Authenticating');});
   socket.on('message',raw=>{
    if(!current())return;
    let m;try{m=JSON.parse(raw);}catch{return;}if(!m||typeof m!=='object'||Array.isArray(m))return;
    if(m.type==='welcome'&&m.role==='host'){
     if(this.online)return;this.attempt=0;this.online=true;this.count=m.controllers;this.update('Cloud connected');this.refresh();
    }else if(this.online){
     if(m.type==='presence'){this.count=m.controllers;this.changed();}
     else if(m.type==='command')this.command(m);
     else if(m.type==='refresh')this.refresh();
    }
   });
   socket.on('error',()=>{});socket.on('close',()=>{
    if(!current())return;this.ws=null;this.online=false;this.count=null;this.update('Cloud reconnecting');
    this.timer=setTimeout(()=>this.start(),Math.min(30000,1000*2**this.attempt++));
   });
  }catch{if(this.stopped||generation!==this.generation)return;this.online=false;this.update('Cloud unavailable');this.timer=setTimeout(()=>this.start(),5000);}
 }
 publish(m){if(!this.online||this.ws?.readyState!==WebSocket.OPEN)return;if(m.type==='meters'&&!m.keep&&this.ws.bufferedAmount>262144)return;this.ws.send(JSON.stringify(m));}
 resume(){if(!this.stopped)return;this.stopped=false;this.start();}
 stop(){this.stopped=true;this.generation++;this.abort?.abort();clearTimeout(this.timer);this.timer=null;this.ws?.close();this.ws=null;this.online=false;this.count=null;}
}
module.exports={CloudTransport};
