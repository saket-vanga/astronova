/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */
// Usage: start the game on http://localhost:8767, then run: node tools/screenshots/capture.mjs
// Opens headless Chrome, sets up each screen with real game state, and saves 2x PNGs to tools/screenshots/out/.
// Tiny Chrome DevTools Protocol driver: open the game, run setup JS, capture PNGs.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SCRATCH = mkdtempSync(join(tmpdir(), 'astronova-'));
const OUT = join(HERE, 'out'); mkdirSync(OUT, { recursive: true });
const PORT = 9333;
const prof = SCRATCH;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) { try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const pg = list.find(t => t.type === 'page'); if (pg) return pg.webSocketDebuggerUrl; } catch (e) {} await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function evalJS(expr) { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; }
async function size(w, h, mobile) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: !!mobile }); }
async function shot(name, full) {
  let clip;
  if (full) { const m = await send('Page.getLayoutMetrics'); const H = Math.min(m.cssContentSize.height, 2400); clip = { x: 0, y: 0, width: m.cssLayoutViewport.clientWidth, height: H, scale: 1 }; }
  const r = await send('Page.captureScreenshot', Object.assign({ format: 'png', captureBeyondViewport: !!full }, clip ? { clip } : {}));
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); console.log('saved', name);
}
const url = await connect();
ws = new WebSocket(url);
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
await new Promise(r => ws.onopen = r);
await send('Page.enable'); await send('Runtime.enable');
const steps = (await import(join(HERE, 'shots.mjs'))).default;
try { await steps({ send, evalJS, size, shot, sleep }); }
catch (e) { console.error('ERR', e.message); }
ws.close(); chrome.kill();
