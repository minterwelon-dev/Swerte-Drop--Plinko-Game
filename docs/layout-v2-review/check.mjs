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
await send('Runtime.enable');
await size(390,844,2);
await send('Page.navigate',{url:'http://127.0.0.1:5173/'});
await wait(2200);
await run(`window.s=window.__game.scene.getScene('Game'); document.querySelector('.debug')?.style.setProperty('display','none'); true`);
const report = { layouts: [], combinations: [], errors };
for (const [w,h,dpr] of [[390,844,2],[360,640,2],[320,568,2],[1280,720,1],[1920,1080,1]]) {
  await size(w,h,dpr);
  const info = await run(`(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {width:r.width,height:r.height,backing:[c.width,c.height],fonts:document.fonts.check('20px Bungee')&&document.fonts.check('20px "Nunito Sans"')}})()`);
  assert.equal(info.width,w); assert.equal(info.height,h); assert.equal(info.fonts,true);
  report.layouts.push({w,h,dpr,...info});
  await shot(`${w}x${h}`);
}
for (const rows of [8,10,12,14,16]) for (const risk of ['low','medium','high']) {
  const result = await run(`s.changeBoard(${rows},'${risk}'); ({rows:s.board.geo.rows,bins:s.bins.tickets.filter(t=>t.root.visible).length,labels:s.bins.tickets.filter(t=>t.root.visible).map(t=>t.label.text)})`);
  assert.equal(result.rows,rows); assert.equal(result.bins,rows+1); report.combinations.push({risk,...result});
}
await size(390,844,2);
await click('setup');
assert.equal(await run('s.hud.settingsOpen'),true);
assert.equal(await run('s.hud.rowButtons.every(b=>b.root.visible && b.root.depth>s.hud.settingsArt.depth)'),true);
await shot('portrait-setup'); await click('rowButtons[1]'); await click('setup');
assert.equal(await run('s.rows'),10);
assert.equal(await run('s.hud.settingsOpen'),false);
await click('setup');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
assert.equal(await run('s.hud.settingsOpen'),false);
await shot('portrait-10-rows');
await size(1280,720,1);
await shot('landscape-10-rows');
await click('rowButtons[4]');
for(let i=0;i<5;i++) { await click('drop'); await wait(60); }
report.flying = await run(`({count:s.sm.inFlight,bet:s.hud.betUp.enabled,rows:s.hud.rowButtons[0].enabled,risk:s.hud.riskButtons[0].enabled})`);
assert.equal(report.flying.count,5); assert.equal(report.flying.bet,false); assert.equal(report.flying.rows,false); assert.equal(report.flying.risk,false);
await size(360,640,2);
await click('skip'); await wait(250);
report.settlement=await run(`({count:s.sm.inFlight,display:s.sm.displayBalance,server:s.sm.serverBalance,history:s.history.values.length})`);
assert.equal(report.settlement.count,0); assert.equal(report.settlement.display,report.settlement.server); assert.equal(report.settlement.history,5);
await shot('portrait-settled');
await click('turbo'); await click('drop'); await wait(1800);
assert.equal(await run('s.sm.inFlight'),0);
assert.equal(errors.length,0);
await fs.writeFile(new URL('results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
ws.close();
