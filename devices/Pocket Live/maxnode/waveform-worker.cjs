// Read PCM recordings incrementally, away from Max's scheduler and the relay loop.
const fs=require('node:fs/promises');
const {parentPort}=require('node:worker_threads');
async function analyse(file,bins=2048){
 const h=await fs.open(file,'r');
 try{
  const stat=await h.stat();if(!stat.isFile())throw Error('Not a regular file');
  async function read(at,n){const b=Buffer.alloc(n);const r=await h.read(b,0,n,at);if(r.bytesRead!==n)throw Error('Incomplete audio file');return b;}
  const header=await read(0,12),kind=header.toString('ascii',0,4),form=header.toString('ascii',8,12);
  const wav=kind==='RIFF'&&form==='WAVE',aiff=kind==='FORM'&&['AIFF','AIFC'].includes(form);
  if(!wav&&!aiff)throw Error('Unsupported audio format');
  let channels,rate,bits,format=1,little=wav,dataOffset,dataBytes,align;
  for(let at=12;at+8<=stat.size;){
   const chunk=await read(at,8),tag=chunk.toString('ascii',0,4),length=wav?chunk.readUInt32LE(4):chunk.readUInt32BE(4),next=at+8+length+(length&1);
   if(next>stat.size+1)throw Error('Incomplete audio file');
   if(wav&&tag==='fmt '){
    const b=await read(at+8,Math.min(length,64));if(b.length<16)throw Error('Invalid WAV format');
    format=b.readUInt16LE(0);channels=b.readUInt16LE(2);rate=b.readUInt32LE(4);align=b.readUInt16LE(12);bits=b.readUInt16LE(14);
    if(format===65534){if(b.length<40)throw Error('Invalid extensible WAV');format=b.readUInt16LE(24);}
   }else if(aiff&&tag==='COMM'){
    const b=await read(at+8,Math.min(length,64));if(b.length<18)throw Error('Invalid AIFF format');
    channels=b.readUInt16BE(0);bits=b.readUInt16BE(6);
    // AIFF stores sample rate as an IEEE 80-bit extended number.
    rate=b.readUInt32BE(10)*2**(b.readUInt16BE(8)-16383-31)+b.readUInt32BE(14)*2**(b.readUInt16BE(8)-16383-63);
    const codec=form==='AIFC'?b.toString('ascii',18,22):'NONE';
    if(['fl32','FL32','fl64','FL64'].includes(codec))format=3;
    else if(codec==='sowt')little=true;
    else if(!['NONE','twos'].includes(codec))throw Error('Unsupported AIFF codec');
   }else if(wav&&tag==='data'){dataOffset=at+8;dataBytes=length;}
   else if(aiff&&tag==='SSND'){if(length<8)throw Error('Invalid AIFF data');const b=await read(at+8,8),skip=b.readUInt32BE(0);dataOffset=at+16+skip;dataBytes=length-8-skip;}
   at=next;
  }
  const bytes=bits/8,frameBytes=channels*bytes;
  if(![1,3].includes(format)||!Number.isInteger(channels)||channels<1||channels>64||!Number.isFinite(rate)||rate<1000||rate>768000||!([8,16,24,32].includes(bits)&&format===1||[32,64].includes(bits)&&format===3)||align&&align!==frameBytes||!dataOffset||dataBytes<frameBytes)throw Error('Unsupported audio encoding');
  const frames=Math.floor(dataBytes/frameBytes),count=Math.min(bins,frames),low=new Float32Array(count),high=new Float32Array(count);
  low.fill(1);high.fill(-1);
  const blockFrames=Math.max(1,Math.floor(262144/frameBytes)),buffer=Buffer.alloc(blockFrames*frameBytes);
  for(let base=0;base<frames;base+=blockFrames){
   const n=Math.min(blockFrames,frames-base),r=await h.read(buffer,0,n*frameBytes,dataOffset+base*frameBytes);if(r.bytesRead!==n*frameBytes)throw Error('Incomplete audio file');
   for(let f=0;f<n;f++){
    const bin=Math.min(count-1,Math.floor((base+f)*count/frames));
    for(let c=0;c<channels;c++){
     const at=(f*channels+c)*bytes;let v;
     if(format===3)v=bits===32?(little?buffer.readFloatLE(at):buffer.readFloatBE(at)):(little?buffer.readDoubleLE(at):buffer.readDoubleBE(at));
     else if(bits===8)v=wav?(buffer[at]-128)/128:buffer.readInt8(at)/128;
     else v=(little?buffer.readIntLE(at,bytes):buffer.readIntBE(at,bytes))/2**(bits-1);
     if(!Number.isFinite(v))continue;v=Math.max(-1,Math.min(1,v));low[bin]=Math.min(low[bin],v);high[bin]=Math.max(high[bin],v);
    }
   }
  }
  const peaks=Buffer.alloc(count*2);for(let i=0;i<count;i++){peaks[i*2]=Math.round(Math.min(0,low[i])*127+128);peaks[i*2+1]=Math.round(Math.max(0,high[i])*127+128);}
  const after=await h.stat();if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs)throw Error('Audio file is still changing');
  return {duration:frames/rate,bins:count,peaks:peaks.toString('base64'),size:stat.size,mtime:stat.mtimeMs};
 }finally{await h.close();}
}
module.exports={analyse};
if(parentPort)parentPort.on('message',async job=>{try{parentPort.postMessage({id:job.id,value:await analyse(job.file)});}catch{parentPort.postMessage({id:job.id,error:true});}});
