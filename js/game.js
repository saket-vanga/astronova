/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* The shell: global state, saving, rendering, every screen, the mission run, scoring and the report. */

// ---------- state ----------
const S = {
  screen: 'title', mode: 'solo', players: [], uid: null, difficulty: 'rookie', dlg: 0, hangarTab: 'build', showAdv: false,
  campaign: { done: {}, unlocked: 1 }, mission: null, builds: {},
  build: null, plan: null, paint: 'white', shipName: '', patch: null, brush: null, trades: {},
  run: null, game: null, retriesLeft: 0, selSite: null, lastPass: null, anim: 0, ready: {},
  turn: null, notice: null, watch: null, myName: '', joinCode: '', vs: null
};

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } }
};
const app = document.getElementById('app');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function plural(n, w) {
  if (n === 1) return n + ' ' + w;
  if (/[^aeiou]y$/.test(w)) return n + ' ' + w.slice(0, -1) + 'ies';
  return n + ' ' + w + (/(s|x|ch|sh)$/.test(w) ? 'es' : 's');
}

// ---------- saving ----------
const SAVE_KEY = 'ceruvia-save-v2';
function saveCampaign() {
  store.set(SAVE_KEY, JSON.stringify({ v: 2, campaign: S.campaign, builds: S.builds, difficulty: S.difficulty,
    shipName: S.shipName, paint: S.paint, patch: S.patch, trades: S.trades }));
}
function loadCampaign() {
  try {
    const d = JSON.parse(store.get(SAVE_KEY) || 'null');
    if (!d || d.v !== 2) return false;
    if (d.campaign && d.campaign.done) S.campaign = d.campaign;
    if (d.builds) S.builds = d.builds;
    if (DIFF[d.difficulty]) S.difficulty = d.difficulty;
    S.shipName = d.shipName || ''; S.paint = d.paint || 'white'; S.patch = d.patch || null; S.trades = d.trades || {};
    return true;
  } catch (e) { return false; }
}
function saveBuild() {
  if (!S.mission || !S.build) return;
  S.builds[S.mission.id] = { build: clone(S.build), plan: clone(S.plan) };
  saveCampaign();
}
function hasProgress() { return Object.keys(S.campaign.done).length > 0 || Object.keys(S.builds).length > 0; }

// ---------- campaign helpers ----------
function starsOn(id) { return (S.campaign.done[id] || {}).stars || 0; }
function totalStars() { return MISSIONS.reduce((s, m) => s + starsOn(m.id), 0); }
function bonusBudget() {
  if (!S.mission) return 0;
  return MISSIONS.filter(m => m.num < S.mission.num).reduce((s, m) => s + starsOn(m.id), 0) * STAR_BONUS;
}
function isUnlockedMission(m) { return !!DIFF[S.difficulty].allOpen || m.num <= S.campaign.unlocked; }
function C() { return calc(S.build, S.plan, S.mission, S.difficulty, bonusBudget()); }

function prepareMission(m) {
  S.mission = m;
  const saved = S.builds[m.id];
  S.build = saved && saved.build && BUSES[saved.build.bus] ? clone(saved.build) : emptyBuild('medium');
  if (!busUnlocked(S.build.bus, m, S.difficulty)) resizeBuild(S.build, 'medium');
  S.plan = Object.assign(defaultPlan(m), saved ? clone(saved.plan) : {});
  if (!m.trajs[S.plan.traj]) S.plan.traj = Object.keys(m.trajs)[0];
  if (!m.orbits[S.plan.orbit]) S.plan.orbit = Object.keys(m.orbits)[0];
  if (!LAUNCHERS[S.plan.lv]) S.plan.lv = 'condor';
  if (!m.objectives.some(o => o.id === S.plan.goal)) S.plan.goal = null;
  S.plan.opsMonths = clamp(S.plan.opsMonths || m.ops[2], m.ops[0], m.ops[1]);
  S.dlg = 0; S.hangarTab = 'build'; S.run = null; S.game = null; S.selSite = null; S.lastPass = null; S.ready = {}; S.turn = null;
  syncFuel();
}

// ---------- co-op roles (solo play can always act; net.js fills in players) ----------
function sortedPlayers() { return S.players.slice().sort((a, b) => (a.joined || 0) - (b.joined || 0)); }
function ownerOf(role) {
  if (S.mode !== 'online' || !S.players.length) return null;
  const p = sortedPlayers();
  return p[ROLE_ORDER.indexOf(role) % p.length];
}
function canAct(role) { if (S.mode !== 'online') return true; const o = ownerOf(role); return !o || o.uid === S.uid; }
function holderName(role) { const o = ownerOf(role); return o ? `${o.name} (${ROLES[role].name})` : ROLES[role].name; }
function waitFor(role) { return 'Waiting for ' + holderName(role); }

// ---------- mission steps (co-op hands each one to the player who owns it) ----------
const STEP_ROLE = { doLaunch: 'prop', doInsertion: 'prop', doCruise: 'lead', doReentry: 'lead', doLanding: 'sci', doTag: 'sci' };
const STEPS = {};
function runStep(name, ...args) {
  const role = STEP_ROLE[name];
  if (role && !canAct(role)) {
    S.turn = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), role, step: name, args };
    toast('Handing the controls to ' + holderName(role) + '.');
    render();
    return;
  }
  STEPS[name](...args);
}

// ---------- rendering ----------
const SCREENS = {};
function render() {
  const fn = SCREENS[S.screen] || SCREENS.title;
  renderTopbar();
  app.innerHTML = (FLIGHT_SCREENS.includes(S.screen) ? '' : phaseBar()) + fn.html();
  app.dataset.screen = S.screen;
  if (fn.after) fn.after();
}
function go(screen) {
  stopAnim(); S.screen = screen; render(); window.scrollTo({ top: 0 });
  app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');   // fade in only on a real screen change
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function stopAnim() { if (S.anim) { cancelAnimationFrame(S.anim); S.anim = 0; } }

const FLIGHT_SCREENS = ['game', 'watch', 'transit', 'explore', 'crisis'];
function renderTopbar() {
  const tb = $('#topbar');
  if (!tb) return;
  const flying = FLIGHT_SCREENS.includes(S.screen);
  const showMission = S.mission && !['title', 'setup', 'map', 'finale'].includes(S.screen);
  tb.innerHTML = `<button class="brand" ${flying ? 'disabled' : 'data-act="home"'} aria-label="Title screen">🚀 <span>AstroNova</span></button>
    ${showMission ? `<span class="tb-mission small">${FACES.planet[S.mission.planet]} M${S.mission.num} · ${esc(S.mission.name)}</span>` : ''}
    <span class="grow"></span>
    ${!flying && showMission ? '<button class="btn small ghost" data-act="toMap" aria-label="Mission control"><span class="lbl">Mission control</span><span class="ico" aria-hidden="true">🗺️</span></button>' : ''}
    <button class="iconbtn" data-act="openHandbook" aria-label="Open the handbook" title="Handbook">📖</button>
    <button class="iconbtn" data-act="toggleMute" aria-label="${SFX.muted ? 'Turn sound on' : 'Mute sound'}" title="Sound">${SFX.muted ? '🔇' : '🔊'}</button>`;
}

// ---------- modal, toast, handbook ----------
let modalCb = null, pendingEvent = null;
function showModal(html, opts) {
  opts = opts || {};
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box${opts.wide ? ' wide' : ''}${opts.cls ? ' ' + opts.cls : ''}" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  m.dataset.locked = opts.locked ? '1' : '';
  modalCb = opts.onNext || null;
  const b = m.querySelector('button.primary') || m.querySelector('button');
  if (b) b.focus();
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; m.dataset.locked = ''; modalCb = null; }
function confirmModal(title, text, act, yes) {
  showModal(`<h3>${title}</h3><p>${text}</p><div class="row gap end"><button class="btn ghost" data-act="closeModal">Cancel</button>
    <button class="btn primary" data-act="${act}">${yes || 'Yes'}</button></div>`);
}
function toast(text) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}
function handbookHtml() {
  return `<div class="row between"><h2>📖 Handbook</h2><button class="iconbtn" data-act="closeHandbook" aria-label="Close the handbook">✕</button></div>` +
    HANDBOOK.map((h, i) => `<details${i === 0 ? ' open' : ''}><summary>${h.title}</summary><div class="hb">${h.html}</div></details>`).join('') +
    `<details><summary>Learn more</summary><div class="hb"><p class="small">This game was shaped by these real NASA and space agency resources. Each one opens in a new tab.</p><ul class="links">${RESOURCES.map(r =>
      `<li><a href="${r.url}" target="_blank" rel="noopener">${esc(r.name)}</a><br><span class="small muted">${esc(r.note)}</span><br><span class="small"><b>In the game:</b> ${esc(r.used)}</span></li>`).join('')}</ul></div></details>`;
}

// ---------- shared bits of HTML ----------
function crewLine(who, text) {
  const c = CREW[who];
  return `<div class="line"><div class="face" style="--crew:${c.color}" aria-hidden="true">${FACES.crew[who]}</div>
    <div class="bubble"><b style="color:${c.color}">${c.name}</b> <span class="small muted">${c.job}</span><p>${esc(text)}</p></div></div>`;
}
function starsHtml(n, max) { max = max || 3; let s = ''; for (let i = 0; i < max; i++) s += i < n ? '★' : '☆'; return `<span class="stars" aria-label="${n} of ${max} stars">${s}</span>`; }

