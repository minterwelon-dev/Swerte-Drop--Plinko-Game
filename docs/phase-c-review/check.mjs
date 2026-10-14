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
await send('Runtime.enable'); await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.removeItem("swerte-reduced-motion")}catch{}'}); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]}); await size(390,844,2); await boot();
const report = { errors, tiers: [] };
await run(`(()=>{const stream=document.querySelector('canvas').captureStream(30);window.recording=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1500000});const chunks=[];window.recording.ondataavailable=e=>chunks.push(e.data);window.video=new Promise(resolve=>{recording.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const data=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));resolve(btoa(binary));};});recording.start();return true;})()`);
await force(0); await click('drop'); await until('s.director.big.active');
await wait(200); await shot('epic-win-portrait');
assert.equal(await run('s.director.big.title.text'), 'EPIC WIN');
await wait(1400);
const video=await run('(async()=>{recording.stop();return await window.video;})()');
await fs.writeFile(new URL('phase-c-preview.webm',import.meta.url),Buffer.from(video,'base64'));
for (const [mult, title, particles] of [[1500,'BIG WIN',40],[5000,'MEGA WIN',80],[10000,'EPIC WIN',120]]) {
  await run(`s.director.big.show(12345,${mult}); true`); await wait(100);
  const state = await run('({title:s.director.big.title.text,particles:s.director.big.paper.filter(p=>p.visible).length})');
  assert.equal(state.title,title); assert.equal(state.particles,particles); report.tiers.push(state);
}
await click('skip'); assert.equal(await run('s.director.big.active'),false);
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance'),true);
await run('window.ambientBefore=s.booth.elapsed; s.game.hasFocus=false; true'); await wait(250);
assert.equal(await run('s.booth.elapsed===ambientBefore'),true);
await run('s.game.hasFocus=true; true');
await click('setup'); await wait(250); await shot('settings-portrait');
await click('motionBtn'); assert.equal(await run('coords.reducedMotion()'),true);
await run('s.director.big.show(12345,10000); true'); await wait(100);
assert.equal(await run('s.director.big.paper.some(p=>p.visible)'),false);
assert.equal(await run('s.director.big.count.value'),12345);
assert.equal(await run('s.booth.sign.angle'),0);
await click('motionBtn'); await click('setup'); await click('skip');
await click('auto'); await wait(250); await shot('auto-modal');
await run("s.autoPanel.loss.value='';s.autoPanel.loss.dispatchEvent(new Event('input'));true");
assert.equal(await run('document.querySelector(".modal button[type=submit]").disabled'),true);
await run('s.autoPanel.modal.close(); true'); await wait(180);
await run('s.autoPanel.modal.open();s.autoPanel.modal.close();s.autoPanel.modal.open();true'); await wait(250);
assert.equal(await run('document.querySelector(".modal h2").textContent'),'Auto-drop');
await run('s.autoPanel.modal.close();true'); await wait(180);
await click('setup'); await click('fair'); await wait(250);
await run('s.seedPanel.rotateBtn.click(); true'); await wait(200);
assert.equal(await run('s.seedPanel.revealed.querySelector("del").textContent.length'),64);
await shot('fair-modal');
await run('s.seedPanel.modal.close();s.openVerify();true'); await wait(700);
assert.equal(await run('s.verifyModal.out.textContent.includes("Matches the committed hash")'),true);
await shot('verify-stamp');
await run('s.verifyModal.modal.close(); true'); await wait(180);
await run('window.beforeFailure=s.sm.displayBalance;s.rgs.failureRate=1;true');
await click('drop'); await until('document.querySelector(".modal-error")!==null');
await shot('retry-banner');
await run('s.retry.answer(false);s.rgs.failureRate=0;true'); await wait(250);
assert.equal(await run('s.sm.displayBalance===beforeFailure&&s.sm.inFlight===0'),true);
await run('s.hud.closeSettings();s.director.skip();true');
await run('s.changeBoard(8,"high");true'); await wait(100);
assert.equal(await run('s.board.geo.rows'),8);
assert.equal(await run('s.bins.retileClock.progress<1'),true);
await run('s.changeBoard(16,"medium");s.director.skip();true');
await send('Emulation.setCPUThrottlingRate',{rate:4});
for (const bin of [0,16,8,2,14]) { await force(bin); await click('drop'); await wait(35); }
assert.equal(await run('s.sm.inFlight'),5);
report.performance=await run(`new Promise(resolve=>{let frames=0,worst=0,start=performance.now(),last=start;function frame(now){frames++;worst=Math.max(worst,now-last);last=now;if(now-start<900)requestAnimationFrame(frame);else resolve({fps:frames*1000/(now-start),worst,inFlight:s.sm.inFlight});}requestAnimationFrame(frame);})`);
await send('Emulation.setCPUThrottlingRate',{rate:1});
await size(1280,720,1); await click('skip'); await wait(200);
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance&&s.sm.inFlight===0'),true);
await run('s.director.big.show(12345,5000);true'); await wait(200); await shot('mega-win-landscape');
await click('skip');
await size(1920,1080,1); await shot('desktop');
await run('(async()=>{window.pending=await s.rgs.drop({sessionId:s.sessionId,bet:s.bet,rows:s.rows,risk:s.risk});return true;})()');
await boot(); assert.equal(await run('s.sm.inFlight'),0);
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance'),true);
report.resume=true;
await size(360,640,2); await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await run('s.director.big.show(12345,10000);true'); await wait(250); await shot('reduced-small-portrait');
assert.equal(await run('s.director.big.paper.some(p=>p.visible)'),false);
assert.equal(await run('s.booth.sign.angle'),0);
await run('s.director.skip();s.autoPanel.open(s.bet,s.sm.serverBalance);true'); await wait(250);
assert.equal(await run('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'),true);
await shot('small-phone-modal');
await run('s.autoPanel.modal.close();true'); await wait(180);
assert.deepEqual(errors,[]);
await fs.writeFile(new URL('results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
ws.close();
