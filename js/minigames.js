/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Arcade minigames for each flight phase, plus the science scan.
   Every game: { title, icon, how, keys, init(opts, w, h), step(s, dt) -> result|null, draw(ctx, s, w, h), hud(s), finish(res), verdict(res) }.
   The design reaches each game through opts: heavy, agility, tol, assist, span, shield, hazard, gravity, rough. */

// ---------- input: keyboard and on-screen buttons ----------
const K = { left: false, right: false, up: false, down: false, space: false, spaceHit: false };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'space' };
function resetKeys() { for (const k in K) K[k] = false; }
function playing() { return S.screen === 'game' && S.game && (S.game.phase === 'play' || S.game.phase === 'countdown'); }
document.addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (!k || (e.target.matches && e.target.matches('input, textarea'))) return;
  if (SCAN.on) { if (k === 'space') { e.preventDefault(); if (!e.repeat) scanPress(); } return; }
  if (!playing()) return;
  e.preventDefault();
  if (k === 'space' && !K.space) K.spaceHit = true;
  K[k] = true;
});
document.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) K[k] = false; });
window.addEventListener('blur', resetKeys);
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.tbtn'); if (!b) return;
  e.preventDefault();
  const k = b.dataset.key;
  if (k === 'space' && !K.space) K.spaceHit = true;
  K[k] = true; b.classList.add('on');
  try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => document.addEventListener(t, e => {
  const b = e.target.closest && e.target.closest('.tbtn'); if (!b) return;
  K[b.dataset.key] = false; b.classList.remove('on');
}));