// ---------- screens: title, setup, map ----------
SCREENS.title = {
  html() {
    const has = hasProgress();
    return `<div class="title-screen">
      <div class="hero" aria-hidden="true"><span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
        ${planetSvg('ceruvia', 'wow', 'hero-planet')}<span class="orbit"><span class="sat">🛰️</span></span></div>
      <div class="eyebrow">A space mission design game</div>
      <h1 class="game-title">Astro<span class="nova">Nova</span></h1>
      <div class="episode">Episode 1 · Last Signal from Ceruvia</div>
      <p class="lede">A faint radio signal is coming from an icy moon, and it is fading. Fly five missions to prove your team can reach it. Pick a science goal, build a spacecraft, fly it, and find out what is calling.</p>
      <div class="stack">
        ${has ? '<button class="btn primary big" data-act="continueGame">Continue</button>' : ''}
        <button class="btn ${has ? 'ghost' : 'primary'} big" data-act="newGame">${has ? 'New campaign' : 'Play'}</button>
        <button class="btn ghost" data-act="openHandbook">How to play</button>
      </div>
      <div class="title-feats" aria-hidden="true"><span>🪐 5 missions</span><span>🔧 32 parts</span><span>🕹️ 6 flight games</span><span>👥 Co-op for 4</span></div>
      <p class="small muted credit">A game by Team Hubble Huddle 🔭</p></div>`;
  }
};

SCREENS.setup = {
  html() {
    const cards = DIFF_ORDER.map(k => { const d = DIFF[k];
      return `<button class="choice${S.difficulty === k ? ' sel' : ''}" data-act="setDiff" data-arg="${k}"><b>${d.label}${k === 'rookie' ? ' <span class="pill">Recommended</span>' : ''}</b><span class="small muted">${d.desc}</span></button>`; }).join('');
    return `<div class="narrow">
      <div class="eyebrow">New crew member</div><h2>Who is flying?</h2>
      <label class="field"><span>Nickname</span>
        <input type="text" maxlength="16" placeholder="e.g. Comet Kid" value="${esc(S.myName)}" data-input="myName" autocomplete="off" spellcheck="false">
        <span class="small muted">Just a nickname for the leaderboard. Please don't use your real name.</span></label>
      <h3>Difficulty</h3><div class="choices">${cards}</div>
      <div class="row end"><button class="btn primary big" data-act="startCampaign">To Mission control →</button></div></div>`;
  }
};

SCREENS.map = {
  html() {
    const nextUp = MISSIONS.find(m => isUnlockedMission(m) && !starsOn(m.id));
    const cards = MISSIONS.map(m => {
      const open = isUnlockedMission(m), done = S.campaign.done[m.id], isNext = nextUp && nextUp.id === m.id;
      return `<button class="mission${open ? '' : ' locked'}${isNext ? ' next' : ''}" data-act="pickMission" data-arg="${m.id}"${open ? '' : ' aria-disabled="true"'}>
        ${isNext ? `<span class="nextflag">▶ ${totalStars() ? 'Next up' : 'Start here'}</span>` : ''}
        <span class="planet" aria-hidden="true">${open ? planetSvg(m.planet, starsOn(m.id) ? 'happy' : 'meh') : '<span class="lock">🔒</span>'}</span>
        <span class="mtext"><span class="eyebrow">Mission ${m.num} · ${esc(m.target)}</span><b>${esc(m.name)}</b>
        <span class="small muted">${open ? esc(m.teaches) : 'Earn a star on mission ' + (m.num - 1) + ' to unlock.'}</span></span>
        <span class="mscore">${starsHtml(starsOn(m.id))}${done ? `<span class="small mono">${done.score} pts</span>` : ''}</span></button>`;
    }).join('');
    const finale = starsOn('m5') > 0 ? '<button class="btn primary" data-act="toFinale">🎉 The finale</button>' : '';
    return `<div class="row between wrap"><div><div class="eyebrow">${esc(DIFF[S.difficulty].label)} · ${totalStars()} / 15 stars</div><h2>Mission control</h2></div>
      <div class="row gap wrap">${finale}<button class="btn ghost small" data-act="toSetup">Difficulty</button></div></div>
      <p class="muted">${nextUp ? `Tap <b>${esc(nextUp.name)}</b> to ${starsOn('m1') || S.campaign.done.m1 ? 'fly your next mission' : 'begin'}. ` : ''}Earn at least one star to unlock the next mission. Each star also adds ${fmtM(STAR_BONUS)} to later budgets.</p>
      <div class="missions">${cards}</div>
      <div class="card"><h3>🏆 Leaderboard (this device)</h3>${boardHtml()}</div>
      <div class="row gap end wrap"><button class="btn ghost small" data-act="loadCode">Load a design code</button><button class="btn ghost small" data-act="resetSave">Reset progress</button></div>`;
  }
};

// ---------- briefing and goal ----------
SCREENS.briefing = {
  html() {
    const m = S.mission, lines = m.intro.slice(0, S.dlg + 1), more = S.dlg < m.intro.length - 1;
    return `<div class="narrow"><div class="brief-head"><div><div class="eyebrow">Mission ${m.num} briefing · ${esc(m.target)}</div><h2>${esc(m.name)}</h2>
      <p class="muted">${esc(m.teaches)}</p></div><div class="brief-planet">${planetSvg(m.planet, 'happy')}</div></div>
      <div class="dialog">${lines.map(([w, t]) => crewLine(w, t)).join('')}</div>
      ${more ? `<div class="row gap end"><button class="btn ghost small" data-act="dlgSkip">Skip</button><button class="btn primary" data-act="dlgNext">Next ▸</button></div>` : `
      <div class="card"><h3>⭐ Objectives</h3><ol class="objs">${m.objectives.map(o => `<li>${esc(o.text)}</li>`).join('')}</ol>
        <p class="small muted">Each objective you complete earns a star.</p></div>
      <div class="card"><h3>⚠️ What matters most here</h3>${m.critical.map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join('')}</div>
      <div class="card how"><h3>🧭 How every mission works</h3><ol>
        <li><b>Pick a science goal.</b> It tells you which parts matter most.</li>
        <li><b>Build and plan.</b> Add parts, then choose a rocket, orbit and ground stations. Keep every meter out of the red.</li>
        <li><b>Pass the launch review.</b> Red items stop the launch. Amber items are risks.</li>
        <li><b>Fly it and do science.</b> Then read the report to see what to try next.</li></ol></div>
      <div class="row end"><button class="btn primary big" data-act="toGoal">Choose a science goal →</button></div>`}</div>`;
  }
};

SCREENS.goal = {
  html() {
    const m = S.mission, lead = canAct('lead');
    const cards = m.objectives.map((o, i) => {
      const n = GOAL_NEEDS[o.id], parts = goalParts(m, o.id).filter(id => isUnlocked(id, m, S.difficulty));
      return `<div class="card goal${S.plan.goal === o.id ? ' sel' : ''}"><h3>🎯 ${esc(o.text)}${i === 0 && isSimple() && !S.plan.goal ? ' <span class="pill pick">👍 Good first pick</span>' : ''}</h3>
        <p><b>Who uses the data:</b> ${esc(n.users)}</p><p class="small">${esc(n.why)}</p>
        <div class="row gap wrap">${parts.map(id => partChip(id, ' ★')).join('')}</div>
        <div class="row end"><button class="btn ${S.plan.goal === o.id ? 'primary' : 'ghost'}" data-act="setGoal" data-arg="${o.id}"${lead ? '' : ' disabled'}>${S.plan.goal === o.id ? 'Chosen ✓' : 'Make this the prime goal'}</button></div></div>`;
    }).join('');
    return `<div class="narrow"><div class="eyebrow">Step 1 · Science first</div><h2>Choose the prime science goal</h2>
      <p class="muted">Real missions start with a question, not a spacecraft. <b>Pick one goal below.</b> It decides which parts matter most, and meeting it is worth +100 points. You can still earn the other stars.</p>
      ${lead ? '' : `<p class="small muted">${esc(waitFor('lead'))} to choose.</p>`}${cards}
      ${S.plan.goal ? '<div class="row end"><button class="btn primary big" data-act="toHangar">To the hangar →</button></div>' : ''}</div>`;
  }
};

SCREENS.hangar = { html() { return hangarHtml(); }, after() { hangarAfter(); } };

// ---------- launch review ----------
SCREENS.review = {
  html() {
    const m = S.mission, c = C(), items = review(S.build, S.plan, m, c);
    const blocks = items.filter(i => i.level === 'block'), warns = items.filter(i => i.level === 'warn');
    const icon = { block: '✗', warn: '!', ok: '✓' };
    const segs = Object.keys(SEGMENTS).map(k => {
      const list = items.filter(i => i.seg === k);
      if (!list.length) return '';
      const sg = SEGMENTS[k];
      return `<div class="card seg"><h3>${sg.icon} ${sg.name}</h3><p class="small muted">${sg.desc}</p>
        ${list.map(i => `<div class="ritem ${i.level}"><span class="ricon" aria-hidden="true">${icon[i.level]}</span><div><b>${esc(i.title)}</b><p class="small">${esc(i.why)}</p></div></div>`).join('')}</div>`;
    }).join('');
    const dev = devYears(c);
    return `<div class="narrow"><div class="eyebrow">Step 3 · Launch review</div><div class="row gap">${patchImg('big')}<h2>Is ${esc(S.shipName || 'your spacecraft')} ready to fly?</h2></div>
      <div class="card summary ${blocks.length ? 'bad' : warns.length ? 'warn' : 'ok'}">
        <b>${blocks.length ? `${plural(blocks.length, 'problem')} must be fixed before launch.` : warns.length ? `Cleared to launch, with ${plural(warns.length, 'risk')}.` : 'All green. Cleared to launch!'}</b>
        <p class="small">${blocks.length ? 'Red ✗ items below stop the launch. Go back to the hangar to fix them' + (isSimple() ? ', or let Ollie do it.' : '.') : warns.length ? 'Amber ! items are risks. You can fly with them, or go back and fix them for a better score.' : 'Nothing left to fix. ' + (typeof NET !== 'undefined' && NET.on ? 'Everyone votes GO below to launch.' : 'Press Launch when you are ready.')}</p>
        <div class="row gap wrap">${blocks.length ? '<button class="btn primary" data-act="toHangar">← Fix it in the hangar</button>' : '<button class="btn primary big" data-act="launch">🚀 Launch!</button><button class="btn ghost" data-act="toHangar">← Change the design</button>'}</div></div>
      ${segs}
      <div class="card conops-card"><h3>🗓️ Your mission plan</h3>
        <p class="small muted">The whole mission from first bolt to last byte: ${dev.toFixed(1)} years to build and test, ${c.cruise ? fmtYears(c.cruise).replace(' yr', ' years') + ' of cruise, ' : ''}${S.plan.opsMonths} months of science (${plural(c.passes, 'pass')})${m.needReturn ? ', then the trip home' : ''}. Real teams call this a concept of operations.</p>
        ${conopsHtml(c, m, S.plan)}
        <h3 class="mt">🧭 Trajectory</h3>${trajSvg(m, S.plan)}
        <p class="small muted">Real teams work out paths like this with NASA's free GMAT software.</p></div>
      <div class="row between wrap"><button class="btn ghost" data-act="toHangar">← Back to the hangar</button>
        <button class="btn primary big" data-act="launch"${blocks.length ? ' disabled' : ''}>🚀 Launch!</button></div></div>`;
  }
};

