/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* The fun layer: music switching, rank stamps, badges and hats, discovery cards and the collection,
   spacecraft moods and quips, and versus challenge links.
   Everything here is added by WRAPPING earlier functions (save the original as fun_*, reassign, call through),
   so the core game in game.js / builder.js / minigames.js never depends on this file. */

const funGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const funSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

// ---------- music: calm in menus and the hangar, action while flying ----------
const ACTION_SCREENS = ['game', 'watch', 'transit', 'explore', 'crisis'];
const fun_render = render;
render = function (...a) {
  const r = fun_render.apply(this, a);
  SFX.music(ACTION_SCREENS.includes(S.screen) ? 'action' : 'calm');
  return r;
};
const fun_renderTopbar = renderTopbar;
renderTopbar = function (...a) {
  const r = fun_renderTopbar.apply(this, a);
  const mute = document.querySelector('#topbar [data-act="toggleMute"]');
  if (mute) mute.insertAdjacentHTML('beforebegin', `<button class="iconbtn${SFX.musicOn ? '' : ' off'}" data-act="toggleMusic" aria-label="${SFX.musicOn ? 'Turn music off' : 'Turn music on'}" title="Music">♪</button>`);
  return r;
};
ACT.toggleMusic = () => { SFX.unlock(); SFX.toggleMusic(); SFX.music(ACTION_SCREENS.includes(S.screen) ? 'action' : 'calm'); renderTopbar(); };

// ---------- rank stamps ----------
const RANKS = [['S', 90, 'Superstar!'], ['A', 75, 'Ace'], ['B', 55, 'Solid'], ['C', 35, 'Shaky'], ['D', 0, 'Oof']];
function rankOf(kind, res) {
  if (!res) return RANKS[4];
  if (res.ok === false) return RANKS[4];
  if (kind === 'landing' && res.outcome === 'off') return RANKS[2];
  return RANKS.find(r => res.score >= r[1]);
}
const fun_gameHtml = SCREENS.game.html;
SCREENS.game.html = function (...a) {
  let h = fun_gameHtml.apply(this, a);
  const g = S.game;
  if (g && g.phase === 'done' && g.result) {
    const [L, , word] = rankOf(g.kind, g.result);
    h = h.replace('<div class="stamp-slot"></div>', `<div class="stamp rank-${L}" aria-label="Rank ${L}: ${word}"><b>${L}</b><span>${word}</span></div>`);
  }
  return h;
};

