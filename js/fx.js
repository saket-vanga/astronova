/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Visual effects and drawn characters: the starfield, confetti, part styles, SVG crew portraits,
   planets with faces, and Ollie's quips. Everything is drawn in code; there are no image files. */
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- background starfield and confetti ----------
const FX = (() => {
  let bg, bctx, stars = [], shoot = null, nextShoot = 4, fx, fctx, bits = [], fxRaf = 0, last = 0, W = 0, H = 0;
  function size() {
    if (!bg) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    for (const c of [bg, fx]) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(220, W * H / 7000));
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.3, tw: Math.random() * Math.PI * 2,
      sp: 0.5 + Math.random() * 1.5, z: Math.random(), hue: Math.random() < 0.15 ? '#ffd9a8' : Math.random() < 0.15 ? '#bcd7ff' : '#ffffff' }));
    if (reduceMotion) drawStars(0, 0);
  }
  function drawStars(t, dt) {
    bctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.y += dt * (2 + s.z * 6); if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
      bctx.globalAlpha = reduceMotion ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.tw));
      bctx.fillStyle = s.hue;
      bctx.beginPath(); bctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); bctx.fill();
    }
    bctx.globalAlpha = 1;
    if (reduceMotion) return;
    nextShoot -= dt;
    if (!shoot && nextShoot <= 0) { shoot = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.4, life: 0 }; nextShoot = 5 + Math.random() * 8; }
    if (shoot) {
      shoot.life += dt;
      const p = shoot.life / 0.9, x = shoot.x + p * 260, y = shoot.y + p * 110;
      const g = bctx.createLinearGradient(x - 80, y - 34, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)');
      bctx.strokeStyle = g; bctx.lineWidth = 2; bctx.beginPath(); bctx.moveTo(x - 80, y - 34); bctx.lineTo(x, y); bctx.stroke();
      if (p >= 1) shoot = null;
    }
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    drawStars(now / 1000, dt);
    if (bits.length) drawConfetti(dt);
    requestAnimationFrame(loop);
  }
  function drawConfetti(dt) {
    fctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 420 * dt; b.vx *= 0.99; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; b.life -= dt;
      fctx.save(); fctx.translate(b.x, b.y); fctx.rotate(b.a); fctx.globalAlpha = Math.min(1, b.life * 2);
      fctx.fillStyle = b.c;
      if (b.round) { fctx.beginPath(); fctx.arc(0, 0, b.s / 2, 0, Math.PI * 2); fctx.fill(); } else fctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      fctx.restore();
    }
    bits = bits.filter(b => b.life > 0 && b.y < H + 40);
    if (!bits.length) fctx.clearRect(0, 0, W, H);
  }
  return {
    start() {
      bg = document.getElementById('bgSpace'); fx = document.getElementById('fxLayer');
      if (!bg || !fx) return;
      bctx = bg.getContext('2d'); fctx = fx.getContext('2d');
      size(); addEventListener('resize', size);
      if (!reduceMotion) requestAnimationFrame(loop);
    },
    confetti(n) {
      if (reduceMotion || !fctx) return;
      const cols = ['#ffd166', '#ff6b9d', '#5ee6c8', '#7cc4ff', '#a78bfa', '#ff9f5a'];
      for (let i = 0; i < (n || 120); i++) {
        const left = i % 2 === 0;
        bits.push({ x: left ? -10 : W + 10, y: H * 0.65, vx: (left ? 1 : -1) * (250 + Math.random() * 450), vy: -(350 + Math.random() * 500),
          a: Math.random() * 6, va: (Math.random() - 0.5) * 14, s: 6 + Math.random() * 7, c: cols[i % cols.length], round: Math.random() < 0.3, life: 2.2 + Math.random() });
      }
    }
  };
})();

// ---------- part styles ----------
const CAT_STYLE = {
  'Science':          { color: '#5ee6c8', icon: '🔬' },
  'Power':            { color: '#ffd166', icon: '⚡' },
  'Comms':            { color: '#7cc4ff', icon: '📡' },
  'Avionics':         { color: '#a78bfa', icon: '🧠' },
  'Propulsion':       { color: '#ff9f5a', icon: '🔥' },
  'Landing & return': { color: '#ff8fb8', icon: '🪂' }
};
const PART_ICON = {
  chem: '🔥', chemHi: '🔥', ion: '💠', capsule: '🪂', lander: '🛬', sampler: '🦾',
  solarS: '🔆', solarL: '🔆', solarX: '🔆', rtg: '☢️', batS: '🔋', batL: '🔋', fuelcell: '🧪',
  lga: '📶', mga: '📡', hga: '📡', ka: '📡', compStd: '💻', compRad: '💻', adcsBasic: '🎯', adcsPrecise: '🎯',
  rec32: '💾', rec256: '💾', rec2t: '💾', shield: '🛡️',
  wac: '📷', hirc: '🔭', irs: '🌈', mag: '🧲', sig: '📻', radar: '〰️', mspec: '👃'
};