// ---------- the mission run ----------
function log(text, kind) { if (S.run) S.run.log.push({ text, kind: kind || 'info' }); }
function snapCalc(c) { const s = clone(c); s.budget = c.budget; s.budgetLeft = c.budgetLeft; return s; }

function startRun() {
  const c = C();
  saveBuild();
  S.run = { missionId: S.mission.id, c: snapCalc(c), d: clone(c.d), plan: clone(S.plan), build: clone(S.build),
    log: [], scores: {}, finds: [], passesLeft: 0, passPenalty: 0, sciMult: c.d.adcs ? c.d.adcs.mult : 1, downMult: 1, dataLoss: 1,
    extraCost: 0, bonusSci: 0, fuelSpare: c.fuel - c.fuelReq, broken: [], landed: false, landedSite: null, landerUsed: false,
    tagOk: false, tagTried: false, capsuleLanded: false, returnShort: false, crisisClean: false, crisisDone: false, events: [], result: null };
  S.retriesLeft = DIFF[S.difficulty].retries;
  S.selSite = null; S.lastPass = null;
  runStep('doLaunch');
}

// Design effects that every minigame reads.
function pilotOpts(extra) {
  const c = S.run.c, d = S.run.d;
  return Object.assign({
    heavy: c.massMargin < 0.3 ? (0.3 - c.massMargin) / 0.3 : 0,
    agility: d.adcs ? d.adcs.agility : 0.8,
    tol: DIFF[S.difficulty].tol,
    assist: isSimple(),
    hints: DIFF[S.difficulty].tol >= 1.4,
    retry: false
  }, extra || {});
}

STEPS.doLaunch = function () {
  startGame('launch', pilotOpts({
    lesson: r => r.acc > 0.8 ? 'A smooth gravity turn wastes the least fuel.' : 'Every wobble off the line burns fuel. A lighter spacecraft is easier to steer.'
  }), res => {
    const r = S.run;
    r.scores.launch = res.score;
    const lost = Math.round(r.c.fuel * 0.04 * (1 - res.acc));
    if (lost > 0) { r.fuelSpare -= lost; log(`Launch: ${fmtPct(res.acc)} on the line. Steering wobbles burned ${fmtKg(lost)} of fuel.`, res.acc > 0.7 ? 'info' : 'warn'); }
    else log('Launch: a clean gravity turn.', 'good');
    eventChain(afterLaunch);
  });
};
function afterLaunch() { if (S.mission.minigames.includes('dodge')) runStep('doCruise'); else afterCruise(); }
function afterCruise() { if (S.mission.minigames.includes('insertion')) runStep('doInsertion'); else arrive(); }

STEPS.doCruise = function () {
  const d = S.run.d;
  startGame('dodge', pilotOpts({
    span: 1 + d.span * 0.25, hazard: S.mission.hazard, shield: d.shields * PARTS.shield.hits,
    lesson: () => d.span > 2 ? 'Big solar wings are big targets.' : 'Shields soak up hits that would break parts.'
  }), res => {
    const r = S.run;
    r.scores.dodge = res.score;
    let hits = res.hits;
    const absorbed = Math.min(hits, r.d.shields * PARTS.shield.hits);
    if (absorbed) { r.d.shields -= Math.ceil(absorbed / PARTS.shield.hits); hits -= absorbed; log(`Cruise: your debris shield absorbed ${plural(absorbed, 'hit')}.`, 'good'); }
    for (let i = 0; i < hits; i++) log('Cruise: debris hit! ' + damage(r), 'bad');
    if (!res.hits) log('Cruise: no debris hits.', 'good');
    afterCruise();
  });
};

STEPS.doInsertion = function () {
  startGame('insertion', pilotOpts({
    lesson: r => r.err < 0.08 ? 'Stopping right on the line saves fuel for later.' : 'Burning too long or too short wastes fuel fixing the orbit afterwards.'
  }), res => {
    const r = S.run;
    r.scores.insertion = res.score;
    const extra = Math.round(r.c.fuelReq * res.err * 0.25);
    r.fuelSpare -= extra;
    log(extra > 0 ? `Orbit insertion: off by ${fmtPct(res.err)}. Fixing the orbit used ${fmtKg(extra)} of fuel.` : 'Orbit insertion: right on the line.', res.err < 0.1 ? 'good' : 'warn');
    arrive();
  });
};

function arrive() {
  const r = S.run, c = r.c, m = S.mission;
  let passes = c.passes - r.passPenalty;
  if (r.fuelSpare < 0) {
    if (m.needReturn) {
      r.returnShort = r.fuelSpare < -0.05 * c.fuelReq;
      log(r.returnShort ? 'Fuel is short. There may not be enough left to come home.' : 'Fuel is tight, but there should just be enough to come home.', 'warn');
    } else if (-r.fuelSpare > 0.15 * c.fuelReq) {
      passes = Math.ceil(passes / 2);
      log('You ran short of fuel braking into orbit and ended up in a loose, wobbly orbit. Half the science passes are lost.', 'bad');
    } else { passes -= 1; log('Fuel ran a little short. The team trimmed the orbit and lost one science pass.', 'warn'); }
  }
  r.passesLeft = Math.max(1, passes);
  log(`Arrived at ${m.target} with ${plural(r.passesLeft, 'science pass')} planned.`, 'info');
  S.selSite = m.sites[0].id;
  go('explore');
}

// Share of the science data that reaches Earth.
function findingFrac(r) {
  r = r || S.run;
  const c = r.c, dataOf = list => list.reduce((s, id) => s + PARTS[id].data, 0);
  const orig = dataOf(c.d.instruments), now = dataOf(r.d.instruments);
  const gen = orig ? c.genMb * now / orig : 0;
  let f = gen > 0 ? Math.min(1, c.downMb * r.downMult / gen) : 1;
  if (!c.recorderOk) f *= 0.85;
  return f * r.dataLoss;
}

// One science pass over a site. scanMult comes from the scan minigame (×0.85 to ×1.3; auto scan ×1).
function doPass(siteId, scanMult, hits) {
  const r = S.run, m = S.mission, site = m.sites.find(s => s.id === siteId), orbit = m.orbits[r.plan.orbit];
  if (!site || r.passesLeft <= 0) return;
  scanMult = scanMult || 1;
  r.passesLeft--;
  const got = [], missed = [], pFind = 0.55 + 0.4 * r.c.duty;
  for (const inst of r.d.instruments) {
    const f = site.finds[inst];
    if (!f || r.finds.some(x => x.id === f.id)) continue;
    if (!canSee(inst, site, orbit)) { missed.push({ inst, why: Math.abs(site.lat) > orbit.maxLat ? 'out of view from this orbit' : 'needs a low orbit' }); continue; }
    if (Math.random() < pFind) {
      const rec = Object.assign({}, f, { site: site.id, inst, mult: (PARTS[inst].detail && !orbit.detail ? 0.5 : 1) * scanMult });
      r.finds.push(rec); got.push(rec);
    } else missed.push({ inst, why: 'saw nothing new this time' });
  }
  // Flying the sample arm through a plume
  if (r.d.sampler && m.plumeSite === site.id && !r.tagOk) {
    if (orbit.detail && Math.abs(site.lat) <= orbit.maxLat) {
      r.tagOk = true;
      const rec = Object.assign({}, m.tagFinding, { site: site.id, inst: 'sampler', mult: 1 });
      r.finds.push(rec); got.push(rec);
    } else missed.push({ inst: 'sampler', why: 'needs a low orbit over the plumes' });
  }
  S.lastPass = { site: site.id, got: got.map(f => f.id), missed };
  const scanNote = hits >= 0 && hits != null ? ` (scan ${hits}/3 on target, ×${scanMult})` : '';
  log(`Science pass over ${site.name}${scanNote}: ${got.length ? got.map(f => f.title).join(', ') : 'nothing new'}.`, got.length ? 'good' : 'info');
  rerender();
  if (got.length) popFinds(got);
}

function popFinds(list) {
  showModal(`<h3>🔭 New discoveries!</h3><div class="finds">${list.map(f =>
    `<div class="find"><b>${esc(f.title)}</b><span class="pill">+${Math.round(f.pts * (f.mult || 1))} pts</span><p class="small">${esc(f.why)}</p>
     <span class="small muted">${f.inst === 'lander' ? 'Found by the lander' : f.inst === 'sampler' ? 'Sample collected' : 'Found by the ' + esc(lc1(PARTS[f.inst].name))}</span></div>`).join('')}</div>
    <div class="row end"><button class="btn primary" data-act="closeModal">Nice!</button></div>`, { wide: true });
}

