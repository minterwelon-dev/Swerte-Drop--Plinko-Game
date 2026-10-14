/* global fetch, WebSocket, setTimeout, URL, Buffer, console */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const tabs = await (await fetch('http://127.0.0.1:9339/json')).json();
const tab = tabs.find(t => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map(), errors = [];
ws.addEventListener('close', () => { for (const p of pending.values()) p.reject(new Error('CDP socket closed')); pending.clear(); });
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); if(msg.error) p.reject(msg.error); else p.resolve(msg.result); }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(method + ' timeout')); } }, 15000).unref();
  });
}
async function run(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function size(width, height, deviceScaleFactor) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: width < height });
  await wait(850);
}
async function shot(name) {
  await wait(150);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(new URL(name + '.png', import.meta.url), Buffer.from(r.data, 'base64'));
}
async function click(control) {
  const { x, y } = await run(`({x:s.hud.${control}.root.x/devicePixelRatio,y:s.hud.${control}.root.y/devicePixelRatio})`);
  await send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 });
  await wait(65);
}
async function until(expression, timeout=4500) {
  for(let t=0;t<timeout;t+=40) { if(await run(expression)) return; await wait(40); }
  throw new Error('Timed out: '+expression);
}
async function force(bin) { await run(`s.rgs.forceNextPath(rows=>Array.from({length:rows},(_,i)=>i<${bin}?1:0)); true`); }
async function boot() {
  await send('Page.navigate',{url:'http://127.0.0.1:5173/?seed=42'}); await wait(1600);
  await run(`(async()=>{window.s=window.__game.scene.getScene('Game'); document.querySelector('.debug').style.display='none'; window.coords=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/responsive.ts')).name); window.landings=[];
    const original=s.ballEvents.onLand; s.ballEvents.onLand=b=>{landings.push({bin:b.res.bin,x:b.root.x,y:b.root.y,expectedX:coords.sx(s.board.geo.binX(b.res.bin)),expectedY:coords.sy(s.board.geo.binY),win:b.res.win}); original(b);}; return true;})()`);
}
await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); await send('Emulation.setEmulatedMedia',{features:[]}); await size(390,844,2); await boot();
const report={errors,wheel:[]};
await run('coords.setReducedMotion(false);window.maxConcurrent=0;s.events.on("postupdate",()=>{maxConcurrent=Math.max(maxConcurrent,s.pool.balls.filter(b=>b.active).length)});true');
for (const balls of [10,12,15,20,25,30]) {
  await run(`s.overlay.spin(${balls});s.overlay.skip();true`); await wait(30);
  const result=await run('({title:s.overlay.title.text,angle:s.overlay.wheel.rotation,end:s.overlay.spinEnd})');
  assert.equal(result.title,`${balls} BALLS!`); assert.ok(Math.abs(Math.atan2(Math.sin(result.angle-result.end),Math.cos(result.angle-result.end)))<1e-8);
  report.wheel.push(balls); await run('s.overlay.skip();s.overlay.hide();true');
}
await run(`(()=>{const stream=document.querySelector('canvas').captureStream(30);window.recording=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1500000});const chunks=[];window.recording.ondataavailable=e=>chunks.push(e.data);window.video=new Promise(resolve=>{recording.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const data=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));resolve(btoa(binary));};});recording.start();return true;})()`);
await force(2); await click('setup'); await click('feature'); await wait(250); await shot('intro');
await until('s.overlay.spinning'); await wait(350); await shot('wheel');
await until('s.overlay.mode==="result"'); await shot('wheel-result');
assert.equal(await run('s.overlay.title.text'),'30 BALLS!');
await until('s.sm.state==="FeatureDropping"');
await until('s.director.big.title.text==="MINI JACKPOT" && s.director.big.root.visible');
await shot('mini-jackpot');
await size(1280,720,1); await shot('feature-landscape'); await size(390,844,2);
await until('s.sm.state==="FeatureSummary"',18000); await wait(1000); await shot('summary');
report.mini=await run('({total:s.feat.res.totalWin,count:s.overlay.count.value,display:s.sm.displayBalance,server:s.sm.serverBalance,landed:s.feat.landed})');
assert.equal(report.mini.count,report.mini.total); assert.equal(report.mini.display,report.mini.server); assert.equal(report.mini.landed,30);
const length=await run('(async()=>{recording.stop();window.encodedVideo=await window.video;return encodedVideo.length;})()');
let video='';
for(let offset=0;offset<length;offset+=131072) video+=await run(`encodedVideo.slice(${offset},${offset+131072})`);
await fs.writeFile(new URL('feature-preview.webm',import.meta.url),Buffer.from(video,'base64'));
const collect=await run('({x:s.overlay.sign.x/devicePixelRatio,y:s.overlay.sign.y/devicePixelRatio})');
await send('Input.dispatchMouseEvent',{type:'mousePressed',...collect,button:'left',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',...collect,button:'left',clickCount:1});
await until('s.sm.state==="Idle"');
await force(0); await click('setup'); await click('feature'); await run('s.overlay.skip();true');
await until('s.overlay.spinning'); await run('s.overlay.skip();true'); await wait(50); await run('s.overlay.skip();true');
await until('s.sm.state==="FeatureDropping"'); await click('turbo');
await until('s.director.big.title.text==="MAJOR JACKPOT" && s.director.big.root.visible');
await until('s.director.big.title.text==="MAX WIN" && s.director.big.root.visible'); await shot('max-win');
await until('s.sm.state==="FeatureSummary"',12000);
report.cap=await run('({total:s.feat.res.totalWin,bet:s.feat.res.bet,display:s.sm.displayBalance,server:s.sm.serverBalance,capped:s.feat.res.capped,title:s.overlay.title.text})');
assert.equal(report.cap.total,report.cap.bet*5000); assert.equal(report.cap.capped,true); assert.equal(report.cap.display,report.cap.server); assert.equal(report.cap.title,'MAX WIN');
await click('skip'); await until('s.sm.state==="Idle"'); await click('turbo');
await force(1); await click('setup'); await click('feature'); await run('s.overlay.skip();true');
await until('s.overlay.spinning'); await run('s.overlay.skip();true'); await wait(50); await run('s.overlay.skip();true');
await until('s.sm.state==="FeatureDropping"'); await until('s.director.big.title.text==="MINOR JACKPOT" && s.director.big.root.visible');
await send('Emulation.setCPUThrottlingRate',{rate:4});
report.performance=await run(`new Promise(resolve=>{let frames=0,worst=0,start=performance.now(),last=start;function frame(now){frames++;worst=Math.max(worst,now-last);last=now;if(now-start<900)requestAnimationFrame(frame);else resolve({fps:frames*1000/(now-start),worst,inFlight:s.feat?.flying});}requestAnimationFrame(frame);})`);
await send('Emulation.setCPUThrottlingRate',{rate:1});
await click('skip'); await until('s.sm.state==="FeatureSummary"'); await click('skip'); await until('s.sm.state==="Idle"');
await force(2); await run('(async()=>{await s.rgs.feature({sessionId:s.sessionId,bet:s.bet,seedRef:s.seed});return true})()');
report.maxConcurrent=await run('maxConcurrent'); assert.equal(report.maxConcurrent,5);
await boot(); assert.equal(await run('s.sm.state'),'FeatureSummary');
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance&&s.feat.landed===30'),true);
await shot('restored-summary'); await click('skip'); await until('s.sm.state==="Idle"');
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await force(2); await click('setup'); await click('feature'); await run('s.overlay.skip();true');
await until('s.sm.state==="FeatureDropping"'); await until('s.feat.landed>0');
assert.equal(await run('s.director.big.paperRoot.visible'),false);
await click('skip'); await until('s.sm.state==="FeatureSummary"');
assert.equal(await run('s.overlay.count.value===s.feat.res.totalWin'),true);
await size(360,640,2); await shot('small-reduced-summary');
await click('skip'); await until('s.sm.state==="Idle"');
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance'),true);
report.reduced=true;report.restored=true;
assert.deepEqual(errors,[]);
await fs.writeFile(new URL('results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));ws.close();
