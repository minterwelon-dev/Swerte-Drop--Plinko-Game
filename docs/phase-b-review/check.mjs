/* global fetch, WebSocket, setTimeout, URL, Buffer, console */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const tabs = await (await fetch('http://127.0.0.1:9339/json')).json();
const tab = tabs.find(t => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map(), errors = [];
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
await send('Runtime.enable'); await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.removeItem("swerte-reduced-motion")}catch{}'}); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]}); await size(390,844,2); await boot();
const report={errors};
assert.equal(await run('s.hud.buttons.every(b=>b.plate.width===b.texture.width && b.plate.displayOriginX===b.texture.width/2 && b.plate.displayOriginY===b.texture.height/2)'),true);
assert.equal(await run('s.hud.buttons.filter(b=>b.root.visible).every(b=>b.texture.width>1 && b.texture.getContext().getImageData(Math.floor(b.texture.width/2),Math.floor(b.texture.height/2),1,1).data[3]>0)'),true);
await run(`(()=>{const stream=document.querySelector('canvas').captureStream(30);window.recording=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1500000});const chunks=[];window.recording.ondataavailable=e=>chunks.push(e.data);window.video=new Promise(resolve=>{recording.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const data=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));resolve(btoa(binary));};});recording.start();return true;})()`);
await click('betDown'); assert.ok(await run('s.hud.fx.limitClock.progress<1'));
const point=await run('({x:s.hud.betUp.root.x/devicePixelRatio,y:s.hud.betUp.root.y/devicePixelRatio})');
await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
await wait(95); report.press=await run('s.hud.betUp.root.scaleX'); assert.ok(report.press<1);
await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
await wait(200); assert.equal(await run('s.hud.betUp.root.scaleX'),1);
await click('betDown'); await wait(200);
report.clamp=await run('(()=>{const balance=s.sm.displayBalance,server=s.sm.serverBalance;s.bet=500;s.sm.displayBalance=200;s.sm.serverBalance=200;s.refreshHud();const bet=s.bet;s.sm.displayBalance=balance;s.sm.serverBalance=server;s.bet=100;s.refreshHud();return bet;})()');
assert.equal(report.clamp,200);
await force(0); await click('drop');
await wait(100); report.hopper=await run('({load:s.pool.balls[0].loadLeft,scale:s.pool.balls[0].root.scaleX})');
assert.ok(report.hopper.load>0);
await wait(500); await shot('ball-hop');
await until('s.sm.inFlight===0');
report.win=await run('({target:s.hud.fx.winCount.target,value:s.hud.fx.winCount.value,active:s.hud.fx.active,skip:s.hud.skip.enabled,tags:s.director.wins.slots.filter(x=>x.root.visible).map(x=>x.text.text)})');
assert.ok(report.win.active); assert.ok(report.win.skip); assert.ok(report.win.value<report.win.target);
await shot('win-count'); await click('skip'); await wait(220);
assert.equal(await run('s.hud.fx.winCount.value===s.lastWin && s.hud.fx.balanceCount.value===s.sm.displayBalance && !s.director.active'),true);
assert.equal(await run('s.hud.skip.enabled'),false);
await force(8); await click('drop'); await until('s.sm.inFlight===0');
report.loss=await run('({win:s.lastWin,multiplier:s.lastMultiplier,counting:s.hud.fx.active,rings:s.bins.rings.some(r=>r.visible),tagQuiet:s.director.wins.slots.filter(x=>x.clock.progress<1).every(x=>x.quiet)})');
assert.ok(report.loss.multiplier<100); assert.equal(report.loss.counting,false); assert.equal(report.loss.rings,false); assert.equal(report.loss.tagQuiet,true);
await wait(300);
const video=await run('(async()=>{recording.stop();return await window.video;})()');
await fs.writeFile(new URL('phase-b-preview.webm',import.meta.url),Buffer.from(video,'base64'));
await send('Emulation.setCPUThrottlingRate',{rate:4});
for(const k of [0,16,8,2,14]) { await force(k); await click('drop'); await wait(35); }
assert.equal(await run('s.sm.inFlight'),5);
report.performance=await run(`new Promise(resolve=>{const frames=[];let start=performance.now(),last=start;function frame(now){frames.push(now-last);last=now;if(now-start<900)requestAnimationFrame(frame);else resolve({fps:frames.length*1000/(now-start),worst:Math.max(...frames),inFlight:s.sm.inFlight});}requestAnimationFrame(frame);})`);
await send('Emulation.setCPUThrottlingRate',{rate:1});
await click('turbo'); await wait(40);
assert.equal(await run('s.pool.balls.every(b=>b.trailRoots.every(t=>!t.visible))'),true);
await size(1280,720,1); await click('skip'); await wait(350);
report.settlement=await run('({display:s.sm.displayBalance,server:s.sm.serverBalance,hud:s.hud.fx.balanceCount.value,inFlight:s.sm.inFlight,landings})');
assert.equal(report.settlement.inFlight,0); assert.equal(report.settlement.display,report.settlement.server); assert.equal(report.settlement.hud,report.settlement.server);
for(const l of report.settlement.landings) { assert.ok(Math.abs(l.x-l.expectedX)<0.001); assert.ok(Math.abs(l.y-l.expectedY)<0.001); }
await shot('landscape-settled');
await click('feature');
for(let i=0;i<12;i++) { await wait(100); await click('skip'); if(await run("s.sm.state==='Idle'")) break; }
await until("s.sm.state==='Idle'",3000); await wait(250);
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance'),true);
report.feature=true;
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await size(360,640,2); await boot(); await force(0); await click('drop'); await wait(200);
report.reduced=await run('({scale:s.pool.balls[0].root.scaleX,trails:s.pool.balls.some(b=>b.trailRoots.some(t=>t.visible)),flashes:s.board.flashes.some(f=>f.visible)})');
assert.equal(report.reduced.scale,1); assert.equal(report.reduced.trails,false); assert.equal(report.reduced.flashes,false);
await until('s.sm.inFlight===0'); await wait(250);
assert.equal(await run('!s.hud.fx.active && s.hud.fx.winCount.value===s.lastWin'),true);
await shot('reduced-motion');
assert.equal(errors.length,0);
await fs.writeFile(new URL('results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));ws.close();