STEPS.doLanding = function (siteId) {
  const m = S.mission, site = m.sites.find(s => s.id === siteId);
  startGame('landing', pilotOpts({ gravity: m.gravity, rough: site.rough || 0.4, retry: true,
    lesson: r => r.outcome === 'pad' ? 'Slow and steady wins: arrive at walking pace.' : 'Kill your sideways speed first, then come down gently.'
  }), res => {
    const r = S.run;
    r.landerUsed = true;
    r.scores.landing = res.score;
    if (res.outcome === 'crash') { log(`Landing: the lander crashed at ${site.name}.`, 'bad'); go('explore'); return; }
    r.landed = true; r.landedSite = site.id;
    log(`Landing: down safely at ${site.name}${res.outcome === 'pad' ? ', right on the pad' : ', a little off the pad'}.`, 'good');
    const f = site.finds.land;
    go('explore');
    if (f && !r.finds.some(x => x.id === f.id)) {
      const rec = Object.assign({}, f, { site: site.id, inst: 'lander', mult: res.outcome === 'pad' ? 1 : 0.8 });
      r.finds.push(rec);
      S.lastPass = { site: site.id, got: [f.id], missed: [] };
      rerender();
      popFinds([rec]);
    }
  });
};

STEPS.doTag = function (siteId) {
  const m = S.mission, site = m.sites.find(s => s.id === siteId);
  startGame('tag', pilotOpts({ gravity: m.gravity, rough: site.rough || 0.4, retry: true,
    lesson: () => site.rough > 0.6 ? 'Boulders make touching down risky. Smooth ground is safer.' : 'Smooth ground made for a safe touch.'
  }), res => {
    const r = S.run;
    r.tagTried = true;
    r.scores.tag = res.score;
    go('explore');
    if (res.ok) {
      r.tagOk = true;
      const rec = Object.assign({}, m.tagFinding, { site: site.id, inst: 'sampler', mult: 1 });
      r.finds.push(rec);
      log(`Touch-and-go at ${site.name}: sample collected.`, 'good');
      rerender(); popFinds([rec]);
    } else log(`Touch-and-go at ${site.name}: the arm came up empty.`, 'bad');
  });
};

function finishExplore() {
  const m = S.mission, r = S.run;
  if (m.crisis && !r.crisisDone) { if (!r.crisis) initCrisis(); go('crisis'); return; }
  if (m.needReturn) { runStep('doReentry'); return; }
  finalize();
}

// ---------- the power emergency (turn-based) ----------
// Each turn is 3 hours. Generation drops, so the player switches loads off to keep the battery alive
// and keeps the transmitter and pointing on long enough to send the unsent data home.
const CRISIS_H = 3;
const CRISIS_LOADS = [
  { k: 'heater', name: 'Heaters', icon: '🔥', why: 'Keep the battery and instruments warm. Off for 3 turns in a row and the cold battery loses a quarter of its capacity.' },
  { k: 'adcs', name: 'Pointing', icon: '🎯', why: 'Points the antenna at Earth. Without it, nothing can be sent.' },
  { k: 'recorder', name: 'Recorder', icon: '💾', why: 'Holds the data that has not been sent yet. Switch it off and that data is erased.' },
  { k: 'tx', name: 'Transmitter', icon: '📡', why: 'Sends one packet of waiting data home each turn, if pointing is on.' },
  { k: 'inst', name: 'Instruments', icon: '🔬', why: 'Keep watching the storm. Survive with them on for bonus science.' }
];
function initCrisis() {
  const r = S.run, c = r.c, cap = Math.max(50, r.d.batteryWh);
  r.crisis = { turn: 1, battery: cap, cap, fc: 0, fcUsed: false, cold: 0, coldHit: false,
    on: { heater: true, adcs: true, recorder: true, tx: true, inst: true }, instAll: true,
    packets: 2 + Math.round((1 - c.dataRatio) * 4) + Math.min(2, Math.floor(r.finds.length / 3)), sent: 0, lost: 0, dead: false, done: false,
    log: [`${S.mission.crisis.name}! Power generation has dropped. Decide what to switch off.`] };
}
function crisisPower() {
  const r = S.run, c = r.c, d = r.d, cr = S.mission.crisis, x = r.crisis, orbit = S.mission.orbits[r.plan.orbit];
  const gen = solarAt(d.solarKw, S.mission.au) * (1 - cr.solarCut) * (1 - orbit.eclipse) + rtgAt(d.rtg, c.cruise) * (1 - cr.rtgCut);
  const parts = { computer: d.computer ? d.computer.power : 0, heater: c.heater, adcs: d.adcs ? d.adcs.power : 0, recorder: d.recorder ? d.recorder.power : 0,
    tx: d.antenna ? d.antenna.power : 0, inst: c.instP };
  let load = parts.computer;
  for (const L of CRISIS_LOADS) if (x.on[L.k]) load += parts[L.k];
  return { gen, load, parts, net: gen - load };
}
function crisisNextTurn() {
  const r = S.run, x = r.crisis, cr = S.mission.crisis;
  if (!x || x.done) return;
  const p = crisisPower(), note = [];
  let need = -p.net * CRISIS_H;
  if (need > 0 && x.fc > 0) { const use = Math.min(x.fc, need); x.fc -= use; need -= use; note.push(`Fuel cell gave ${Math.round(use)} Wh.`); }
  x.battery = clamp(x.battery - need, 0, x.cap);
  if (!x.on.heater) {
    x.cold++;
    if (x.cold >= 3 && !x.coldHit) { x.coldHit = true; x.cap *= 0.75; x.battery = Math.min(x.battery, x.cap); note.push('The cold battery lost a quarter of its capacity!'); }
  } else x.cold = 0;
  if (!x.on.inst) x.instAll = false;
  const unsent = x.packets - x.sent - x.lost;
  if (!x.on.recorder && unsent > 0) { x.lost += unsent; note.push(`Recorder off: ${plural(unsent, 'packet')} of unsent data erased!`); }
  else if (x.on.tx && x.on.adcs && unsent > 0) { x.sent++; note.push('Sent a packet of data home. 📡'); }
  else if (x.on.tx && !x.on.adcs && unsent > 0) note.push('The transmitter is on, but without pointing the antenna misses Earth.');
  if (x.battery <= 0) {
    x.dead = true; const left = x.packets - x.sent - x.lost; x.lost += left;
    note.push('The battery is flat! The computer browned out' + (left ? ` and ${plural(left, 'packet')} of data were lost.` : '.'));
  }
  x.log.unshift(`Turn ${x.turn}: ${Math.round(p.net)} W net. ${note.join(' ')}`);
  x.turn++;
  if (x.dead || x.turn > cr.turns) endCrisis();
  rerender();
}
function endCrisis() {
  const r = S.run, x = r.crisis, cr = S.mission.crisis;
  x.done = true; r.crisisDone = true;
  r.crisisClean = !x.dead && x.lost === 0;
  if (x.dead) r.sciMult *= 0.8;
  if (x.lost) r.dataLoss *= 1 - 0.5 * x.lost / x.packets;
  if (!x.dead && x.instAll) r.bonusSci += 15;
  r.scores.crisis = x.dead ? 0 : Math.round((r.crisisClean ? 60 : 30) + 40 * x.battery / x.cap);
  log(`${cr.name}: ${x.dead ? 'the battery ran flat and the instruments froze' : 'the spacecraft survived'}. ${x.sent} of ${x.packets} data packets sent${x.lost ? ', ' + x.lost + ' lost' : ''}.${!x.dead && x.instAll ? ' The instruments recorded the whole storm (+15 science).' : ''}`,
    r.crisisClean ? 'good' : 'bad');
  if (r.crisisClean) SFX.win(); else SFX.lose();
}

STEPS.doReentry = function () {
  const r = S.run;
  if (!r.d.capsule) { log('There was no capsule, so nothing came back to Earth.', 'warn'); finalize(); return; }
  if (r.returnShort) { log('Not enough fuel was left for the trip home. The capsule never made it back.', 'bad'); finalize(); return; }
  startGame('reentry', pilotOpts({ retry: true,
    lesson: r2 => r2.ok ? 'Too steep and you burn up. Too shallow and you skip off into space.' : 'Keep the capsule in the corridor, and open the parachute only when it is slow.'
  }), res => {
    r.scores.reentry = res.score;
    r.capsuleLanded = res.ok;
    log(res.ok ? 'Reentry: the capsule landed safely on Earth.' : 'Reentry: the capsule was lost.', res.ok ? 'good' : 'bad');
    finalize();
  });
};

// ---------- events ----------
function eventChain(done) {
  const m = S.mission, r = S.run;
  const pool = shuffle(EVENTS.filter(e => (!e.needHazard || m.hazard > 0) && !(e.id === 'budget' && !isFinite(r.c.budget))));
  const list = pool.slice(0, DIFF[S.difficulty].events);
  let i = 0;
  go('transit');
  const next = () => { if (i >= list.length) { done(); return; } showEvent(list[i++], next); };
  next();
}
function showEvent(ev, next) {
  S.run.events.push(ev.id);
  if (ev.choices) {
    pendingEvent = { ev, next };
    showModal(`<div class="event"><div class="ev-icon" aria-hidden="true">${ev.icon}</div><h3>${ev.title}</h3><p>${ev.text}</p>
      <div class="row gap wrap end">${ev.choices.map((ch, i) => `<button class="btn ${i ? 'ghost' : 'primary'}" data-act="eventChoice" data-arg="${i}">${ch.label}</button>`).join('')}</div></div>`, { locked: true });
    return;
  }
  eventOutcome(ev, ev.apply(S.run), next);
}
function eventOutcome(ev, res, next) {
  log(`${ev.title}: ${res.text}`, res.good ? 'good' : 'bad');
  showModal(`<div class="event"><div class="ev-icon" aria-hidden="true">${ev.icon}</div><h3>${ev.title}</h3><p class="muted">${ev.text}</p>
    <p class="outcome ${res.good ? 'good' : 'bad'}">${res.good ? '✅' : '⚠️'} ${esc(res.text)}</p>
    <div class="row end"><button class="btn primary" data-act="modalNext">Continue</button></div></div>`, { locked: true, onNext: next });
}

