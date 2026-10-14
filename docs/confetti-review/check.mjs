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
await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); await send('Emulation.setEmulatedMedia',{features:[]}); await size(390,844,2); await boot();
await run('coords.setReducedMotion(false);true');
const report={errors};
await run(`(()=>{const stream=document.querySelector('canvas').captureStream(30);window.recording=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1500000});const chunks=[];window.recording.ondataavailable=e=>chunks.push(e.data);window.video=new Promise(resolve=>{recording.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const data=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));resolve(btoa(binary));};});recording.start();return true;})()`);
await force(0); await click('drop'); await until('s.director.big.active');
await wait(350); await shot('burst');
assert.equal(await run('s.director.big.paperRoot.y===s.director.big.baseY'),true);
assert.equal(await run('new Set(s.director.big.paper.map(p=>p.y.toFixed(2))).size>100'),true);
await wait(950); await shot('fall');
await wait(1700);
assert.equal(await run('s.director.big.active'),false);
const data=await run('(async()=>{recording.stop();return await window.video;})()');
await fs.writeFile(new URL('confetti-preview.webm',import.meta.url),Buffer.from(data,'base64'));
await run('s.director.big.show(1500,1500);s.refreshHud();true'); await wait(1400);
assert.equal(await run('!s.director.big.root.visible && s.director.big.paperRoot.visible'),true);
await click('skip'); assert.equal(await run('s.director.big.paperRoot.visible'),false);
await click('turbo'); await run('s.director.big.show(12345,10000);s.refreshHud();true'); await wait(100);
assert.equal(await run('s.director.big.paper.filter(p=>p.visible).length'),60);
await click('skip'); await click('turbo');
await size(1280,720,1); await run('s.director.big.show(12345,10000);s.refreshHud();true'); await wait(450); await shot('landscape-burst');
await run('coords.setReducedMotion(true);s.director.big.show(12345,10000);s.refreshHud();true'); await wait(80);
assert.equal(await run('s.director.big.paperRoot.visible'),false);
assert.equal(await run('s.director.big.count.value'),12345);
assert.equal(await run('s.sm.displayBalance===s.sm.serverBalance'),true);
assert.deepEqual(errors,[]);
report.normal=true;report.skip=true;report.turbo=true;report.reduced=true;report.settlement=true;
await fs.writeFile(new URL('results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report)); ws.close();