// ---------- badges and hats ----------
const BADGES = [
  { id: 'liftoff', icon: '🚀', name: 'Liftoff', desc: 'Fly your first launch.' },
  { id: 'online', icon: '🎯', name: 'On the Line', desc: 'Get an S rank on a launch.' },
  { id: 'untouch', icon: '✨', name: 'Untouchable', desc: 'Cross a debris field without a single hit.' },
  { id: 'bullseye', icon: '🎯', name: 'Bullseye', desc: 'Brake into orbit almost exactly on the line.' },
  { id: 'pinpoint', icon: '🛬', name: 'Pinpoint', desc: 'Land right on the pad.' },
  { id: 'grabber', icon: '🦾', name: 'Pebble Grabber', desc: 'Grab a sample with a touch-and-go.' },
  { id: 'splash', icon: '🪂', name: 'Splashdown', desc: 'Bring a capsule home safely.' },
  { id: 'storm', icon: '🌪️', name: 'Storm Chaser', desc: 'Survive a power emergency without losing data.' },
  { id: 'triple', icon: '⭐', name: 'Triple Star', desc: 'Earn all three stars on a mission.' },
  { id: 'signal', icon: '🧊', name: 'Last Signal', desc: 'Earn a star at Ceruvia.' },
  { id: 'thrifty', icon: '💰', name: 'Thrifty', desc: 'Earn a star with at least 30% of the budget left.' },
  { id: 'bytes', icon: '📡', name: 'Every Byte', desc: 'Get all your data home on a mission with 3 or more discoveries.' },
  { id: 'sharp', icon: '🔭', name: 'Sharp Eye', desc: 'Hit all three sweeps of a science scan.' },
  { id: 'epic', icon: '💎', name: 'Epic Find', desc: 'Make an epic discovery (35 points or more).' },
  { id: 'collector', icon: '📚', name: 'Collector', desc: 'Collect 20 different discoveries.' },
  { id: 'artist', icon: '🎨', name: 'Patch Artist', desc: 'Draw a mission patch.' },
  { id: 'trade', icon: '⚖️', name: 'Trade Study', desc: 'Save two designs to compare.' },
  { id: 'director', icon: '🎖️', name: 'Flight Director', desc: 'Earn a star on Flight Director difficulty.' }
];
const HATS = [
  { at: 0, icon: '🌺', name: 'Poppy (the team hat)' }, { at: 1, icon: '🧢', name: 'Cap' }, { at: 2, icon: '🎩', name: 'Top hat' }, { at: 4, icon: '👒', name: 'Sun hat' }, { at: 6, icon: '🎓', name: 'Graduate' },
  { at: 9, icon: '⛑️', name: 'Rescue helmet' }, { at: 12, icon: '🤠', name: 'Space cowboy' }, { at: 15, icon: '🎉', name: 'Party' }, { at: 18, icon: '👑', name: 'Crown' }
];
let funBadges = funGet('ceruvia-badges', []);
if (!Array.isArray(funBadges)) funBadges = [];
let funRunBadges = [];
const badgeQueue = [];
let badgeShowing = false;
function hatsUnlocked() { return HATS.filter(h => funBadges.length >= h.at); }
function award(id) {
  if (funBadges.includes(id)) return;
  const b = BADGES.find(x => x.id === id); if (!b) return;
  const hatsBefore = hatsUnlocked().length;
  funBadges.push(id); funSet('ceruvia-badges', funBadges);
  funRunBadges.push(id);
  const newHat = hatsUnlocked().length > hatsBefore ? hatsUnlocked().slice(-1)[0] : null;
  badgeQueue.push({ b, newHat });
  if (!badgeShowing) nextBadge();
}
function nextBadge() {
  const item = badgeQueue.shift();
  if (!item) { badgeShowing = false; return; }
  badgeShowing = true;
  const { b, newHat } = item;
  const el = document.createElement('div');
  el.className = 'badgePop'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="bp-icon">${b.icon}</div><div><div class="eyebrow">Badge unlocked!</div><b>${b.name}</b><p class="small">${b.desc}</p>
    ${newHat ? `<p class="small hatnote">New hat for your spacecraft: ${newHat.icon} ${newHat.name}! Pick it in the Paint tab.</p>` : ''}</div>`;
  el.addEventListener('click', () => done());
  document.body.appendChild(el);
  SFX.badge(); FX.confetti(70);
  let gone = false;
  const done = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => { el.remove(); nextBadge(); }, 350); };
  setTimeout(done, newHat ? 4200 : 3000);
}

// Hooks that award badges.
const fun_gameEnd = gameEnd;
gameEnd = function (...a) {
  const g = S.game;
  const r = fun_gameEnd.apply(this, a);
  if (g && g.result) {
    const res = g.result, k = g.kind, [L] = rankOf(k, res);
    if (k === 'launch') { award('liftoff'); if (L === 'S') award('online'); }
    if (k === 'dodge' && res.hits === 0) award('untouch');
    if (k === 'insertion' && res.err <= 0.05) award('bullseye');
    if (k === 'landing' && res.outcome === 'pad') award('pinpoint');
    if (k === 'tag' && res.ok) award('grabber');
    if (k === 'reentry' && res.ok) award('splash');
  }
  return r;
};
const fun_startRun = startRun;
startRun = function (...a) { funRunBadges = []; return fun_startRun.apply(this, a); };
const fun_endCrisis = endCrisis;
endCrisis = function (...a) { const r = fun_endCrisis.apply(this, a); if (S.run && S.run.crisisClean) award('storm'); return r; };
const fun_doPass = doPass;
doPass = function (siteId, scanMult, hits, ...rest) { const r = fun_doPass.call(this, siteId, scanMult, hits, ...rest); if (hits === 3) award('sharp'); return r; };
const fun_savePatch = savePatch;
savePatch = function (...a) { const r = fun_savePatch.apply(this, a); if (PATCH.undo.length) award('artist'); return r; };
const fun_tradeSave = tradeSave;
tradeSave = function (...a) { const r = fun_tradeSave.apply(this, a); if (tradeList().length >= 2) award('trade'); return r; };
const fun_finalize = finalize;
finalize = function (...a) {
  const r = fun_finalize.apply(this, a);
  const run = S.run, res = run && run.result, m = S.mission;
  if (res) {
    if (res.stars === 3) award('triple');
    if (m.id === 'm5' && res.stars) award('signal');
    if (res.stars && isFinite(run.c.budget) && (run.c.budgetLeft - run.extraCost) >= run.c.budget * 0.3) award('thrifty');
    if (res.frac >= 0.999 && run.finds.length >= 3) award('bytes');
    if (res.stars && S.difficulty === 'director') award('director');
    if (S.vs && S.vs.m === m.id) { run.vsResult = S.vs; S.vs = null; funSet('ceruvia-vs', null); }
    if (S.screen === 'report') rerender();
  }
  return r;
};

// ---------- discovery cards and the collection ----------
let funDex = funGet('ceruvia-dex', {});
if (!funDex || typeof funDex !== 'object') funDex = {};
function rarity(pts) { return pts >= 35 ? 'epic' : pts >= 20 ? 'rare' : 'common'; }
function worldTotal(m) { return m.sites.reduce((n, s) => n + Object.keys(s.finds).length, 0) + (m.tagFinding ? 1 : 0); }
function dexCount() { return Object.values(funDex).reduce((n, a) => n + a.length, 0); }
popFinds = function (list) {
  const m = S.mission, have = new Set(funDex[m.id] || []);
  const cards = list.map((f, i) => {
    const rar = rarity(f.pts), isNew = !have.has(f.id);
    have.add(f.id);
    const who = f.inst === 'lander' ? '🛬 Lander' : f.inst === 'sampler' ? '🦾 Sample arm' : `${partIcon(f.inst)} ${esc(PARTS[f.inst].short)}`;
    return `<div class="fcard ${rar}" style="--d:${i * 0.25 + 0.2}s"><div class="fc-in">
      <div class="fc-back"><span>?</span></div>
      <div class="fc-front"><div class="row between"><span class="rar">${rar}</span>${isNew ? '<span class="new">NEW</span>' : ''}</div>
        <b>${esc(f.title)}</b><p class="small">${esc(f.why)}</p>
        <div class="row between small"><span>${who}</span><span class="pill">+${Math.round(f.pts * (f.mult || 1))} pts</span></div></div></div></div>`;
  }).join('');
  funDex[m.id] = [...have]; funSet('ceruvia-dex', funDex);
  showModal(`<h3>🔭 New discoveries!</h3><div class="fcards">${cards}</div>
    <p class="small muted center">Collection: ${funDex[m.id].length} of ${worldTotal(m)} discoveries at ${esc(m.target)}</p>
    <div class="row end"><button class="btn primary" data-act="closeModal">Nice!</button></div>`, { wide: true });
  if (!reduceMotion) list.forEach((_, i) => setTimeout(() => SFX.flip(), (i * 0.25 + 0.2) * 1000));
  if (list.some(f => f.pts >= 35)) award('epic');
  if (dexCount() >= 20) award('collector');
};

// ---------- spacecraft: hats, moods and quips ----------
const PART_QUIPS = {
  chem: 'Vroom! Simple and strong.', chemHi: 'Ooh, fancy. Less fuel, more go.', ion: 'Pew pew… very slowly.',
  capsule: 'A ticket home. Heat shield included.', lander: 'Legs! I always wanted legs.', sampler: 'Grabby arm ready. No touching the boulders.',
  solarS: 'Sunbathing time.', solarL: 'Bigger wings, bigger tan.', solarX: 'I can see my house from these wings.', rtg: 'Warm and cosy, day or night.',
  batS: 'A snack for the dark bits.', batL: 'Big battery, big energy.', fuelcell: 'Emergency juice, just in case.',
  lga: 'Can you hear me now? Barely?', mga: 'Medium dish, medium chat.', hga: 'Now we can really talk.', ka: 'Fastest mouth in the solar system.',
  compStd: 'Beep boop. Thinking…', compRad: 'Radiation? Never heard of her.', adcsBasic: 'I can point at things now!', adcsPrecise: 'Pointing like a pro.',
  rec32: 'A tiny notebook.', rec256: 'Plenty of pages.', rec2t: 'I will remember EVERYTHING.', shield: 'Bring it on, space rocks.',
  wac: 'Say cheese!', hirc: 'Zoom… enhance!', irs: 'I can see heat. Spooky.', mag: 'Feeling very attractive today.',
  sig: 'Listening… is that the signal?', radar: 'I can see through the ground!', mspec: 'Sniff sniff. Smells like science.'
};
function shipMood() {
  if (!S.mission || !S.build) return 'happy';
  const items = review(S.build, S.plan, S.mission, C());
  const blocks = items.filter(i => i.level === 'block').length, warns = items.filter(i => i.level === 'warn').length;
  return blocks >= 3 ? 'panic' : blocks || warns >= 3 ? 'worried' : 'happy';
}
// New players start in the team's poppy hat; choosing "no hat" saves null.
function myHat() { const h = funGet('ceruvia-hat', '🌺'), un = hatsUnlocked(); return un.find(x => x.icon === h) || null; }
const fun_shipHtml = shipHtml;
shipHtml = function (...a) {
  const h = fun_shipHtml.apply(this, a), hat = myHat();
  return hat ? h.replace('<div class="googly"', `<span class="hat" aria-hidden="true">${hat.icon}</span><div class="googly"`) : h;
};
const fun_shipHtml2 = shipHtml;
shipHtml = function (...a) {
  const mood = shipMood(), say = { panic: '😱', worried: '😬', happy: '' }[mood];
  return fun_shipHtml2.apply(this, a).replace('<div class="ship bus-', `<div class="ship mood-${mood} bus-`)
    .replace('<div class="googly"', `${say ? `<span class="moodface" aria-hidden="true">${say}</span>` : ''}<div class="googly"`);
};
function shipSay(text) {
  const ship = document.querySelector('#ship .ship'); if (!ship) return;
  const b = document.createElement('div'); b.className = 'shipsay'; b.textContent = text;
  ship.appendChild(b);
  setTimeout(() => b.classList.add('out'), 2200); setTimeout(() => b.remove(), 2600);
}
const fun_place = place;
place = function (id, ...rest) { const ok = fun_place.call(this, id, ...rest); if (ok && PART_QUIPS[id]) shipSay(PART_QUIPS[id]); return ok; };
const fun_paintHtml = paintHtml;
paintHtml = function (...a) {
  const un = hatsUnlocked(), cur = myHat();
  const picker = `<div class="card"><h3>🎩 Hats</h3>${un.length
    ? `<div class="hats"><button class="hatbtn${cur ? '' : ' sel'}" data-act="setHat" data-arg="" aria-label="No hat">🚫</button>${un.map(x => `<button class="hatbtn${cur && cur.icon === x.icon ? ' sel' : ''}" data-act="setHat" data-arg="${x.icon}" title="${x.name}" aria-label="${x.name}">${x.icon}</button>`).join('')}</div>`
    : ''}<p class="small muted">${un.length < HATS.length ? `Earn badges to unlock hats. Next hat at ${HATS[un.length].at} badge${HATS[un.length].at > 1 ? 's' : ''} (you have ${funBadges.length}).` : 'You unlocked every hat!'}</p></div>`;
  return fun_paintHtml.apply(this, a).replace('<div class="paint-grid">', '<div class="paint-grid">' + picker);
};
ACT.setHat = icon => { funSet('ceruvia-hat', icon || null); rerender(); };