SCREENS.transit = {
  html() {
    const m = S.mission;
    return `<div class="narrow"><div class="card transit"><div class="eyebrow">In flight</div><h2>🛰️ On the way to ${esc(m.target)}</h2>
      <p class="muted">${S.run && S.run.c.cruise ? `A ${S.run.c.cruise.toFixed(1)}-year cruise. Mission Control is watching the telemetry.` : 'Climbing to orbit. Mission Control is watching the telemetry.'}</p>
      ${logHtml(S.run ? S.run.log.slice(-4) : [])}</div></div>`;
  }
};
function logHtml(list) { return `<ul class="log">${list.map(l => `<li class="${l.kind}">${esc(l.text)}</li>`).join('')}</ul>`; }

// ---------- exploring ----------
// New discoveries still possible at a site with the instruments on board.
function siteNew(site) {
  const r = S.run, orbit = S.mission.orbits[r.plan.orbit];
  const plume = r.d.sampler && S.mission.plumeSite === site.id && !r.tagOk && orbit.detail && Math.abs(site.lat) <= orbit.maxLat ? 1 : 0;
  return plume + Object.entries(site.finds).filter(([k, f]) => !r.finds.some(x => x.id === f.id) &&
    (k === 'land' ? false : r.d.instruments.includes(k) && canSee(k, site, orbit))).length;
}
SCREENS.explore = {
  html() {
    const r = S.run, m = S.mission, orbit = m.orbits[r.plan.orbit];
    const site = m.sites.find(s => s.id === S.selSite) || m.sites[0];
    const band = (90 - orbit.maxLat) / 180 * 100;
    const fresh = {}; m.sites.forEach(s => { fresh[s.id] = siteNew(s); });
    const best = m.sites.slice().sort((a, b) => fresh[b.id] - fresh[a.id])[0];
    const dots = m.sites.map(s => {
      const n = r.finds.filter(f => f.site === s.id).length;
      return `<button class="sitedot${s.id === site.id ? ' sel' : ''}${n ? ' found' : ''}${fresh[s.id] && r.passesLeft ? ' todo' : ''}" style="left:${s.x * 100}%;top:${(90 - s.lat) / 180 * 100}%"
        data-act="selSite" data-arg="${s.id}" aria-label="${esc(s.name)}${fresh[s.id] ? ', new things to find' : ''}"><span>${n || ''}</span><em${s.lat < -30 ? ' class="up"' : ''}>${esc(s.name)}</em></button>`;
    }).join('');
    const rows = Object.entries(site.finds).map(([k, f]) => {
      const have = r.finds.some(x => x.id === f.id);
      let state;
      if (have) state = '<span class="good">✓ found</span>';
      else if (k === 'land') state = r.d.lander ? (r.landerUsed ? '<span class="muted">lander already used</span>' : 'land here to look') : '<span class="muted">needs a lander</span>';
      else if (!r.d.instruments.includes(k)) state = `<span class="muted">not on board</span>`;
      else if (!canSee(k, site, orbit)) state = `<span class="warnc">${Math.abs(site.lat) > orbit.maxLat ? 'out of view from this orbit' : 'needs a low orbit'}</span>`;
      else state = '<b class="good">ready to scan</b>';
      const who = k === 'land' ? '🛬 Lander' : (CAT_STYLE[PARTS[k].cat].icon + ' ' + esc(PARTS[k].short));
      const clue = (m.clues.find(cl => cl.id === f.tag) || {}).name || '';
      return `<li><span>${who}</span><span class="small">${have ? esc(f.title) : '??? · ' + esc(clue)}</span><span class="small">${state}</span></li>`;
    }).join('');
    const sciRole = canAct('sci');
    const canLand = m.minigames.includes('landing') && r.d.lander && !r.landerUsed;
    const canTag = m.minigames.includes('tag') && r.d.sampler && !r.tagOk;
    const last = S.lastPass && S.lastPass.site === site.id && S.lastPass.missed.length
      ? `<p class="small muted">Last pass: ${S.lastPass.missed.map(x => esc(x.inst === 'sampler' ? 'sample arm' : PARTS[x.inst].short) + ' ' + x.why).join('; ')}.</p>` : '';
    const R = liveR(r), objs = m.objectives.map(o => { const ok = !!o.check(R);
      return `<li class="${ok ? 'good' : ''}">${ok ? '★' : '☆'} ${esc(o.text)}${o.id === r.plan.goal ? ' <span class="pill">Prime goal</span>' : ''}</li>`; }).join('');
    const allDone = m.objectives.every(o => o.check(R));
    // One line that always says what to do next.
    let todo;
    if (r.passesLeft <= 0) todo = (canLand || canTag) ? `No passes left. You can still ${canLand ? 'land' : 'grab a sample'}, or press <b>Finish science</b>.` : 'No passes left. Press <b>Finish science</b> to see how you did.';
    else if (!fresh[site.id] && best && fresh[best.id]) todo = `Nothing new for your instruments at ${esc(site.name)}. Tap <b>${esc(best.name)}</b> on the map instead.`;
    else if (!fresh[site.id]) todo = (canLand || canTag) ? `Nothing ${r.finds.length ? 'more ' : ''}for your instruments to find from orbit. Pick a spot and press ${canLand ? '<b>🛬 Land here</b>' : '<b>🦾 Touch-and-go here</b>'}.` : `Nothing ${r.finds.length ? 'more ' : ''}for your instruments to find. Press <b>Finish science</b>.`;
    else todo = `Press <b>🔭 Science pass here</b> to scan ${esc(site.name)}, or tap another glowing spot on the map. Each scan uses one pass.`;
    return `<div class="row between wrap"><div><div class="eyebrow">Step 4 · Science operations</div><h2>${FACES.planet[m.planet]} Exploring ${esc(m.target)}</h2></div>
      <div class="row gap wrap"><span class="pill">🛰️ ${plural(r.passesLeft, 'pass')} left</span><span class="pill">📶 ${fmtPct(findingFrac())} of data home</span><span class="pill">🔭 ${plural(r.finds.length, 'discovery')}</span></div></div>
      <div class="todo ${allDone ? 'ok' : ''}"><span aria-hidden="true">👉</span><p>${sciRole ? todo : esc(holderName('sci')) + ' runs the science. Help them choose where to look.'}</p></div>
      <div class="explore-grid">
        <div class="card"><div class="planetmap" style="--pc:${planetColor(m.planet)}">
          <div class="nocov top" style="height:${band}%"></div><div class="nocov bot" style="height:${band}%"></div>${dots}</div>
          <p class="small muted">Glowing spots have something new to find. Your ${esc(lc1(orbit.name))} sees latitudes up to ${orbit.maxLat}°, and striped areas are out of view${r.d.lander ? ' (the lander can still go there)' : ''}.</p></div>
        <div class="card"><h3>${esc(site.name)} <span class="small muted">${Math.abs(site.lat)}° ${site.lat >= 0 ? 'N' : 'S'}</span></h3>
          <ul class="findlist">${rows}</ul>${last}
          <div class="row gap wrap">
            <button class="btn ${fresh[site.id] ? 'primary' : 'ghost'}" data-act="pass"${r.passesLeft > 0 && sciRole && fresh[site.id] ? '' : ' disabled'}>${fresh[site.id] || !r.passesLeft ? '🔭 Science pass here' : '🔭 Nothing new to scan here'}</button>
            ${canLand ? `<button class="btn ghost" data-act="land"${sciRole ? '' : ' disabled'}>🛬 Land here</button>` : ''}
            ${canTag ? `<button class="btn ghost" data-act="tag"${sciRole ? '' : ' disabled'}>🦾 Touch-and-go here</button>` : ''}
          </div>
          <h3 class="mt">⭐ Objectives</h3><ul class="objlist live">${objs}</ul></div></div>
      <div class="card"><h3>📜 Mission log</h3>${logHtml(r.log.slice(-6))}</div>
      <div class="row end"><button class="btn ${r.passesLeft && Object.values(fresh).some(Boolean) ? 'ghost' : 'primary big'}" data-act="finishExplore"${canAct('lead') ? '' : ' disabled'}>Finish science →</button></div>`;
  }
};
function planetColor(p) { return { earth: '#3d7bd9', moon: '#9aa0b4', asteroid: '#6b5a4e', mars: '#c8573a', ceruvia: '#9fd8ef' }[p] || '#888'; }