// ---------- drawn faces ----------
const INK = '#0d1238';
function eyesSvg(x1, x2, y, r, look) {
  const lx = (look || 0) * r * 0.3;
  return [x1, x2].map(x => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.1}" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
    <circle cx="${x + lx}" cy="${y + r * 0.15}" r="${r * 0.55}" fill="${INK}"/><circle cx="${x + lx - r * 0.2}" cy="${y - r * 0.15}" r="${r * 0.2}" fill="#fff"/>`).join('');
}
function mouthSvg(cx, cy, w, mood) {
  if (mood === 'sad') return `<path d="M${cx - w} ${cy + w * 0.5} Q${cx} ${cy - w * 0.4} ${cx + w} ${cy + w * 0.5}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  if (mood === 'wow') return `<ellipse cx="${cx}" cy="${cy + 1}" rx="${w * 0.45}" ry="${w * 0.6}" fill="${INK}"/>`;
  if (mood === 'meh') return `<path d="M${cx - w * 0.7} ${cy + 1} L${cx + w * 0.7} ${cy + 1}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  return `<path d="M${cx - w} ${cy - w * 0.2} Q${cx} ${cy + w * 0.9} ${cx + w} ${cy - w * 0.2} Z" fill="${INK}"/><path d="M${cx - w * 0.5} ${cy + w * 0.35} Q${cx} ${cy + w * 0.75} ${cx + w * 0.5} ${cy + w * 0.35}" fill="#ff6b8a"/>`;
}

// Crew portraits: three cartoon characters (not based on real people).
const CREW_LOOK = {
  vega:  { skin: '#c68642', hair: '#2b1b17', shirt: '#ff6b9d', style: 'bun' },
  hale:  { skin: '#7a4a2a', hair: '#1a1110', shirt: '#5ee6c8', style: 'curls' },
  ollie: { skin: '#f1c27d', hair: '#e8742c', shirt: '#ffd166', style: 'messy' }
};
function crewSvg(who) {
  const L = CREW_LOOK[who];
  const hair = {
    bun: `<circle cx="32" cy="9" r="7" fill="${L.hair}"/><path d="M14 30 Q14 11 32 11 Q50 11 50 30 Q46 19 32 18 Q18 19 14 30Z" fill="${L.hair}"/>`,
    curls: [[16, 22], [21, 14], [29, 10], [37, 10], [44, 14], [48, 22], [14, 30], [50, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${L.hair}"/>`).join(''),
    messy: `<path d="M14 28 L16 14 L22 18 L25 8 L31 15 L36 7 L40 15 L47 10 L47 19 L51 22 L49 30 Q44 19 32 19 Q20 19 14 28Z" fill="${L.hair}"/>`
  }[L.style];
  const extra = {
    vega: `<path d="M13 30 Q13 14 32 13 Q51 14 51 30" fill="none" stroke="#3a3f6b" stroke-width="2.5"/><rect x="9" y="27" width="6" height="9" rx="3" fill="#3a3f6b"/><path d="M12 36 Q14 44 23 44" fill="none" stroke="#3a3f6b" stroke-width="2"/><circle cx="24" cy="44" r="2" fill="#3a3f6b"/>`,
    hale: `<circle cx="25" cy="31" r="6" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="39" cy="31" r="6" fill="none" stroke="${INK}" stroke-width="2"/><path d="M31 31 L33 31" stroke="${INK}" stroke-width="2"/>`,
    ollie: `<g fill="#c9733f" opacity=".7"><circle cx="21" cy="37" r="1"/><circle cx="24" cy="39" r="1"/><circle cx="40" cy="39" r="1"/><circle cx="43" cy="37" r="1"/></g>`
  }[who];
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
    <path d="M10 64 Q12 48 32 47 Q52 48 54 64Z" fill="${L.shirt}" stroke="${INK}" stroke-width="2"/>
    <rect x="27" y="42" width="10" height="7" fill="${L.skin}"/>
    <ellipse cx="32" cy="31" rx="17" ry="17.5" fill="${L.skin}" stroke="${INK}" stroke-width="2"/>
    ${hair}${eyesSvg(25, 39, 31, 4.2, who === 'ollie' ? 0.6 : 0)}
    <circle cx="20" cy="38" r="3" fill="#ff8fa3" opacity=".55"/><circle cx="44" cy="38" r="3" fill="#ff8fa3" opacity=".55"/>
    ${who === 'ollie' ? mouthSvg(33, 40, 5.5, 'happy') : who === 'hale' ? `<path d="M27 40 Q32 44 37 40" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` : `<path d="M27 40 Q32 43 37 40" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`}
    ${extra}</svg>`;
}

// Planets with faces.
const PLANET_LOOK = {
  earth:    { a: '#6fb3ff', b: '#1d4fa8' },
  moon:     { a: '#e6e8f2', b: '#8a90a8' },
  asteroid: { a: '#a08770', b: '#4d3d31' },
  mars:     { a: '#ff9a6b', b: '#a8402a' },
  ceruvia:  { a: '#e9fbff', b: '#6fb9d6' }
};
function planetSvg(p, mood, extraCls) {
  const L = PLANET_LOOK[p] || PLANET_LOOK.moon, id = 'pg' + p + Math.random().toString(36).slice(2, 6);
  const body = p === 'asteroid'
    ? `<path d="M14 46 Q10 24 30 14 Q48 6 66 12 Q88 18 90 42 Q94 66 76 82 Q56 94 34 86 Q12 76 14 46Z" fill="url(#${id})" stroke="${INK}" stroke-width="3"/>`
    : `<circle cx="50" cy="50" r="42" fill="url(#${id})" stroke="${INK}" stroke-width="3"/>`;
  const feat = {
    earth: `<path d="M22 38 Q30 26 42 32 Q46 42 36 46 Q26 48 22 38Z M58 58 Q68 50 78 58 Q80 70 68 74 Q58 72 58 58Z M60 22 Q70 20 74 28 Q66 32 60 22Z" fill="#5fd38a" stroke="${INK}" stroke-width="1.5"/>
      <path d="M18 62 Q34 58 44 64" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`,
    moon: `<g fill="#9aa0b8" stroke="${INK}" stroke-width="1.2" opacity=".75"><circle cx="30" cy="30" r="7"/><circle cx="70" cy="66" r="9"/><circle cx="72" cy="30" r="4"/><circle cx="26" cy="68" r="4"/></g>`,
    asteroid: `<g fill="#6e5a4a" stroke="${INK}" stroke-width="1.2" opacity=".8"><circle cx="32" cy="28" r="5"/><circle cx="72" cy="70" r="7"/><circle cx="74" cy="30" r="3"/></g>`,
    mars: `<path d="M34 10 Q50 6 66 10 Q58 16 50 15 Q40 16 34 10Z" fill="#fff" stroke="${INK}" stroke-width="1.5"/><g fill="#8f3524" opacity=".55"><ellipse cx="28" cy="64" rx="10" ry="5"/><ellipse cx="72" cy="30" rx="7" ry="4"/></g>`,
    ceruvia: `<g fill="none" stroke="#3d8fb5" stroke-width="2" stroke-linecap="round" opacity=".8"><path d="M16 36 Q30 30 38 22"/><path d="M62 82 Q70 70 86 64"/><path d="M20 70 Q26 62 22 54"/></g>
      <path d="M48 92 Q50 84 52 92" fill="#e9fbff" opacity=".9"/>`
  }[p] || '';
  return `<svg class="planet-svg ${extraCls || ''}" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${L.a}"/><stop offset="1" stop-color="${L.b}"/></radialGradient></defs>
    ${body}${feat}${eyesSvg(38, 62, 46, 6.5, 0)}
    <circle cx="28" cy="56" r="4.5" fill="#ff8fa3" opacity=".5"/><circle cx="72" cy="56" r="4.5" fill="#ff8fa3" opacity=".5"/>
    ${mouthSvg(50, 60, 7, mood || 'happy')}</svg>`;
}

const FACES = {
  planet: { earth: '🌍', moon: '🌕', asteroid: '🪨', mars: '🔴', ceruvia: '🧊' },
  crew: { vega: crewSvg('vega'), hale: crewSvg('hale'), ollie: crewSvg('ollie') }
};

// ---------- Ollie's quips ----------
const QUIPS = {
  good: ['Textbook!', 'Smooth as a fresh battery.', 'I barely had to cover my eyes.', 'That is going in the training videos.', 'Mission Control is doing a little dance.', 'Ollie is wearing the lucky poppy pants today. It shows.'],
  ok: ['Not pretty, but it counts.', 'We will call that "character building".', 'Close enough for space.', 'Still counts. Team Poppy Pants does not judge.', 'Nobody saw that wobble. Probably.'],
  bad: ['Ouch. Every expert has a crash or two.', 'Well, now we know what not to do.', 'The spacecraft forgives you. Mostly.', 'Let us never speak of this again.']
};
function quip(kind) { const a = QUIPS[kind] || QUIPS.ok; return a[Math.floor(Math.random() * a.length)]; }
