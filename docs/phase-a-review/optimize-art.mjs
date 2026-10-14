/* global fetch, WebSocket, setTimeout, Buffer, console */
import fs from 'node:fs/promises';
const tabs=await (await fetch('http://127.0.0.1:9339/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;
const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m.result);pending.delete(m.id);}});
function send(method,params={}){return new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});}
await send('Page.navigate',{url:'http://127.0.0.1:5173/'});
await new Promise(r=>setTimeout(r,1000));
for(const [name,width] of [['board',1024],['wood',768],['canopy',1536]]) {
  const result=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{const i=new Image();i.src='/Assets/art/source/${name}-v1.png';await i.decode();const c=document.createElement('canvas');c.width=${width};c.height=Math.round(i.height*${width}/i.width);c.getContext('2d').drawImage(i,0,0,c.width,c.height);return c.toDataURL('image/webp',0.78);})()`});
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const bytes=Buffer.from(result.result.value.split(',')[1],'base64');
  await fs.writeFile(`Assets/art/${name}-v1.webp`,bytes);console.log(name,bytes.length);
}
ws.close();