SCREENS.crisis = {
  html() {
    const r = S.run, x = r.crisis, cr = S.mission.crisis, p = crisisPower(), pw = canAct('pwr');
    const hrs = Math.max(0, x.battery) / Math.max(1, -p.net);
    const toggles = CRISIS_LOADS.map(L => `<button class="load${x.on[L.k] ? ' on' : ''}" data-act="crisisToggle" data-arg="${L.k}"${pw && !x.done ? '' : ' disabled'} aria-pressed="${x.on[L.k]}">
        <b>${L.icon} ${L.name}</b><span class="mono small">${Math.round(p.parts[L.k])} W · ${x.on[L.k] ? 'ON' : 'off'}</span><span class="small muted">${L.why}</span></button>`).join('');
    const unsent = x.packets - x.sent - x.lost;
    const fc = r.d.fuelcell ? `<button class="btn ghost" data-act="crisisFuelCell"${pw && !x.fcUsed && !x.done ? '' : ' disabled'}>🧪 ${x.fcUsed ? `Fuel cell running (${Math.round(x.fc)} Wh left)` : `Start the fuel cell (+${r.d.fuelcell} Wh)`}</button>` : '';
    return `<div class="narrow"><div class="card crisis"><div class="eyebrow">Emergency · ${esc(ROLES.pwr.name)}</div><h2>⚡ ${esc(cr.name)}!</h2><p>${esc(cr.text)}</p>
      ${x.done ? '' : `<p class="howto"><b>Your job:</b> keep the 🔋 battery above zero for ${cr.turns} turns. Switch systems off to save power, and switch the transmitter on when you can afford it to send data home.</p>`}
      <div class="crisis-stats">
        <div><span class="small muted">Turn</span><b class="mono">${Math.min(x.turn, cr.turns)} / ${cr.turns}</b></div>
        <div><span class="small muted">Making</span><b class="mono">${fmtW(p.gen)}</b></div>
        <div><span class="small muted">Using</span><b class="mono">${fmtW(p.load)}</b></div>
        <div><span class="small muted">Data waiting</span><b class="mono">${unsent} 📦 · ${x.sent} sent${x.lost ? ' · ' + x.lost + ' lost' : ''}</b></div></div>
      <div class="battery"><div class="row between"><b>🔋 Battery</b><span class="mono small">${Math.round(x.battery)} / ${Math.round(x.cap)} Wh${p.net < 0 && !x.done ? ` · lasts about ${hrs.toFixed(0)} h (${Math.floor(hrs / CRISIS_H)} turns)` : ''}</span></div>
        <div class="bar"><i style="width:${Math.round(x.battery / Math.max(1, r.d.batteryWh) * 100)}%" class="${x.battery / x.cap < 0.25 ? 'low' : ''}"></i></div></div>
      ${x.done ? `<div class="verdict ${r.crisisClean ? 'good' : 'bad'}"><h3>${x.dead ? 'Brownout' : r.crisisClean ? 'You rode out the storm!' : 'Survived, but data was lost'}</h3>
          <p>${x.sent} of ${x.packets} data packets reached Earth.${!x.dead && x.instAll ? ' The instruments recorded the whole storm.' : ''}</p></div>
        <div class="row end"><button class="btn primary" data-act="crisisDone"${pw ? '' : ' disabled'}>Continue →</button></div>`
      : `<p class="small"><b>Computer</b> stays on (${Math.round(p.parts.computer)} W). Tap a system to switch it, then end the turn.</p>
        <div class="loads">${toggles}</div>
        <div class="row gap wrap end">${fc}<button class="btn primary" data-act="crisisTurn"${pw ? '' : ' disabled'}>End turn (3 hours) ▶</button></div>
        ${pw ? '' : `<p class="small muted">${esc(holderName('pwr'))} is handling the emergency.</p>`}`}
      <h3>📜 Log</h3>${logHtml(x.log.slice(0, 6).map(t => ({ text: t, kind: /flat|erased|lost/.test(t) ? 'bad' : /Sent/.test(t) ? 'good' : 'info' })))}
    </div></div>`;
  }
};

// ---------- scoring ----------
function liveR(r) {
  r = r || S.run;
  const m = S.mission, tags = {}, sites = new Set();
  for (const f of r.finds) { tags[f.tag] = (tags[f.tag] || 0) + 1; if (f.site) sites.add(f.site); }
  return { found: new Set(r.finds.map(f => f.id)), tags, sitesWithFinds: sites.size,
    clueCount: m.clues.filter(c => tags[c.id]).length, landed: r.landed, tagOk: r.tagOk, capsuleLanded: r.capsuleLanded,
    crisisClean: r.crisisClean, dataReturned: findingFrac(r) };
}

function finalize() {
  const r = S.run, m = S.mission, c = r.c, R = liveR(r), frac = R.dataReturned;
  let sci = 0;
  for (const f of r.finds) {
    let pts = f.pts * (f.mult == null ? 1 : f.mult) * r.sciMult * c.duty;
    if (f.inst === 'sampler') pts *= m.needReturn && !r.capsuleLanded ? 0 : 1;   // samples count only if they get home
    else pts *= frac;
    sci += pts;
  }
  const lab = m.sampleLab && r.tagOk && r.capsuleLanded ? m.sampleLab.pts : 0;
  const science = Math.round(sci + lab + r.bonusSci);
  const objectives = m.objectives.map(o => ({ id: o.id, text: o.text, ok: !!o.check(R) }));
  const stars = objectives.filter(o => o.ok).length;
  const piloting = Object.values(r.scores).reduce((s, x) => s + x, 0);
  const dataPts = Math.round(frac * 50);
  const left = c.budgetLeft - r.extraCost;
  const budgetPts = isFinite(c.budget) ? clamp(Math.round(left / c.budget * 400), 0, 100) : 0;
  const goalPts = objectives.some(o => o.ok && o.id === r.plan.goal) ? 100 : 0;
  const total = science + stars * 100 + piloting + dataPts + budgetPts + goalPts;
  r.result = { science, lab, stars, objectives, piloting, dataPts, budgetPts, goalPts, total, frac };

  const prev = S.campaign.done[m.id];
  const best = !prev || total > prev.score;
  S.campaign.done[m.id] = { score: Math.max(total, prev ? prev.score : 0), stars: Math.max(stars, prev ? prev.stars : 0), diff: S.difficulty };
  if (stars > 0) S.campaign.unlocked = Math.max(S.campaign.unlocked, Math.min(MISSIONS.length, m.num + 1));
  r.result.best = best;
  boardAdd({ n: S.myName || 'Crew', m: m.id, s: total, st: stars, d: S.difficulty, t: Date.now() });
  saveCampaign();
  go('report');
  if (stars) { SFX.win(); FX.confetti(stars * 60); }
}

const OBJ_HINTS = {
  regions: 'Visit three different sites with a camera. A low tilted orbit only sees the tropics, which is fine here.',
  climate: 'Carry the infrared spectrometer and scan two different sites.',
  poles: 'Only a polar orbit flies over the ice sheets. Pair it with a camera or the infrared spectrometer.',
  signal: 'Carry the radio receiver, or land the lander on the far side.',
  water: 'Look where water hides: dark polar craters, clays and buried ice. Infrared, radar or a lander can find it.',
  land: 'Bring the lander and fly it down gently. Use your retries.',
  tag: 'Bring the sample arm and touch down on smooth ground.',
  home: 'Bring a capsule, keep enough fuel for the trip home, and hold the reentry corridor.',
  ice: 'Ground-penetrating radar over Arcadia or the south pole finds buried ice. So does a lander at Arcadia.',
  storm: 'An RTG, the big battery or a fuel cell keeps the spacecraft running in the dark.',
  habit: 'Each clue needs a different instrument. Mix cameras, radar, the magnetometer, spectrometers and a lander.'
};

function analysis(r) {
  const c = r.c, out = [], res = r.result;
  if (res.frac < 0.9) out.push(`Only ${fmtPct(res.frac)} of your data reached Earth. A bigger dish or more ground-station time would have doubled the value of what you found.`);
  if (c.duty < 0.99) out.push(`Power was short, so instruments ran only ${fmtPct(c.duty)} of the time. More solar area or an RTG would fix that.`);
  if (r.passesLeft > 0) out.push(`You finished with ${plural(r.passesLeft, 'science pass')} unused. Every pass is a chance for another discovery.`);
  if (r.broken.length) out.push(`Debris broke ${plural(r.broken.length, 'part')} on the way. A debris shield, or smaller solar wings, would help.`);
  if (isFinite(c.budget) && c.budgetLeft > c.budget * 0.35) out.push(`You had ${fmtM(c.budgetLeft)} left over. Spending some on another instrument or a better antenna could earn more science.`);
  if (!out.length) out.push('A well-balanced mission. Try a harder difficulty, or a different prime goal.');
  return out;
}