// ---------- small drawing helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
function mixColor(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], clamp(t, 0, 1)))).join(',')})`;
}
function makeStars(n, w, h) { return Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .3, z: Math.random() })); }
function drawStarfield(ctx, stars, w, h, dy) {
  ctx.fillStyle = '#fff';
  for (const st of stars) {
    const y = ((st.y + (dy || 0) * (0.3 + st.z)) % h + h) % h;
    ctx.globalAlpha = 0.4 + st.z * 0.6;
    ctx.fillRect(st.x, y, st.r, st.r);
  }
  ctx.globalAlpha = 1;
}
function label(ctx, text, x, y, color, size, align) {
  ctx.font = `800 ${size || 16}px system-ui, sans-serif`; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,8,25,.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y);
}
function vbar(ctx, x, y, w, h, frac, color, zones) {
  ctx.fillStyle = 'rgba(5,8,25,.6)'; ctx.fillRect(x, y, w, h);
  for (const z of zones || []) { ctx.fillStyle = z.c; ctx.fillRect(x, y + h * (1 - z.b), w, h * (z.b - z.a)); }
  ctx.fillStyle = color; ctx.fillRect(x, y + h * (1 - frac) - 2, w, 4);
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
}
function hbar(ctx, x, y, w, h, frac, color, zones) {
  ctx.fillStyle = 'rgba(5,8,25,.6)'; ctx.fillRect(x, y, w, h);
  for (const z of zones || []) { ctx.fillStyle = z.c; ctx.fillRect(x + w * z.a, y, w * (z.b - z.a), h); }
  ctx.fillStyle = color; ctx.fillRect(x + w * clamp(frac, 0, 1) - 2, y - 3, 4, h + 6);
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
}
function drawRocket(ctx, x, y, angleDeg, throttle, scale) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angleDeg * Math.PI / 180); ctx.scale(scale || 1, scale || 1);
  if (throttle > 0) {
    const f = 18 + throttle * 34 + Math.random() * 8;
    const g = ctx.createLinearGradient(0, 28, 0, 28 + f); g.addColorStop(0, '#fff6b0'); g.addColorStop(.4, '#ffb347'); g.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-7, 28); ctx.lineTo(0, 28 + f); ctx.lineTo(7, 28); ctx.fill();
  }
  ctx.fillStyle = '#e9ecff'; ctx.fillRect(-8, -22, 16, 50);
  ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(0, -40); ctx.lineTo(8, -22); ctx.fill();
  ctx.fillStyle = '#5b6bd6'; ctx.beginPath(); ctx.moveTo(-8, 14); ctx.lineTo(-16, 30); ctx.lineTo(-8, 28); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, 14); ctx.lineTo(16, 30); ctx.lineTo(8, 28); ctx.fill();
  ctx.fillStyle = '#7cc4ff'; ctx.beginPath(); ctx.arc(0, -8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawLander(ctx, x, y, s, thrust, side) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (thrust) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(0, 22 + Math.random() * 10); ctx.lineTo(5, 10); ctx.fill(); }
  if (side) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(side > 0 ? -16 : 16, -2, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#cfd5ff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-15, 14); ctx.moveTo(8, 6); ctx.lineTo(15, 14); ctx.moveTo(-18, 14); ctx.lineTo(-12, 14); ctx.moveTo(12, 14); ctx.lineTo(18, 14); ctx.stroke();
  ctx.fillStyle = '#ffd166'; ctx.fillRect(-11, -4, 22, 12);
  ctx.fillStyle = '#e9ecff'; ctx.beginPath(); ctx.arc(0, -6, 9, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#5b6bd6'; ctx.beginPath(); ctx.arc(0, -8, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------- the games ----------
const GAMES = {};

GAMES.launch = {
  title: 'Launch', icon: '🚀', role: 'prop',
  how: 'Steer the rocket to follow the green ghost: it tips over slowly as you climb (a gravity turn). Between 8 and 22 km you hit Max-Q, the point of peak air pressure, so ease off the throttle there.',
  keys: [{ k: 'left', l: '◀ Tilt' }, { k: 'down', l: '▼ Less' }, { k: 'up', l: '▲ More' }, { k: 'right', l: 'Tilt ▶' }],
  init(o, w, h) {
    return { o, alt: 0, pitch: 0, drift: 0, throttle: 1, t: 0, inBand: 0, total: 0, overloads: 0, stress: 0, combo: 0, comboT: 0, bestCombo: 0,
      msg: '', msgT: 0, shake: 0, clouds: Array.from({ length: 8 }, () => ({ x: Math.random() * w, y: Math.random() * h, s: rnd(.6, 1.4) })), stars: makeStars(70, w, h) };
  },
  ideal(alt) { return 90 * Math.sqrt(Math.min(1, alt / 160)); },
  step(s, dt) {
    const o = s.o, heavy = o.heavy || 0, ag = (o.agility || 1) * (1 - 0.35 * heavy);
    s.t += dt;
    const inQ = s.alt > 8 && s.alt < 22;
    s.inQ = inQ;
    if (inQ && o.assist) s.throttle += (0.62 - s.throttle) * Math.min(1, dt * 4);
    else {
      if (K.up) s.throttle = Math.min(1, s.throttle + dt * 0.9);
      if (K.down) s.throttle = Math.max(0.3, s.throttle - dt * 0.9);
      if (!K.up && !K.down && s.alt >= 22) s.throttle = Math.min(1, s.throttle + dt * 0.3);
    }
    s.drift = clamp((s.drift + (Math.random() - 0.5) * dt * 40 * (1 + heavy)) * (1 - dt * 0.7), -12, 12);
    const steer = (K.right ? 1 : 0) - (K.left ? 1 : 0);
    s.pitch = clamp(s.pitch + (steer * 40 * ag + s.drift) * dt, -15, 105);
    s.alt += s.throttle * (4.8 - 1.5 * heavy) * dt;
    const dev = Math.abs(s.pitch - this.ideal(s.alt)), band = 6 * (o.tol || 1);
    s.total += dt;
    if (dev < band) {
      s.inBand += dt * (1 - dev / band * 0.3); s.comboT += dt;
      if (s.comboT >= 2) { s.combo++; s.comboT = 0; s.bestCombo = Math.max(s.bestCombo, s.combo); s.msg = 'On the line! ×' + s.combo; s.msgT = 1.2; SFX.blip(); }
    } else { s.comboT = 0; s.combo = 0; }
    if (inQ && s.throttle > 0.72) {
      s.stress += dt * (s.throttle - 0.72) * 5;
      if (s.stress >= 1) { s.overloads++; s.stress = 0; s.shake = 0.6; s.msg = 'Overload! Throttle down through Max-Q'; s.msgT = 1.6; SFX.deny(); }
    } else s.stress = Math.max(0, s.stress - dt * 0.5);
    s.shake = Math.max(0, s.shake - dt); s.msgT -= dt;
    if (s.alt >= 160) return this.finish({ acc: s.inBand / s.total, overloads: s.overloads, combo: s.bestCombo });
    return null;
  },
  finish(r) { r.acc = clamp(r.acc, 0, 1); r.overloads = r.overloads || 0; r.score = r.score != null ? r.score : clamp(Math.round(r.acc * 100 - r.overloads * 12 + (r.combo || 0) * 2), 5, 100); r.ok = true; return r; },
  draw(ctx, s, w, h) {
    const a = Math.min(1, s.alt / 90);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mixColor('#3f86e0', '#03041a', a)); sky.addColorStop(1, mixColor('#9fd0ff', '#0b1030', a));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (s.shake > 0) ctx.translate(rnd(-4, 4) * s.shake * 2, rnd(-4, 4) * s.shake * 2);
    if (a > 0.3) { ctx.globalAlpha = (a - 0.3) / 0.7; drawStarfield(ctx, s.stars, w, h, s.alt * 6); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const c of s.clouds) {
      const y = (c.y + s.alt * 40 * c.s) % (h * 3);
      if (y > h + 40 || s.alt > 40) continue;
      ctx.beginPath(); ctx.ellipse(c.x, y, 40 * c.s, 14 * c.s, 0, 0, Math.PI * 2); ctx.fill();
    }
    const gy = h * 0.78 + s.alt * 60;
    if (gy < h) { ctx.fillStyle = '#2f7d4f'; ctx.fillRect(0, gy, w, h - gy); ctx.fillStyle = '#555'; ctx.fillRect(w / 2 - 30, gy - 6, 60, 6); }
    const ideal = this.ideal(s.alt), x = w / 2, y = h * 0.58;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ideal * Math.PI / 180);
    ctx.strokeStyle = 'rgba(6,214,160,.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, -120); ctx.stroke(); ctx.strokeRect(-10, -24, 20, 52); ctx.setLineDash([]); ctx.restore();
    drawRocket(ctx, x, y, s.pitch, s.throttle, 1.1);
    ctx.restore();
    // altitude bar with the Max-Q band
    vbar(ctx, w - 30, 20, 14, h - 40, s.alt / 160, '#fff', [{ a: 8 / 160, b: 22 / 160, c: 'rgba(239,71,111,.75)' }]);
    label(ctx, 'Max-Q', w - 36, 20 + (h - 40) * (1 - 15 / 160), '#ffb3c4', 11, 'right');
    vbar(ctx, 16, 20, 14, h - 40, s.throttle, '#ffd166', [{ a: 0, b: 0.72, c: 'rgba(6,214,160,.35)' }]);
    label(ctx, 'Throttle', 12, h - 10, '#ffd166', 11, 'left');
    if (s.inQ) { label(ctx, 'MAX-Q', w / 2, 28, '#ff8fab', 18); if (s.o.assist) label(ctx, 'AUTO-THROTTLE ON', w / 2, 50, '#5ee6c8', 13); }
    if (s.msgT > 0) label(ctx, s.msg, w / 2, h * 0.86, s.msg.startsWith('Over') ? '#ff8fab' : '#ffd166', 18);
  },
  hud(s) { return `Altitude <b>${Math.round(s.alt)} km</b> · Throttle <b>${Math.round(s.throttle * 100)}%</b> · On the line <b>${Math.round(s.inBand / Math.max(.01, s.total) * 100)}%</b>`; },
  verdict(r) {
    const g = r.score >= 75 ? 'good' : r.score >= 45 ? 'ok' : 'bad';
    return { good: g, title: ['Perfect gravity turn!', 'Into orbit', 'Wobbly, but up'][['good', 'ok', 'bad'].indexOf(g)],
      text: `You followed the line ${fmtPct(r.acc)} of the time${r.overloads ? ' and overloaded the rocket ' + plural(r.overloads, 'time') + ' at Max-Q' : ''}.${r.combo ? ' Best combo ×' + r.combo + '.' : ''}` };
  }
};

GAMES.dodge = {
  title: 'Cruise', icon: '☄️', role: 'lead',
  how: 'Steer through the debris field. Grab ✦ star fixes to check your navigation. Every hit breaks a real part unless your debris shield soaks it up. Bigger solar wings make a bigger target.',
  keys: [{ k: 'left', l: '◀' }, { k: 'up', l: '▲' }, { k: 'down', l: '▼' }, { k: 'right', l: '▶' }],
  init(o, w, h) {
    return { o, x: w / 2, y: h * 0.8, t: 0, dur: 24, debris: [], fixes: [], hits: 0, got: 0, inv: 0, shield: o.shield || 0, spawnT: 0.6, fixT: 1.5, w, h,
      stars: makeStars(90, w, h), msg: '', msgT: 0, hw: 16 * (o.span || 1) };
  },
  step(s, dt) {
    const o = s.o, tol = o.tol || 1, ag = (o.agility || 1) * (1 - 0.35 * (o.heavy || 0));
    s.t += dt;
    const sp = 230 * ag;
    s.x = clamp(s.x + ((K.right ? 1 : 0) - (K.left ? 1 : 0)) * sp * dt, s.hw + 4, s.w - s.hw - 4);
    s.y = clamp(s.y + ((K.down ? 1 : 0) - (K.up ? 1 : 0)) * sp * 0.7 * dt, s.h * 0.45, s.h - 24);
    s.spawnT -= dt;
    if (s.spawnT <= 0 && s.t < s.dur - 1.5) {
      s.spawnT = 1 / (0.7 + 1.7 * (o.hazard || 0.5)) * rnd(0.6, 1.4);
      const r = rnd(8, 18);
      s.debris.push({ x: rnd(r, s.w - r), y: -r, r, vy: rnd(110, 200) * (1 + s.t / 40) / Math.pow(tol, 0.3), vx: rnd(-30, 30), a: 0, va: rnd(-3, 3),
        pts: Array.from({ length: 7 }, (_, i) => ({ a: i / 7 * Math.PI * 2, d: rnd(.65, 1) })) });
    }
    s.fixT -= dt;
    if (s.fixT <= 0 && s.t < s.dur - 2) { s.fixT = rnd(1.6, 2.6); s.fixes.push({ x: rnd(20, s.w - 20), y: -10, vy: 90 }); }
    const hx = s.hw * 0.75 / Math.sqrt(tol), hy = 12 / Math.sqrt(tol);
    for (const d of s.debris) {
      d.y += d.vy * dt; d.x += d.vx * dt; d.a += d.va * dt;
      const dx = (d.x - s.x) / (hx + d.r * 0.8), dy = (d.y - s.y) / (hy + d.r * 0.8);
      if (!d.dead && s.inv <= 0 && dx * dx + dy * dy < 1) {
        d.dead = true; s.hits++; s.inv = 1;
        if (s.shield > 0) { s.shield--; s.msg = 'Shield absorbed it!'; } else s.msg = 'Hit! A part is damaged.';
        s.msgT = 1.2; SFX.deny();
      }
    }
    for (const f of s.fixes) { f.y += f.vy * dt; if (!f.dead && Math.abs(f.x - s.x) < s.hw + 10 && Math.abs(f.y - s.y) < 22) { f.dead = true; s.got++; s.msg = 'Star fix ✦'; s.msgT = .8; SFX.blip(); } }
    s.debris = s.debris.filter(d => !d.dead && d.y < s.h + 30);
    s.fixes = s.fixes.filter(f => !f.dead && f.y < s.h + 20);
    s.inv -= dt; s.msgT -= dt;
    if (s.t >= s.dur) return this.finish({ hits: s.hits, fixes: s.got });
    return null;
  },
  finish(r) { r.hits = r.hits || 0; r.fixes = r.fixes || 0; r.score = r.score != null ? r.score : clamp(Math.round(100 - r.hits * 15 + r.fixes * 3), 5, 100); r.ok = true; return r; },
  draw(ctx, s, w, h) {
    ctx.fillStyle = '#060a24'; ctx.fillRect(0, 0, w, h);
    drawStarfield(ctx, s.stars, w, h, s.t * 120);
    ctx.fillStyle = '#ffd166'; ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of s.fixes) ctx.fillText('✦', f.x, f.y);
    for (const d of s.debris) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
      ctx.fillStyle = '#8a8fa8'; ctx.strokeStyle = '#c9cde6'; ctx.lineWidth = 1.5;
      ctx.beginPath(); d.pts.forEach((p, i) => { const px = Math.cos(p.a) * d.r * p.d, py = Math.sin(p.a) * d.r * p.d; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (s.inv > 0 && Math.floor(s.inv * 10) % 2) ctx.globalAlpha = 0.4;
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.fillStyle = '#3157c4'; ctx.strokeStyle = '#9ec0ff'; ctx.lineWidth = 1;
    ctx.fillRect(-s.hw, -5, s.hw - 9, 10); ctx.strokeRect(-s.hw, -5, s.hw - 9, 10);
    ctx.fillRect(9, -5, s.hw - 9, 10); ctx.strokeRect(9, -5, s.hw - 9, 10);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-9, -11, 18, 22);
    ctx.fillStyle = '#e9ecff'; ctx.beginPath(); ctx.arc(0, -14, 6, Math.PI, 0); ctx.fill();
    if (s.shield > 0) { ctx.strokeStyle = 'rgba(94,230,200,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, s.hw + 8, 22, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;
    hbar(ctx, 16, 12, w - 32, 6, s.t / s.dur, '#5ee6c8');
    if (s.msgT > 0) label(ctx, s.msg, w / 2, h * 0.35, s.msg.startsWith('Hit') ? '#ff8fab' : '#5ee6c8', 18);
  },
  hud(s) { return `Hits <b>${s.hits}</b> · Shield <b>${s.shield}</b> · Star fixes <b>${s.got}</b> · ${Math.max(0, Math.ceil(s.dur - s.t))} s left`; },
  verdict(r) {
    const g = r.hits === 0 ? 'good' : r.hits <= 2 ? 'ok' : 'bad';
    return { good: g, title: ['Clean run!', 'Through the field', 'Battered'][['good', 'ok', 'bad'].indexOf(g)],
      text: `${r.hits ? plural(r.hits, 'debris hit') : 'No debris hits'} and ${plural(r.fixes, 'star fix', )} collected.` };
  }
};

GAMES.insertion = {
  title: 'Orbit insertion', icon: '🎯', role: 'prop',
  how: 'You are arriving too fast to stay. Hold BURN to fire the engine and slow down. Let go when the needle is in the green, so your path (white) matches the target orbit (dashed). You can tap again to trim, but every restart wastes a little fuel.',
  keys: [{ k: 'space', l: '🔥 Hold to burn' }],
  init(o, w, h) {
    const target = rnd(0.5, 0.62);
    return { o, v: 1, t: 0, limit: 14, burning: false, burns: 0, after: 0, ramp: 0, target, band: 0.035 * (o.tol || 1), stars: makeStars(80, w, h) };
  },
  step(s, dt) {
    const o = s.o, heavy = o.heavy || 0;
    s.t += dt;
    const on = K.space || K.up;
    if (on) {
      if (!s.burning) { s.burning = true; s.burns++; s.ramp = 0; }
      s.ramp += dt;
      s.v -= (0.05 + 0.08 * s.ramp) * (1 - 0.3 * heavy) * dt;
    } else if (s.burning) { s.burning = false; s.after = 0; }
    if (!s.burning && s.burns) s.after += dt;
    const settled = s.burns && !s.burning && s.after > 1 && s.v <= s.target + s.band;
    if (settled || s.t >= s.limit || s.v <= 0.2) return this.finish({ v: s.v, target: s.target, band: s.band, burns: s.burns });
    return null;
  },
  finish(r) {
    if (r.err == null) {
      let err = Math.abs(r.v - r.target) / r.target;
      if (Math.abs(r.v - r.target) <= r.band) err *= 0.3;
      r.err = Math.round((err + Math.max(0, (r.burns || 1) - 1) * 0.02) * 100) / 100;
    }
    r.score = r.score != null ? r.score : clamp(Math.round(100 - r.err * 250), 5, 100); r.ok = true; return r;
  },
  draw(ctx, s, w, h) {
    ctx.fillStyle = '#060a24'; ctx.fillRect(0, 0, w, h); drawStarfield(ctx, s.stars, w, h, 0);
    const cx = w * 0.42, cy = h * 0.45, R = Math.min(w, h) * 0.12, rt = Math.min(w, h) * 0.26;
    const pc = planetColor(S.mission ? S.mission.planet : 'mars');
    const g = ctx.createRadialGradient(cx - R * .3, cy - R * .3, 2, cx, cy, R); g.addColorStop(0, '#fff'); g.addColorStop(.25, pc); g.addColorStop(1, '#111');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(6,214,160,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rt, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // predicted path: the ship is at the right of the planet; its speed sets the shape
    const e = clamp((s.v - s.target) / (1 - s.target) * 1.1, -0.7, 1.2);
    ctx.lineWidth = 2.5;
    if (e < 0.97) {
      const rp = e >= 0 ? rt : rt * (1 + e) / (1 - e), ra = e >= 0 ? rt * (1 + e) / (1 - e) : rt;
      const a = (rp + ra) / 2, c = a - rp, b = Math.sqrt(Math.max(1, a * a - c * c));
      ctx.strokeStyle = rp < R * 1.05 ? '#ff6b8a' : '#fff';
      ctx.beginPath(); ctx.ellipse(e >= 0 ? cx - c : cx + c, cy, a, b, 0, 0, Math.PI * 2); ctx.stroke();
      if (rp < R * 1.05) label(ctx, 'Too low! Into the atmosphere', w / 2, h * 0.84, '#ff8fab', 15);
    } else {
      ctx.strokeStyle = '#ffb347'; ctx.beginPath();
      for (let i = -1; i <= 1; i += 0.05) { const y = cy + i * h * 0.6, x = cx + rt + Math.pow(Math.abs(i), 1.6) * -w * 0.9 * (1.2 - Math.min(e, 1.2) + 0.25); i === -1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke(); label(ctx, 'Escaping! Burn to slow down', w / 2, h * 0.84, '#ffb347', 15);
    }
    ctx.save(); ctx.translate(cx + rt, cy);
    if (s.burning) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(0, -26 - Math.random() * 8); ctx.lineTo(5, -8); ctx.fill(); }
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-7, -8, 14, 16); ctx.restore();
    const bx = 24, bw = w - 48, by = h - 34, map = v => (v - 0.2) / 0.8;
    hbar(ctx, bx, by, bw, 14, map(s.v), '#fff', [{ a: map(s.target - s.band), b: map(s.target + s.band), c: 'rgba(6,214,160,.8)' }]);
    label(ctx, 'Speed', bx, by - 10, '#cfd5ff', 11, 'left');
  },
  hud(s) { return `Speed <b>${Math.round(s.v * 100)}</b> · Target <b>${Math.round(s.target * 100)}</b> · Burns <b>${s.burns}</b> · ${Math.max(0, Math.ceil(s.limit - s.t))} s`; },
  verdict(r) {
    const g = r.err < 0.08 ? 'good' : r.err < 0.25 ? 'ok' : 'bad';
    return { good: g, title: ['Bullseye!', 'In orbit', 'Messy orbit'][['good', 'ok', 'bad'].indexOf(g)],
      text: r.err < 0.08 ? 'Right on the line. Almost no fuel wasted.' : `You missed the target orbit by ${fmtPct(r.err)}. Fixing it will cost extra fuel.` };
  }
};

// Shared lander physics for landing and touch-and-go.
function makeTerrain(W, rough, padW, padX) {
  const pts = [];
  for (let x = 0; x <= W; x += 8) pts.push({ x, y: 12 + Math.sin(x / 23) * 4 * rough + Math.sin(x / 9.7) * 3 * rough + rnd(-2, 2) * rough });
  if (padW) for (const p of pts) if (p.x >= padX - padW / 2 - 4 && p.x <= padX + padW / 2 + 4) p.y = 14;
  return pts;
}
function groundAt(pts, x) {
  const i = clamp(Math.floor(x / 8), 0, pts.length - 2), a = pts[i], b = pts[i + 1];
  return lerp(a.y, b.y, clamp((x - a.x) / 8, 0, 1));
}
function drawTerrain(ctx, s, w, h, sx, sy) {
  const pc = planetColor(S.mission ? S.mission.planet : 'moon');
  ctx.fillStyle = mixColor(pc.length === 7 ? pc : '#888888', '#000000', 0.25);
  ctx.beginPath(); ctx.moveTo(0, h);
  for (const p of s.ground) ctx.lineTo(p.x * sx, h - p.y * sy);
  ctx.lineTo(w, h); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
  s.ground.forEach((p, i) => i ? ctx.lineTo(p.x * sx, h - p.y * sy) : ctx.moveTo(p.x * sx, h - p.y * sy)); ctx.stroke();
}

GAMES.landing = {
  title: 'Landing', icon: '🛬', role: 'sci', W: 200, H: 120,
  how: 'Bring the lander down on the flashing pad. ▲ fires the main engine against gravity, ◀ ▶ nudge you sideways. Touch down slower than the safe speed shown in green. Watch your fuel!',
  keys: [{ k: 'left', l: '◀' }, { k: 'up', l: '▲ Thrust' }, { k: 'right', l: '▶' }],
  init(o, w, h) {
    const tol = o.tol || 1, padW = 18 + 12 * (tol - 1), padX = rnd(55, 145), fromLeft = padX > 100;
    return { o, x: fromLeft ? 25 : 175, y: 104, vx: fromLeft ? 4 : -4, vy: 0, fuel: 12 + 6 * (tol - 1), fuel0: 12 + 6 * (tol - 1),
      g: o.gravity || 1.62, padX, padW, ground: makeTerrain(200, o.rough == null ? 0.5 : o.rough + 0.3, padW, padX), stars: makeStars(60, w, h),
      vyLim: 2.4 * Math.sqrt(tol), vxLim: 1.6 * Math.sqrt(tol), t: 0, thrust: false, side: 0 };
  },
  step(s, dt) {
    const o = s.o, thrustA = Math.max(4, s.g * 2.2), sideA = 2.6 * (o.agility || 1);
    s.t += dt;
    s.thrust = K.up && s.fuel > 0; s.side = s.fuel > 0 ? (K.right ? 1 : 0) - (K.left ? 1 : 0) : 0;
    if (s.thrust) s.fuel -= dt;
    if (s.side) s.fuel -= dt * 0.3;
    s.fuel = Math.max(0, s.fuel);
    s.vx += s.side * sideA * dt;
    s.vy += (-s.g + (s.thrust ? thrustA : 0)) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < 4) { s.x = 4; s.vx = Math.abs(s.vx) * .3; } if (s.x > 196) { s.x = 196; s.vx = -Math.abs(s.vx) * .3; }
    s.y = Math.min(s.y, 130);
    const gy = groundAt(s.ground, s.x);
    if (s.y <= gy + 2) {
      const onPad = Math.abs(s.x - s.padX) <= s.padW / 2;
      const slope = Math.abs(groundAt(s.ground, s.x + 4) - groundAt(s.ground, s.x - 4)) / 8;
      let outcome = 'crash', why = '';
      if (-s.vy > s.vyLim) why = 'fast';
      else if (Math.abs(s.vx) > s.vxLim) why = 'side';
      else if (!onPad && slope >= 0.35) why = 'slope';
      else outcome = onPad ? 'pad' : 'off';
      return this.finish({ outcome, why, vy: -s.vy, vx: Math.abs(s.vx), vyLim: s.vyLim, vxLim: s.vxLim, fuelLeft: s.fuel / s.fuel0 });
    }
    return null;
  },
  finish(r) {
    r.outcome = r.outcome || 'pad';
    r.score = r.score != null ? r.score : r.outcome === 'pad' ? clamp(Math.round(70 + 30 * (1 - (r.vy || 0) / (r.vyLim || 3)) * 0.7 + 30 * 0.3 * (r.fuelLeft || 0)), 60, 100) : r.outcome === 'off' ? 45 : 0;
    r.ok = r.outcome !== 'crash'; return r;
  },
  draw(ctx, s, w, h) {
    ctx.fillStyle = '#070b26'; ctx.fillRect(0, 0, w, h); drawStarfield(ctx, s.stars, w, h, 0);
    const sx = w / 200, sy = h / 130;
    drawTerrain(ctx, s, w, h, sx, sy);
    const blink = Math.floor(s.t * 3) % 2;
    ctx.fillStyle = blink ? '#5ee6c8' : '#2a8f7b';
    ctx.fillRect((s.padX - s.padW / 2) * sx, h - 14 * sy - 3, s.padW * sx, 5);
    drawLander(ctx, s.x * sx, h - (s.y + 6) * sy, 1.1, s.thrust, s.side);
    const safe = -s.vy <= s.vyLim && Math.abs(s.vx) <= s.vxLim;
    label(ctx, `↓ ${Math.max(0, -s.vy).toFixed(1)}   ↔ ${Math.abs(s.vx).toFixed(1)} m/s`, w / 2, 20, safe ? '#5ee6c8' : '#ff8fab', 15);
    label(ctx, `safe: ↓ below ${s.vyLim.toFixed(1)}, ↔ below ${s.vxLim.toFixed(1)}`, w / 2, 40, '#cfd5ff', 11);
    vbar(ctx, w - 26, 16, 12, 90, s.fuel / s.fuel0, '#ffd166');
    label(ctx, 'Fuel', w - 20, 116, '#ffd166', 11);
  },
  hud(s) { const alt = Math.max(0, s.y - groundAt(s.ground, s.x)); return `Height <b>${Math.round(alt)} m</b> · Fuel <b>${Math.round(s.fuel / s.fuel0 * 100)}%</b> · Gravity ${s.g} m/s²`; },
  verdict(r) {
    const g = r.outcome === 'pad' ? 'good' : r.outcome === 'off' ? 'ok' : 'bad';
    return { good: g, title: { pad: 'The Eagle has— er, the lander has landed!', off: 'Down, but off the pad', crash: 'Crash!' }[r.outcome],
      text: r.outcome === 'pad' ? `Down safely on the pad at ${(r.vy || 0).toFixed(1)} m/s.` : r.outcome === 'off' ? 'Down safely, just not on the pad. It still counts.'
        : { fast: `The lander hit the ground at ${(r.vy || 0).toFixed(1)} m/s. Safe is below ${(r.vyLim || 3).toFixed(1)}.`,
            side: `You were still sliding sideways at ${(r.vx || 0).toFixed(1)} m/s, and the lander tipped over. Stop drifting before touchdown.`,
            slope: 'The ground there was too steep, and the lander tipped over. Aim for the flat pad.' }[r.why] || 'The lander hit too hard and broke.' };
  }
};

GAMES.tag = {
  title: 'Touch-and-go', icon: '🦾', role: 'sci',
  how: 'Gravity here is almost nothing. Drift down gently and touch the surface away from the boulders. Hold still for 3 seconds while the arm grabs a sample, then fire ▲ to back away before you tip over.',
  keys: [{ k: 'left', l: '◀' }, { k: 'up', l: '▲ Thrust' }, { k: 'right', l: '▶' }],
  init(o, w, h) {
    const tol = o.tol || 1, rough = o.rough == null ? 0.5 : o.rough;
    const boulders = Array.from({ length: Math.round(2 + rough * 4) }, () => ({ x: rnd(15, 185), r: rnd(3, 4 + rough * 3) }));
    return { o, x: 100 + rnd(-40, 40), y: 40, vx: rnd(-1, 1), vy: -1.5, g: Math.max(0.6, o.gravity || 0.25), fuel: 14 + 5 * (tol - 1), fuel0: 14 + 5 * (tol - 1),
      ground: makeTerrain(200, 0.25), boulders, stars: makeStars(60, w, h), phase: 'descend', touchT: 0, escT: 0,
      vyLim: 1.6 * Math.sqrt(tol), vxLim: 1.2 * Math.sqrt(tol), t: 0, thrust: false, side: 0 };
  },
  step(s, dt) {
    const o = s.o, sideA = 3 * (o.agility || 1), thrustA = 2.6;
    s.t += dt;
    s.thrust = K.up && s.fuel > 0; s.side = s.fuel > 0 && s.phase !== 'touch' ? (K.right ? 1 : 0) - (K.left ? 1 : 0) : 0;
    if (s.thrust) s.fuel -= dt; if (s.side) s.fuel -= dt * 0.3; s.fuel = Math.max(0, s.fuel);
    const gy = groundAt(s.ground, s.x);
    if (s.phase === 'touch') {
      s.touchT += dt; s.vx *= 0.9;
      if (s.touchT >= 3) { s.phase = 'escape'; s.escT = 0; SFX.blip(); }
      return null;
    }
    s.vx += s.side * sideA * dt;
    s.vy += (-s.g + (s.thrust ? thrustA : 0)) * dt;
    s.x = clamp(s.x + s.vx * dt, 4, 196); s.y += s.vy * dt;
    if (s.phase === 'escape') {
      s.escT += dt;
      if (s.y > gy + 15) return this.finish({ ok: true, gentle: s.gentle });
      if (s.escT > 7) return this.finish({ ok: false, why: 'tipped' });
      if (s.y < gy + 1) { s.y = gy + 1; s.vy = Math.max(0, s.vy); }
      return null;
    }
    if (s.y <= gy + 1) {
      const rock = s.boulders.find(b => Math.abs(b.x - s.x) < b.r + 3);
      if (rock || -s.vy > s.vyLim * 1.5 || Math.abs(s.vx) > s.vxLim * 1.5) return this.finish({ ok: false, why: rock ? 'boulder' : 'hard' });
      s.gentle = clamp(1 - (-s.vy) / (s.vyLim * 1.5), 0, 1);
      s.phase = 'touch'; s.touchT = 0; s.y = gy + 1; s.vy = 0; SFX.place();
    }
    if (s.y > 95 || s.t > 75) return this.finish({ ok: false, why: 'drift' });
    return null;
  },
  finish(r) { r.ok = r.ok !== false; r.score = r.score != null ? r.score : r.ok ? clamp(Math.round(60 + 40 * (r.gentle == null ? .7 : r.gentle)), 60, 100) : 0; return r; },
  draw(ctx, s, w, h) {
    ctx.fillStyle = '#05071c'; ctx.fillRect(0, 0, w, h); drawStarfield(ctx, s.stars, w, h, 0);
    const sx = w / 200, sy = h / 100;
    drawTerrain(ctx, s, w, h, sx, sy);
    ctx.fillStyle = '#4a3f38'; ctx.strokeStyle = '#8a7a6c';
    for (const b of s.boulders) { const gy = groundAt(s.ground, b.x); ctx.beginPath(); ctx.arc(b.x * sx, h - gy * sy, b.r * sx, Math.PI, 0); ctx.fill(); ctx.stroke(); }
    const lx = s.x * sx, ly = h - (s.y + 6) * sy;
    drawLander(ctx, lx, ly, 1.1, s.thrust, s.side);
    if (s.phase === 'touch') {
      ctx.strokeStyle = '#5ee6c8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(lx, ly - 4, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.touchT / 3); ctx.stroke();
      label(ctx, 'Collecting… hold still', w / 2, 30, '#5ee6c8', 17);
    }
    if (s.phase === 'escape') label(ctx, 'BACK AWAY! ▲', w / 2, 30, '#ffd166', 20);
    if (s.phase === 'descend') label(ctx, `↓ ${Math.max(0, -s.vy).toFixed(1)} m/s (safe below ${(s.vyLim * 1.5).toFixed(1)})`, 14, 22, -s.vy <= s.vyLim * 1.5 ? '#5ee6c8' : '#ff8fab', 14, 'left');
    vbar(ctx, w - 26, 16, 12, 90, s.fuel / s.fuel0, '#ffd166');
  },
  hud(s) { return `${{ descend: 'Drift down gently', touch: 'Sampling…', escape: 'Back away now!' }[s.phase]} · Fuel <b>${Math.round(s.fuel / s.fuel0 * 100)}%</b>`; },
  verdict(r) {
    return r.ok ? { good: r.score >= 80 ? 'good' : 'ok', title: 'Sample grabbed!', text: 'Touch, grab, back away. The sample is in the canister.' }
      : { good: 'bad', title: 'No sample', text: { boulder: 'The arm hit a boulder.', hard: 'You touched down too hard and bounced off.', tipped: 'You stayed too long and the spacecraft tipped.', drift: 'You drifted away from the surface.' }[r.why] || 'The arm came up empty.' };
  }
};

GAMES.reentry = {
  title: 'Reentry', icon: '🔥', role: 'lead',
  how: 'Keep the capsule inside the green corridor with ▲ ▼. Too low and it burns up, too high and it skips back into space. Then press DEPLOY when the speed needle is in the green to open the parachute.',
  keys: [{ k: 'up', l: '▲' }, { k: 'down', l: '▼' }, { k: 'space', l: '🪂 Deploy' }],
  init(o, w, h) {
    return { o, t: 0, dur: 15, y: 0, vy: 0, heat: 0, skip: 0, inBand: 0, phase: 'corridor', speed: 420, chute: null, after: 0, stars: makeStars(40, w, h),
      bw: 0.3 * Math.sqrt(o.tol || 1), lo: 190 - 45 * (o.tol || 1), hi: 190 + 45 * (o.tol || 1) };
  },
  centre(t) { return Math.sin(t * 0.55) * 0.45 + Math.sin(t * 1.3) * 0.15; },
  step(s, dt) {
    const o = s.o;
    s.t += dt;
    if (s.phase === 'corridor') {
      const ag = (o.agility || 1) * (1 - 0.3 * (o.heavy || 0));
      s.vy += (((K.up ? 1 : 0) - (K.down ? 1 : 0)) * 2.4 * ag - 0.25 + rnd(-.6, .6)) * dt;
      s.vy *= (1 - dt * 1.2); s.y = clamp(s.y + s.vy * dt, -1.5, 1.5);
      const off = s.y - this.centre(s.t);
      if (off > s.bw) s.skip += dt * (off - s.bw) * 1.3;
      else if (off < -s.bw) s.heat += dt * (-off - s.bw) * 1.5;
      else { s.inBand += dt; s.heat = Math.max(0, s.heat - dt * 0.05); s.skip = Math.max(0, s.skip - dt * 0.05); }
      if (s.heat >= 1) return this.finish({ ok: false, why: 'burn', acc: s.inBand / s.t });
      if (s.skip >= 1) return this.finish({ ok: false, why: 'skip', acc: s.inBand / s.t });
      if (s.t >= s.dur) { s.phase = 'chute'; s.acc = s.inBand / s.t; K.spaceHit = false; SFX.stage(); }
      return null;
    }
    if (s.phase === 'chute') {
      s.speed = Math.max(0, s.speed - 85 * dt);
      if (K.spaceHit) {
        K.spaceHit = false;
        s.chute = s.speed > s.hi ? 'early' : s.speed >= s.lo ? 'good' : 'late';
        s.phase = 'float'; s.after = 0; SFX.place();
      } else if (s.speed <= 0) return this.finish({ ok: false, why: 'nochute', acc: s.acc });
      return null;
    }
    s.after += dt;
    if (s.after > 1.4) return this.finish({ ok: true, chute: s.chute, acc: s.acc });
    return null;
  },
  finish(r) {
    r.acc = clamp(r.acc == null ? 0.8 : r.acc, 0, 1);
    if (r.ok == null) r.ok = true;
    r.score = r.score != null ? r.score : r.ok ? clamp(Math.round(r.acc * 70 + ({ good: 30, early: 5, late: 0 }[r.chute || 'good'])), 20, 100) : 0;
    return r;
  },
  draw(ctx, s, w, h) {
    if (s.phase === 'corridor') {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#120a2e'); g.addColorStop(1, '#5a1e1e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); drawStarfield(ctx, s.stars, w, h * 0.4, 0);
      const Y = y => h / 2 - y * h * 0.3;
      ctx.fillStyle = 'rgba(6,214,160,.22)'; ctx.strokeStyle = 'rgba(6,214,160,.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) { const tt = s.t + (x - w * 0.3) / w * 3; ctx.lineTo(x, Y(this.centre(tt) + s.bw)); }
      for (let x = w; x >= 0; x -= 8) { const tt = s.t + (x - w * 0.3) / w * 3; ctx.lineTo(x, Y(this.centre(tt) - s.bw)); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      label(ctx, '↑ skip out into space', w - 10, 18, '#9ec0ff', 12, 'right');
      label(ctx, '↓ burn up', w - 10, h - 16, '#ff8fab', 12, 'right');
      const cx = w * 0.3, cy = Y(s.y), glow = 10 + s.heat * 30 + Math.max(0, -s.y) * 10;
      const pg = ctx.createRadialGradient(cx - 6, cy, 2, cx - 6, cy, glow + 18); pg.addColorStop(0, 'rgba(255,200,90,.9)'); pg.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx - 6, cy, glow + 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9dcf2'; ctx.beginPath(); ctx.moveTo(cx - 12, cy - 12); ctx.lineTo(cx + 14, cy - 6); ctx.lineTo(cx + 14, cy + 6); ctx.lineTo(cx - 12, cy + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a4b2a'; ctx.fillRect(cx - 15, cy - 12, 4, 24);
      hbar(ctx, 16, 12, 110, 8, s.heat, '#ff6b6b', [{ a: 0, b: 1, c: 'rgba(255,107,107,.25)' }]); label(ctx, 'Heat', 16, 30, '#ff8fab', 11, 'left');
      hbar(ctx, 140, 12, 110, 8, s.skip, '#9ec0ff', [{ a: 0, b: 1, c: 'rgba(158,192,255,.25)' }]); label(ctx, 'Skip', 140, 30, '#9ec0ff', 11, 'left');
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2d6fc4'); g.addColorStop(1, '#a9d6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f7da8'; ctx.fillRect(0, h * 0.85, w, h * 0.15);
    const cy = s.phase === 'float' ? h * 0.35 + s.after * 30 : h * 0.4, cx = w / 2;
    if (s.phase === 'float') {
      ctx.fillStyle = s.chute === 'early' ? '#ffb347' : '#ff6b6b';
      ctx.beginPath(); ctx.arc(cx, cy - 50, 34, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 34, cy - 50); ctx.lineTo(cx, cy - 8); ctx.lineTo(cx + 34, cy - 50); ctx.stroke();
    }
    ctx.fillStyle = '#d9dcf2'; ctx.beginPath(); ctx.moveTo(cx - 12, cy - 8); ctx.lineTo(cx + 12, cy - 8); ctx.lineTo(cx + 16, cy + 10); ctx.lineTo(cx - 16, cy + 10); ctx.closePath(); ctx.fill();
    const map = v => v / 420;
    hbar(ctx, 24, h - 40, w - 48, 14, map(s.speed), '#fff', [{ a: map(s.lo), b: map(s.hi), c: 'rgba(6,214,160,.85)' }]);
    label(ctx, `Speed ${Math.round(s.speed)} m/s`, 24, h - 52, '#0b1030', 13, 'left');
    if (s.phase === 'chute') label(ctx, 'Press DEPLOY in the green!', w / 2, 30, '#0b1030', 18);
    if (s.phase === 'float') label(ctx, { good: 'Perfect timing!', early: 'Too fast: backup chute!', late: 'A bit late: hard splash' }[s.chute], w / 2, 30, '#0b1030', 18);
  },
  hud(s) { return s.phase === 'corridor' ? `In the corridor <b>${Math.round(s.inBand / Math.max(.01, s.t) * 100)}%</b> · Heat <b>${Math.round(s.heat * 100)}%</b> · Skip <b>${Math.round(s.skip * 100)}%</b>` : `Speed <b>${Math.round(s.speed)} m/s</b> · Deploy between ${Math.round(s.lo)} and ${Math.round(s.hi)}`; },
  verdict(r) {
    if (!r.ok) return { good: 'bad', title: { burn: 'Burned up', skip: 'Skipped out', nochute: 'No parachute' }[r.why] || 'Lost',
      text: { burn: 'The capsule came in too steep and the heat shield failed.', skip: 'The capsule came in too shallow and bounced back into space.', nochute: 'The parachute never opened.' }[r.why] || '' };
    return { good: r.chute === 'good' && r.acc > 0.7 ? 'good' : 'ok', title: 'Splashdown!',
      text: `You held the corridor ${fmtPct(r.acc)} of the time. ${{ good: 'The parachute opened at just the right speed.', early: 'The main chute tore, but the backup held.', late: 'The chute opened late, but the capsule survived.' }[r.chute || 'good']}` };
  }
};

// Not an arcade game: titles for the report's piloting list.
GAMES.crisis = { title: 'Power emergency', icon: '⚡' };

// ---------- running a game ----------
function startGame(kind, opts, onDone) {
  resetKeys();
  S.game = { kind, opts: opts || {}, onDone, state: null, phase: 'intro', result: null };
  go('game');
}
function gameBegin() {
  if (!S.game) return;
  S.game.phase = 'countdown'; S.game.count = 3; S.game.state = null;
  resetKeys();
  rerender();
}
function gameEnd(result) {
  const g = S.game;
  if (!g) return;
  g.result = GAMES[g.kind].finish(Object.assign({}, result));
  g.phase = 'done';
  stopAnim(); resetKeys(); SFX.rumbleStop();
  if (g.result.ok && g.result.score >= 70) { SFX.win(); FX.confetti(); } else if (!g.result.ok) SFX.lose();
  rerender();
}
function designEffects(o, kind) {
  const out = [];
  if (o.heavy > 0.2 && ['launch', 'dodge', 'insertion', 'reentry'].includes(kind)) out.push('🐘 Heavy spacecraft: slower to respond');
  if (o.agility > 1) out.push('🎯 Precision pointing: quicker steering');
  if (o.agility < 1) out.push('🌀 No pointing system: sloppy steering');
  if (kind === 'dodge' && o.span > 1.6) out.push('🔆 Big solar wings: a bigger target');
  if (kind === 'dodge') out.push(o.shield ? `🛡️ Debris shield: soaks up ${plural(o.shield, 'hit')}` : '⚠️ No debris shield: every hit breaks a part');
  if (kind === 'launch' && o.assist) out.push('🤖 Auto-throttle through Max-Q (Beginner)');
  if (o.tol > 1.2) out.push('🟢 Wide safe zones on this difficulty');
  if (o.tol < 1) out.push('🔴 Tight safe zones on this difficulty');
  if (kind === 'landing' || kind === 'tag') out.push(`🌍 Gravity: ${o.gravity} m/s²`);
  return out;
}

const SCREENS_GAME = {
  html() {
    const g = S.game;
    if (!g) return '<div class="card game-card"><p>No flight in progress.</p></div>';
    const G = GAMES[g.kind];
    const head = `<div class="eyebrow">Mission ${S.mission.num} · ${esc(S.mission.name)} · ${esc(ROLES[G.role].name)}</div><h2>${G.icon} ${G.title}</h2>`;
    if (g.phase === 'intro') {
      const fx = designEffects(g.opts, g.kind);
      return `<div class="card game-card">${head}<p>${G.how}</p>
        <div class="keys">${G.keys.map(k => `<span class="pill">${k.l}</span>`).join(' ')} <span class="small muted">Keyboard: arrow keys or WASD${G.keys.some(k => k.k === 'space') ? ', and Space' : ''}.</span></div>
        ${fx.length ? `<div class="effects"><b>Your design changes this flight:</b><ul>${fx.map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
        <button class="btn primary big" data-act="gameGo">Start ▶</button></div>`;
    }
    if (g.phase === 'done') {
      const v = G.verdict(g.result), canRetry = g.result.score < 70 && S.retriesLeft > 0 && g.opts.retry;
      return `<div class="card game-card">${head}<div class="verdict ${v.good}"><div class="stamp-slot"></div><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p><p class="mono">Score ${g.result.score}/100</p>
        <p class="small muted">Ollie: “${quip(v.good)}”</p>${g.opts.lesson ? `<p class="small lesson">💡 ${esc(g.opts.lesson(g.result))}</p>` : ''}</div>
        <div class="row gap wrap">${canRetry ? `<button class="btn ghost" data-act="gameRetry">↻ Retry (${S.retriesLeft} left)</button>` : ''}
        <button class="btn primary" data-act="gameDone">Continue →</button></div></div>`;
    }
    return `<div class="game-wrap">${head}<div class="ghud" id="ghud"></div>
      <div class="gcanvas"><canvas id="gcv" aria-label="${esc(G.title)} game"></canvas></div>
      <div class="touch">${G.keys.map(k => `<button class="tbtn${k.k === 'space' ? ' wide' : ''}" data-key="${k.k}" aria-label="${esc(k.l)}">${k.l}</button>`).join('')}</div></div>`;
  },
  after() {
    const g = S.game;
    if (!g || (g.phase !== 'countdown' && g.phase !== 'play')) return;
    const cv = document.getElementById('gcv'), wrap = cv.parentElement;
    const w = Math.floor(wrap.clientWidth), h = Math.floor(w < 600 ? clamp(innerHeight - 330, 300, w * 1.3) : clamp(w * 0.58, 320, innerHeight - 260));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const G = GAMES[g.kind];
    if (!g.state) g.state = G.init(g.opts, w, h);
    const hud = document.getElementById('ghud');
    let last = performance.now(), lastHud = '';
    if (g.kind === 'launch') SFX.rumbleStart();
    const frame = now => {
      if (S.game !== g || (g.phase !== 'countdown' && g.phase !== 'play')) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (g.phase === 'countdown') {
        const before = Math.ceil(g.count);
        g.count -= dt;
        if (Math.ceil(g.count) !== before && g.count > 0) SFX.blip();
        G.draw(ctx, g.state, w, h);
        ctx.fillStyle = 'rgba(5,8,25,.45)'; ctx.fillRect(0, 0, w, h);
        label(ctx, g.count > 0 ? String(Math.ceil(g.count)) : 'GO!', w / 2, h / 2, '#ffd166', 64);
        if (g.count <= -0.3) { g.phase = 'play'; K.spaceHit = false; SFX.stage(); }
      } else {
        const res = G.step(g.state, dt);
        K.spaceHit = false;
        G.draw(ctx, g.state, w, h);
        if (typeof NET !== 'undefined' && NET.sendLive) NET.sendLive(g.kind, g.state, w, h);
        if (res) { gameEnd(res); return; }
      }
      const t = G.hud(g.state);
      if (t !== lastHud) { hud.innerHTML = t; lastHud = t; }
      S.anim = requestAnimationFrame(frame);
    };
    S.anim = requestAnimationFrame(frame);
  }
};