// ---------- badges on Mission control ----------
function badgesHtml() {
  return `<div class="card"><h3>🏅 Badges <span class="small muted">${funBadges.length} / ${BADGES.length}</span></h3>
    <div class="badges">${BADGES.map(b => { const got = funBadges.includes(b.id);
      return `<div class="badge${got ? ' got' : ''}" title="${b.name}: ${b.desc}"><span>${got ? b.icon : '🔒'}</span><b>${b.name}</b><small>${b.desc}</small></div>`; }).join('')}</div>
    <p class="small muted">Discoveries collected: ${dexCount()} · Hats unlocked: ${hatsUnlocked().map(h => h.icon).join(' ') || 'none yet'}</p></div>`;
}
const fun_mapHtml = SCREENS.map.html;
SCREENS.map.html = function (...a) {
  const h = fun_mapHtml.apply(this, a);
  return vsBanner() + h.replace('<div class="card"><h3>🏆 Leaderboard', badgesHtml() + '<div class="card"><h3>🏆 Leaderboard');
};

// ---------- versus challenge links ----------
const VS = {
  encode(o) { return b64urlEncode(JSON.stringify(o)); },
  decode(s) {
    try {
      const o = JSON.parse(b64urlDecode(String(s)));
      if (!o || !MISSIONS.some(m => m.id === o.m) || typeof o.s !== 'number') return null;
      return { m: o.m, n: String(o.n || 'A friend').slice(0, 16), s: Math.round(o.s), st: clamp(o.st | 0, 0, 3), c: Math.round(+o.c || 0),
        sci: Math.round(+o.sci || 0), d: Math.round((+o.d || 0) * 100) / 100, dk: DIFF[o.dk] ? o.dk : 'rookie' };
    } catch (e) { return null; }
  },
  link(run) {
    const res = run.result;
    const code = VS.encode({ m: run.missionId, n: S.myName || 'A friend', s: res.total, st: res.stars, c: Math.round(run.c.cost), sci: res.science, d: Math.round(res.frac * 100) / 100, dk: S.difficulty });
    return location.origin + location.pathname + '?vs=' + code;
  }
};
// A challenge in the URL is saved until it is played, and the URL is cleaned.
(function readVsFromUrl() {
  const q = new URLSearchParams(location.search), raw = q.get('vs');
  if (!raw) return;
  const v = VS.decode(raw);
  if (v) funSet('ceruvia-vs', v);
  q.delete('vs');
  const rest = q.toString();
  try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) { /* file:// */ }
})();
let vsLater = false;
function vsBanner() {
  const v = funGet('ceruvia-vs', null);
  if (!v || vsLater || S.vs) return '';
  const m = MISSIONS.find(x => x.id === v.m);
  return `<div class="vs-banner"><div class="vs-icon">🏁</div><div><b>${esc(v.n)} challenges you!</b>
    <p class="small">${v.s} points on ${esc(m.name)} (${starsHtml(v.st)}, ${esc(DIFF[v.dk].label)}). Can you beat it?</p></div>
    <div class="row gap wrap"><button class="btn primary small" data-act="vsAccept">Accept</button><button class="btn ghost small" data-act="vsLater">Later</button>
    <button class="iconbtn" data-act="vsDismiss" aria-label="Dismiss the challenge">✕</button></div></div>`;
}
const fun_titleHtml = SCREENS.title.html;
SCREENS.title.html = function (...a) { const h = fun_titleHtml.apply(this, a); return h.replace('<div class="stack">', vsBanner() + '<div class="stack">'); };
ACT.vsAccept = () => {
  const v = funGet('ceruvia-vs', null); if (!v) return;
  const m = MISSIONS.find(x => x.id === v.m);
  if (!isUnlockedMission(m)) { toast(`Unlock ${m.name} first, or play it on Sandbox difficulty.`); return; }
  S.vs = v; prepareMission(m); go('briefing'); toast(`Challenge on! Beat ${v.s} points.`);
};
ACT.vsLater = () => { vsLater = true; rerender(); };
ACT.vsDismiss = () => { funSet('ceruvia-vs', null); rerender(); };
ACT.vsShare = () => {
  if (!S.run || !S.run.result) return;
  const url = VS.link(S.run);
  showModal(`<h3>🏁 Challenge a friend</h3><p class="small muted">Send this link. When they open it, they get your score to beat on ${esc(S.mission.name)}. Only your nickname and scores are in the link.</p>
    <textarea class="code" readonly rows="3" id="codeOut">${esc(url)}</textarea>
    <div class="row gap end"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn primary" data-act="copyCode">Copy link</button></div>`);
};