// ---------- report and finale ----------
SCREENS.report = {
  html() {
    const r = S.run, m = S.mission, res = r.result;
    if (!res) return '<p>No report yet.</p>';
    const next = MISSIONS[m.num];
    const reals = REAL_MISSIONS.filter(x => { try { return x.match({ m, d: derive(r.build), plan: r.plan }); } catch (e) { return false; } });
    const row = (k, v, note) => `<tr><td>${k}${note ? `<br><span class="small muted">${note}</span>` : ''}</td><td class="mono">${v}</td></tr>`;
    return `<div class="narrow"><div class="eyebrow">Step 5 · Mission report</div><h2>${FACES.planet[m.planet]} ${esc(m.name)}: ${res.stars ? 'mission complete' : 'mission over'}</h2>
      <div class="card report-top"><div class="report-planet">${planetSvg(m.planet, res.stars >= 2 ? 'happy' : res.stars ? 'meh' : 'sad')}</div>${S.patch ? patchImg('big') : ''}<div class="bigstars">${starsHtml(res.stars)}</div><div class="total mono">${res.total} pts</div>
        ${res.best ? '<span class="pill">New best!</span>' : ''}
        <div class="row gap wrap report-next">${m.num === 5 && res.stars ? '<button class="btn primary big" data-act="toFinale">🎉 The finale</button>' : next && res.stars ? `<button class="btn primary big" data-act="nextMission">Next mission: ${esc(next.name)} →</button>` : '<button class="btn primary big" data-act="retryMission">↻ Try again</button>'}
          ${res.stars && res.stars < 3 ? '<button class="btn ghost" data-act="retryMission">↻ Fly it again for more stars</button>' : ''}</div>
        <p class="small muted">${res.stars ? (next && m.num < 5 ? `You unlocked mission ${next.num}. ` : '') + (res.stars < 3 ? 'The hints below show how to earn the stars you missed.' : 'All three stars. Superb!') : 'You need at least one star to unlock the next mission. The hints below show how.'}</p></div>
      ${res.stars ? `<div class="dialog">${m.outro.map(([w, t]) => crewLine(w, t)).join('')}</div>` : `<div class="dialog">${crewLine('ollie', 'No stars this time, but every crash is data. Read the hints below and try again.')}</div>`}
      <div class="card"><h3>⭐ Objectives</h3><ul class="objlist">${res.objectives.map(o => `<li class="${o.ok ? 'good' : 'bad'}">${o.ok ? '★' : '☆'} ${esc(o.text)}${o.id === r.plan.goal ? ' <span class="pill">Prime goal</span>' : ''}
        ${o.ok ? '' : `<br><span class="small muted">Hint: ${esc(OBJ_HINTS[o.id] || GOAL_NEEDS[o.id].why)}</span>`}</li>`).join('')}</ul></div>
      <div class="card"><h3>🧮 Score</h3><table class="score">
        ${row('Science', res.science, `${plural(r.finds.length, 'discovery')} × ${fmtPct(res.frac)} of data home${res.lab ? ' + lab bonus ' + res.lab : ''}`)}
        ${row('Objectives', res.stars * 100, '100 per star')}
        ${row('Piloting', res.piloting, Object.entries(r.scores).map(([k, v]) => GAMES[k].title + ' ' + v).join(' · '))}
        ${row('Data home', res.dataPts, 'up to 50')}
        ${row('Budget left', res.budgetPts, isFinite(r.c.budget) ? fmtM(r.c.budgetLeft - r.extraCost) + ' unspent' : 'Sandbox')}
        ${row('Prime goal', res.goalPts, res.goalPts ? 'met' : 'missed')}
        <tr class="tot"><td>Total</td><td class="mono">${res.total}</td></tr></table></div>
      <div class="card"><h3>💡 What to try next</h3><ul>${analysis(r).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><h3>📜 What happened</h3>${logHtml(r.log)}</div>
      ${reals.length ? `<div class="card"><h3>🛰️ Real missions like yours</h3>${reals.map(x => `<p><b>${esc(x.name)}</b> <span class="small muted">(launched ${x.year})</span><br>${esc(x.fact)}</p>`).join('')}</div>` : ''}
      <div class="card"><h3>🏆 Leaderboard: ${esc(m.name)}</h3>${boardHtml(m.id)}</div>
      <div class="row gap wrap end"><button class="btn ghost" data-act="toMap">Mission control</button><button class="btn ghost" data-act="retryMission">Fly it again</button>
        ${m.num === 5 && res.stars ? '<button class="btn primary" data-act="toFinale">🎉 The finale</button>' : next && res.stars ? `<button class="btn primary" data-act="nextMission">Next: ${esc(next.name)} →</button>` : ''}</div></div>`;
  }
};

SCREENS.finale = {
  html() {
    const total = MISSIONS.reduce((s, m) => s + ((S.campaign.done[m.id] || {}).score || 0), 0);
    return `<div class="narrow"><div class="card finale"><div class="eyebrow">Campaign complete</div><h1 class="game-title">The last signal, answered</h1>
      <p class="lede">Five missions, from a little Earth satellite to an ocean world 1.4 billion km away.</p>
      <div class="dialog">${MISSIONS[4].outro.map(([w, t]) => crewLine(w, t)).join('')}</div>
      <p class="mono">${totalStars()} / 15 stars · ${total} points across the campaign</p>
      <p class="credit-roll">🔭 Made with love by <b>Team Hubble Huddle</b> for the NASA Space Apps Challenge. Thanks for flying with us!</p>
      <p class="muted">Want more? Try every prime goal, a harder difficulty, or Sandbox with every part unlocked.</p>
      <div class="row gap end wrap"><button class="btn ghost" data-act="toSetup">Change difficulty</button><button class="btn primary" data-act="toMap">Mission control</button></div></div></div>`;
  }
};

// ---------- leaderboard (this device only) ----------
const BOARD_KEY = 'ceruvia-board-v2';
function boardLoad() { try { const b = JSON.parse(store.get(BOARD_KEY) || '[]'); return Array.isArray(b) ? b : []; } catch (e) { return []; } }
function boardAdd(e) { const b = boardLoad(); b.push(e); b.sort((a, x) => x.s - a.s); store.set(BOARD_KEY, JSON.stringify(b.slice(0, 60))); }
function boardHtml(missionId) {
  const list = boardLoad().filter(e => !missionId || e.m === missionId).slice(0, 8);
  if (!list.length) return '<p class="small muted">No flights yet. Yours will be the first.</p>';
  return `<table class="board">${list.map((e, i) => { const m = MISSIONS.find(x => x.id === e.m);
    return `<tr><td>${i + 1}</td><td>${esc(e.n)}</td>${missionId ? '' : `<td class="small">${m ? esc(m.name) : ''}</td>`}<td>${starsHtml(e.st)}</td><td class="mono">${e.s}</td><td class="small muted">${DIFF[e.d] ? esc(DIFF[e.d].label) : ''}</td></tr>`; }).join('')}</table>`;
}

// ---------- design codes ----------
function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
function encodeDesign() {
  const p = S.plan;
  return 'LS1-' + b64urlEncode(JSON.stringify({ m: S.mission.id, b: S.build.bus, s: S.build.slots,
    p: { lv: p.lv, traj: p.traj, orbit: p.orbit, fuel: Math.round(p.fuel), opsMonths: p.opsMonths, ground: p.ground } }));
}
function decodeDesign(code) {
  try {
    const o = JSON.parse(b64urlDecode(String(code).trim().replace(/^LS1-/, '')));
    const m = MISSIONS.find(x => x.id === o.m);
    if (!m || !BUSES[o.b]) return null;
    const build = emptyBuild(o.b);
    for (const t of SLOT_TYPES) (o.s[t] || []).slice(0, build.slots[t].length).forEach((id, i) => {
      if (id && PARTS[id] && PARTS[id].slot === t) build.slots[t][i] = id;
    });
    const p = o.p || {};
    const plan = Object.assign(defaultPlan(m), {
      lv: LAUNCHERS[p.lv] ? p.lv : 'condor', traj: m.trajs[p.traj] ? p.traj : Object.keys(m.trajs)[0],
      orbit: m.orbits[p.orbit] ? p.orbit : Object.keys(m.orbits)[0], fuel: clamp(+p.fuel || 0, 0, FUEL_CAP),
      opsMonths: clamp(+p.opsMonths || m.ops[2], m.ops[0], m.ops[1]), ground: GROUND[p.ground] ? p.ground : 'network', manualFuel: true });
    return { m, build, plan };
  } catch (e) { return null; }
}