// ---------- science scan (a modal with three sweeps) ----------
const SCAN_MULT = [0.85, 1, 1.15, 1.3];
let SCAN = { on: false };
function runScan(opts, done) {
  const zone = clamp(0.16 * (opts.tol || 1) * (opts.precise ? 1.35 : 1), 0.08, 0.34);
  SCAN = { on: true, done, zone, sweep: 0, hits: 0, p: 0, dir: 1, travel: 0, start: rnd(0.08, 0.92 - zone), flash: 0, flashOk: false, finished: false, raf: 0, last: performance.now() };
  showModal(`<div class="scan"><h3>🔭 Science scan</h3>
    <p class="small">Press <b>SCAN</b> (or Space) when the line is in the green zone. Three sweeps. Better aim, better data.${opts.precise ? ' Your precision pointing widens the zone.' : ''}</p>
    <canvas id="scanCv" width="600" height="110" aria-label="Scan bar"></canvas>
    <p class="mono center" id="scanInfo">Sweep 1 of 3</p>
    <div class="row gap end wrap"><button class="btn ghost small" data-act="scanAuto">Auto scan (×1)</button><button class="btn primary big" data-act="scanHit">SCAN</button></div></div>`,
    { locked: true, cls: 'scanbox' });
  const tick = now => {
    if (!SCAN.on) return;
    const dt = Math.min(0.05, (now - SCAN.last) / 1000); SCAN.last = now;
    if (!SCAN.finished) {
      const v = 0.85 * dt;
      SCAN.p += SCAN.dir * v; SCAN.travel += v;
      if (SCAN.p >= 1) { SCAN.p = 1; SCAN.dir = -1; } if (SCAN.p <= 0) { SCAN.p = 0; SCAN.dir = 1; }
      if (SCAN.travel > 2.2) scanResolve(false);   // two full passes with no press: a miss
    }
    SCAN.flash = Math.max(0, SCAN.flash - dt);
    drawScan();
    SCAN.raf = requestAnimationFrame(tick);
  };
  SCAN.raf = requestAnimationFrame(tick);
}
function drawScan() {
  const cv = document.getElementById('scanCv'); if (!cv) return;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  ctx.fillStyle = '#0b1030'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,214,160,.8)'; ctx.fillRect(SCAN.start * w, 20, SCAN.zone * w, h - 40);
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.strokeRect(1, 20, w - 2, h - 40);
  ctx.fillStyle = SCAN.flash > 0 ? (SCAN.flashOk ? '#5ee6c8' : '#ff6b8a') : '#ffd166';
  ctx.fillRect(SCAN.p * w - 3, 8, 6, h - 16);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(w / 2 - 30 + i * 30, h - 7, 5, 0, Math.PI * 2); ctx.fillStyle = i < SCAN.sweep ? (i < SCAN.hits ? '#5ee6c8' : '#555') : 'rgba(255,255,255,.25)'; ctx.fill(); }
}
function scanPress() { if (!SCAN.on || SCAN.finished) return; scanResolve(SCAN.p >= SCAN.start && SCAN.p <= SCAN.start + SCAN.zone); }
function scanResolve(hit) {
  SCAN.sweep++; if (hit) SCAN.hits++;
  SCAN.flash = 0.35; SCAN.flashOk = hit;
  hit ? SFX.blip() : SFX.deny();
  const info = document.getElementById('scanInfo');
  if (SCAN.sweep >= 3) {
    SCAN.finished = true;
    const mult = SCAN_MULT[SCAN.hits];
    if (info) info.textContent = `${SCAN.hits} of 3 on target · data quality ×${mult}`;
    setTimeout(() => scanFinish(mult, SCAN.hits), 700);
    return;
  }
  if (info) info.textContent = (hit ? 'On target! ' : 'Missed. ') + `Sweep ${SCAN.sweep + 1} of 3`;
  SCAN.start = rnd(0.08, 0.92 - SCAN.zone); SCAN.travel = 0;
}
function scanFinish(mult, hits) {
  if (!SCAN.on) return;
  const done = SCAN.done;
  cancelAnimationFrame(SCAN.raf);
  SCAN = { on: false };
  closeModal();
  done(mult, hits);
}