// ---------- report additions: badges this mission, collection, head-to-head, challenge ----------
const fun_reportHtml = SCREENS.report.html;
SCREENS.report.html = function (...a) {
  let h = fun_reportHtml.apply(this, a);
  const r = S.run, m = S.mission;
  if (!r || !r.result) return h;
  const extra = [];
  if (r.vsResult) {
    const v = r.vsResult, me = r.result, win = me.total > v.s, row = (k, a2, b2, better) => `<tr><td>${k}</td><td class="mono${better === 1 ? ' best' : ''}">${a2}</td><td class="mono${better === 2 ? ' best' : ''}">${b2}</td></tr>`;
    const cmp = (a2, b2, low) => a2 === b2 ? 0 : (low ? a2 < b2 : a2 > b2) ? 1 : 2;
    extra.push(`<div class="card vs-wrap ${win ? 'won' : 'lost'}"><h3>🏁 ${win ? 'You beat ' + esc(v.n) + '!' : esc(v.n) + ' wins this time'}</h3>
      <table class="compare"><thead><tr><th></th><th>You</th><th>${esc(v.n)}</th></tr></thead><tbody>
      ${row('Score', me.total, v.s, cmp(me.total, v.s))}${row('Stars', me.stars, v.st, cmp(me.stars, v.st))}
      ${row('Science', me.science, v.sci, cmp(me.science, v.sci))}${row('Mission cost', fmtM(r.c.cost), fmtM(v.c), cmp(Math.round(r.c.cost), v.c, true))}
      ${row('Data home', fmtPct(me.frac), fmtPct(v.d), cmp(Math.round(me.frac * 100), Math.round(v.d * 100)))}</tbody></table></div>`);
  }
  if (funRunBadges.length) extra.push(`<div class="card"><h3>🏅 Badges this mission</h3><div class="badges">${funRunBadges.map(id => { const b = BADGES.find(x => x.id === id);
    return `<div class="badge got"><span>${b.icon}</span><b>${b.name}</b><small>${b.desc}</small></div>`; }).join('')}</div></div>`);
  extra.push(`<div class="card"><h3>📚 Collection</h3><p>You have found <b>${(funDex[m.id] || []).length} of ${worldTotal(m)}</b> discoveries at ${esc(m.target)}. Different instruments, orbits and landing sites find different things.</p></div>`);
  h = h.replace('<div class="card"><h3>💡 What to try next</h3>', extra.join('') + '<div class="card"><h3>💡 What to try next</h3>');
  return h.replace('<button class="btn ghost" data-act="retryMission">', '<button class="btn ghost" data-act="vsShare">🏁 Challenge a friend</button><button class="btn ghost" data-act="retryMission">');
};

// The fun layer starts after the first render in game.js, so redraw once with music and banners in place.
render();