// ---------- actions ----------
const ACT = {
  closeModal() { closeModal(); },
  modalNext() { const cb = modalCb; closeModal(); if (cb) cb(); },
  eventChoice(i) {
    if (!pendingEvent) return;
    const { ev, next } = pendingEvent; pendingEvent = null;
    closeModal();
    eventOutcome(ev, ev.choices[+i].apply(S.run), next);
  },
  home() { go('title'); },
  toggleMute() { SFX.toggle(); renderTopbar(); },
  openHandbook() { const d = $('#drawer'); d.innerHTML = handbookHtml(); d.hidden = false; const b = d.querySelector('button'); if (b) b.focus(); },
  closeHandbook() { const d = $('#drawer'); d.hidden = true; d.innerHTML = ''; },
  explain(k) { const e = EXPLAIN[k]; showModal(`<h3>${e.icon} ${e.title}</h3><p>${e.text}</p><p class="small"><b>Tip:</b> ${e.fix}</p><div class="row end"><button class="btn primary" data-act="closeModal">Got it</button></div>`); },

  // title, setup, map
  newGame() { if (hasProgress()) confirmModal('Start a new campaign?', 'This clears your stars and saved designs on this device. The leaderboard stays.', 'confirmNew', 'Start over'); else go('setup'); },
  confirmNew() { closeModal(); S.campaign = { done: {}, unlocked: 1 }; S.builds = {}; S.trades = {}; saveCampaign(); go('setup'); },
  continueGame() { go('map'); },
  setDiff(k) { if (!DIFF[k]) return; S.difficulty = k; saveCampaign(); rerender(); },
  startCampaign() { saveCampaign(); go('map'); },
  toSetup() { go('setup'); },
  toMap() { if (S.screen === 'hangar') saveBuild(); go('map'); },
  pickMission(id) {
    const m = MISSIONS.find(x => x.id === id);
    if (!m) return;
    if (!isUnlockedMission(m)) { SFX.deny(); toast('Earn a star on mission ' + (m.num - 1) + ' first.'); return; }
    prepareMission(m); go('briefing');
  },
  resetSave() { confirmModal('Reset all progress?', 'This deletes your stars, saved designs and leaderboard on this device.', 'confirmReset', 'Reset'); },
  confirmReset() { closeModal(); store.del(SAVE_KEY); store.del(BOARD_KEY); S.campaign = { done: {}, unlocked: 1 }; S.builds = {}; S.trades = {}; go('title'); },
  toFinale() { go('finale'); },

  // briefing and goal
  dlgNext() { S.dlg++; rerender(); },
  dlgSkip() { S.dlg = S.mission.intro.length - 1; rerender(); },
  toGoal() { go('goal'); },
  setGoal(id) {
    if (!canAct('lead')) { toast(waitFor('lead') + ' to choose the goal.'); return; }
    S.plan.goal = id; syncFuel(); saveBuild(); go('hangar');
  },
  toHangar() { go('hangar'); },

  // hangar
  tab(k) { S.hangarTab = k; rerender(); },
  tapPart(id) { autoPlace(id); },
  removePart(arg) { const [t, i] = arg.split(':'); removePart(t, +i); },
  setBus(k) {
    if (!busUnlocked(k, S.mission, S.difficulty) || S.build.bus === k) return;
    const dropped = resizeBuild(S.build, k);
    if (dropped.length) toast('Removed to fit: ' + dropped.map(id => PARTS[id].short).join(', '));
    syncFuel(); saveBuild(); refreshHangar(true);
  },
  toggleAdv() { S.showAdv = !S.showAdv; refreshHangar(); },
  setPaint(k) { if (!PAINTS.some(p => p.id === k)) return; S.paint = k; savePatch(); saveCampaign(); rerender(); },
  patchTool(k) { PATCH.tool = k; rerender(); },
  patchColor(c) { PATCH.color = c; if (PATCH.tool === 'eraser' || PATCH.tool === 'stamp') PATCH.tool = 'brush'; rerender(); },
  patchSize(n) { PATCH.size = +n; rerender(); },
  patchStamp(s) { PATCH.stamp = s; PATCH.tool = 'stamp'; rerender(); },
  patchUndo() { patchUndo(); },
  patchClear() { patchClear(); },
  tradeSave() { tradeSave(); },
  coachFix(arg) { coachFix(arg); },
  startTour() { startTour(); },
  tourNext() { tourNext(); },
  tourSkip() { endTour(); },
  tradeLoad(i) { tradeLoad(i); },
  tradeDel(i) { tradeDel(i); },
  autoBuild() {
    if (allParts(S.build).length) confirmModal('Build it for me?', 'This replaces your current design with a simple one that passes the review and meets your prime goal. You can change it afterwards.', 'doAutoBuild', 'Yes, build it');
    else ACT.doAutoBuild();
  },
  doAutoBuild() {
    closeModal();
    const r = recommendBuild(S.mission, S.plan.goal, S.difficulty, bonusBudget());
    if (!r) { toast('No simple design fits this goal. Try another goal.'); return; }
    S.build = r.build;
    S.plan = Object.assign({}, r.plan, { goal: S.plan.goal, manualFuel: false });
    saveBuild(); rerender();
    toast('Built! Check the meters, then press Launch review.');
  },
  setLv(k) { if (!canAct('lead') || !LAUNCHERS[k]) return; S.plan.lv = k; syncFuel(); saveBuild(); rerender(); },
  setOrbit(k) { if (!canAct('lead') || !S.mission.orbits[k]) return; S.plan.orbit = k; syncFuel(); saveBuild(); rerender(); },
  setGround(k) { if (!canAct('lead') || !GROUND[k]) return; S.plan.ground = k; saveBuild(); rerender(); },
  setTraj(k) { if (!canAct('lead') || !S.mission.trajs[k]) return; S.plan.traj = k; syncFuel(); saveBuild(); rerender(); },
  fillFuel() { if (!canAct('prop')) return; S.plan.fuel = autoFuel(S.build, S.plan, S.mission, S.difficulty, bonusBudget()); saveBuild(); rerender(); },
  toReview() { saveBuild(); go('review'); },
  welcomeCoach() { closeModal(); const el = document.getElementById('coach'); if (el) { el.classList.add('pulse'); el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); } },
  welcomeAuto() { closeModal(); ACT.doAutoBuild(); },
  welcomeTour() { closeModal(); startTour(); },
  shareCode() {
    showModal(`<h3>Design code</h3><p class="small muted">Copy this and send it to a friend. They can load it from Mission control.</p>
      <textarea class="code" readonly rows="4" id="codeOut">${esc(encodeDesign())}</textarea>
      <div class="row gap end"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn primary" data-act="copyCode">Copy</button></div>`);
  },
  copyCode() {
    const t = $('#codeOut'); if (!t) return;
    t.select();
    const done = () => toast('Copied!');
    if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, () => { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  },
  loadCode() {
    showModal(`<h3>Load a design code</h3><textarea class="code" rows="4" id="codeIn" placeholder="LS1-..." aria-label="Design code"></textarea>
      <div class="row gap end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="applyCode">Load</button></div>`);
  },
  applyCode() {
    const t = $('#codeIn'), d = t && decodeDesign(t.value);
    if (!d) { toast("That code doesn't look right."); return; }
    if (!isUnlockedMission(d.m)) { toast('That design is for a mission you have not unlocked yet.'); return; }
    closeModal();
    const goal = S.mission === d.m && S.plan ? S.plan.goal : null;
    prepareMission(d.m);
    S.build = d.build; S.plan = Object.assign(d.plan, { goal });
    for (const id of allParts(S.build)) if (!isUnlocked(id, d.m, S.difficulty)) S.build.slots[PARTS[id].slot] = S.build.slots[PARTS[id].slot].map(x => x === id ? null : x);
    saveBuild();
    go(goal ? 'hangar' : 'goal');
    toast('Design loaded.');
  },

  // review and flight
  launch() {
    const c = C();
    if (review(S.build, S.plan, S.mission, c).some(i => i.level === 'block')) { SFX.deny(); toast('Fix the red items first.'); return; }
    startRun();
  },
  gameGo() { gameBegin(); },
  gameRetry() { if (S.retriesLeft <= 0 || !S.game) return; S.retriesLeft--; S.game.result = null; S.game.state = null; gameBegin(); },
  scanHit() { scanPress(); },
  scanAuto() { scanFinish(1, -1); },
  gameDone() { const g = S.game; if (!g || !g.result) return; S.game = null; g.onDone(g.result); },

  // exploring
  selSite(id) { S.selSite = id; rerender(); },
  pass() {
    if (!canAct('sci') || !S.run || S.run.passesLeft <= 0) return;
    const here = S.mission.sites.find(x => x.id === S.selSite);
    if (here && !siteNew(here)) { toast('Nothing new to find here. Pick a glowing spot.'); return; }
    const site = S.selSite, d = S.run.d;   // capture before the async scan
    runScan({ tol: DIFF[S.difficulty].tol, precise: !!(d.adcs && d.adcs.spare) }, (mult, hits) => doPass(site, mult, hits));
  },
  land() { if (!canAct('sci')) return; runStep('doLanding', S.selSite); },
  tag() { if (!canAct('sci')) return; runStep('doTag', S.selSite); },
  finishExplore() {
    if (!canAct('lead')) return;
    if (S.run.passesLeft > 0) confirmModal('Finish science?', `You still have ${plural(S.run.passesLeft, 'science pass')}. Unused passes are wasted.`, 'confirmFinish', 'Finish anyway');
    else finishExplore();
  },
  confirmFinish() { closeModal(); finishExplore(); },
  crisisToggle(k) { const x = S.run && S.run.crisis; if (!canAct('pwr') || !x || x.done || !(k in x.on)) return; x.on[k] = !x.on[k]; rerender(); },
  crisisFuelCell() { const x = S.run.crisis; if (!canAct('pwr') || x.fcUsed || !S.run.d.fuelcell) return; x.fcUsed = true; x.fc = S.run.d.fuelcell; x.log.unshift('Fuel cell started.'); rerender(); },
  crisisTurn() { if (!canAct('pwr')) return; crisisNextTurn(); },
  crisisDone() { if (!canAct('pwr') || !S.run.crisisDone) return; finishExplore(); },

  // report
  retryMission() { prepareMission(S.mission); go('hangar'); },
  nextMission() { const n = MISSIONS[S.mission.num]; if (n) { prepareMission(n); go('briefing'); } }
};

// ---------- inputs ----------
const INPUT = {
  myName(v) { S.myName = v.slice(0, 16); store.set('ceruvia-myname', S.myName); },
  shipName(v, el, done) { S.shipName = v.slice(0, 20); drawRing(); if (done) { savePatch(); saveCampaign(); } },
  fuel(v, el, done) {
    if (!canAct('prop')) return;
    S.plan.fuel = clamp(+v || 0, 0, FUEL_CAP); S.plan.manualFuel = true;
    const t = $('#fuelVal'); if (t) t.textContent = fmtKg(S.plan.fuel);
    const mt = $('#meters'); if (mt) mt.innerHTML = metersHtml(C());
    if (done) { saveBuild(); refreshHangar(); }
  },
  opsMonths(v, el, done) {
    if (!canAct('lead')) return;
    S.plan.opsMonths = clamp(Math.round(+v), S.mission.ops[0], S.mission.ops[1]);
    const c = C(), t = $('#opsVal'); if (t) t.textContent = S.plan.opsMonths + ' months · ' + plural(c.passes, 'pass');
    const mt = $('#meters'); if (mt) mt.innerHTML = metersHtml(c);
    if (done) { saveBuild(); refreshHangar(); }
  }
};

// ---------- global listeners ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    const m = $('#modal');
    if (e.target === m && !m.dataset.locked) closeModal();
    return;
  }
  if (el.disabled || el.getAttribute('aria-disabled') === 'true' && el.dataset.act !== 'pickMission') return;
  SFX.unlock();
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); SFX.click(); fn(el.dataset.arg, el, e); }
});
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.input; if (k && INPUT[k]) INPUT[k](e.target.value, e.target, false); });
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.input; if (k && INPUT[k]) INPUT[k](e.target.value, e.target, true); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const d = $('#drawer'), m = $('#modal');
  if (tourState) endTour();
  else if (!d.hidden) ACT.closeHandbook();
  else if (!m.hidden && !m.dataset.locked) closeModal();
});

SCREENS.game = SCREENS_GAME;

// ---------- start ----------
loadCampaign();
S.myName = store.get('ceruvia-myname') || '';
FX.start();
render();
