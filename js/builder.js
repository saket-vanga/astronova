/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* The hangar. Step 2 adds only unlocks and Auto-build; the drag-and-drop hangar arrives in step 4. */

// Expert parts: hidden from beginners until they ask, and never used by Auto-build on Beginner.
const ADVANCED = ['ion', 'chemHi', 'adcsPrecise', 'compRad', 'fuelcell', 'rec2t', 'ka', 'mspec', 'solarX'];

function isUnlocked(id, m, diffKey) {
  const p = PARTS[id];
  return !!p && (DIFF[diffKey].allOpen || (p.unlock || 1) <= m.num);
}
function busUnlocked(key, m, diffKey) {
  return DIFF[diffKey].allOpen || (BUSES[key].unlock || 1) <= m.num;
}

// Build the slots of a design from flat lists.
function makeBuild(busKey, parts) {
  const b = emptyBuild(busKey), n = slotCounts(busKey), used = {};
  for (const id of parts) {
    const t = PARTS[id].slot, i = used[t] || 0;
    if (i >= n[t]) return null;            // does not fit this bus
    b.slots[t][i] = id; used[t] = i + 1;
  }
  return b;
}

/* Auto-build: a simple design that passes the review and meets the prime goal,
   leaving room to earn more stars. Tries every orbit, route and bus, fills the
   rest greedily, and keeps the cheapest design with the fewest warnings. */
function recommendBuild(m, goal, diffKey, bonus) {
  goal = goal || (typeof S !== 'undefined' && S.plan && S.plan.goal) || m.objectives[0].id;
  diffKey = diffKey || (typeof S !== 'undefined' && S.difficulty) || 'rookie';
  bonus = bonus || 0;
  const simple = !!DIFF[diffKey].simple;
  const can = id => isUnlocked(id, m, diffKey) && !(simple && ADVANCED.includes(id));
  const byCost = (a, b) => PARTS[a].cost - PARTS[b].cost;
  const sciSlots = ['bay', 'top', 'bottom'];
  let best = null;

  for (const orbitKey of Object.keys(m.orbits)) for (const trajKey of Object.keys(m.trajs)) for (const busKey of Object.keys(BUSES)) {
    if (!busUnlocked(busKey, m, diffKey)) continue;
    const bus = BUSES[busKey];
    const plan = { lv: 'leviathan', traj: trajKey, orbit: orbitKey, fuel: 0, manualFuel: false, opsMonths: m.ops[2], ground: 'network', goal };
    const orbit = m.orbits[orbitKey];

    // Core avionics and power storage
    const core = ['compStd', 'adcsBasic', 'rec256'];
    if (orbit.radRisk >= 0.02 && can('compRad')) core[0] = 'compRad';
    core.push(m.crisis && can('batL') ? 'batL' : 'batS');
    if (m.hazard > 0 && core.length < bus.core) core.push('shield');
    if (core.length > bus.core) continue;

    // Science: add goal parts cheapest-first until the goal is met, then prune extras.
    const top = m.needReturn && can('capsule') ? ['capsule'] : [];
    let sci = [];
    const isCand = id => can(id) && sciSlots.includes(PARTS[id].slot) && !top.includes(id);
    const goalCands = goalParts(m, goal).filter(isCand).sort(byCost);
    const cands = goalCands.concat(Object.keys(PARTS).filter(id => isCand(id) && !goalCands.includes(id)).sort(byCost));
    const test = list => {
      const b = makeBuild(busKey, ['chem', 'lga', ...core, ...top, ...list]);
      return b && goalStatus(b, plan, m, goal).ok;
    };
    // Prefer one part that meets the goal on its own; otherwise add the next candidate and keep going.
    while (!test(sci)) {
      const fits = cands.filter(id => !sci.includes(id) && makeBuild(busKey, ['chem', ...top, ...sci, id]));
      if (!fits.length) break;
      sci.push(fits.find(id => test([...sci, id])) || fits[0]);
    }
    if (!test(sci)) continue;
    for (const id of sci.slice().reverse()) { const less = sci.filter(x => x !== id); if (test(less)) sci = less; }
    if (!sci.some(id => PARTS[id].inst) && !sci.includes('lander')) {
      const cam = ['wac', 'mag', 'irs'].find(id => can(id) && canSee(id, m.sites[0], orbit));
      if (cam) sci.push(cam);
    }

    // Antenna: the cheapest that sends at least 90% of the data home.
    const instData = sci.filter(id => PARTS[id].inst).reduce((s, id) => s + PARTS[id].data, 0) * orbit.dataFactor;
    const ants = ['lga', 'mga', 'hga', 'ka'].filter(can);
    const ant = ants.find(a => PARTS[a].rate * 28.8 * m.comm >= 0.9 * instData) || ants[ants.length - 1];

    // Power: add side parts until there is 15% spare.
    const preferRtg = can('rtg') && (m.au > 3 || (m.crisis && goal === 'storm'));
    const side = [];
    let build = null, c = null;
    for (let i = 0; i <= bus.side; i++) {
      build = makeBuild(busKey, ['chem', ant, ...core, ...top, ...sci, ...side]);
      if (!build) break;
      plan.fuel = autoFuel(build, plan, m, diffKey, bonus);
      c = calc(build, plan, m, diffKey, bonus);
      if (c.powerMargin >= 0.15 && c.batteryOk) break;
      if (i === bus.side) { build = null; break; }
      const opts = (preferRtg ? ['rtg', 'solarL'] : ['solarS', 'solarL', 'rtg']).filter(can);
      const need = c.load * 1.15 - c.avgGen;
      const watt = id => PARTS[id].watts ? rtgAt(1, c.cruise) : solarAt(PARTS[id].kw, m.au) * (1 - orbit.eclipse);
      side.push(opts.find(id => watt(id) >= need) || opts.reduce((a, b) => watt(b) > watt(a) ? b : a));
    }
    if (!build) continue;

    // Rocket: the cheapest one it fits on.
    const lvKey = Object.keys(LAUNCHERS).sort((a, b) => LAUNCHERS[a].cost - LAUNCHERS[b].cost)
      .find(k => { plan.lv = k; return calc(build, plan, m, diffKey, bonus).massMargin >= 0.03; });
    if (!lvKey) continue;
    plan.lv = lvKey;
    c = calc(build, plan, m, diffKey, bonus);
    const items = review(build, plan, m, c);
    if (items.some(i => i.level === 'block') || !goalStatus(build, plan, m, goal).ok) continue;
    const score = items.filter(i => i.level === 'warn').length * 100 + c.cost;
    if (!best || score < best.score) best = { score, build, plan: Object.assign({}, plan) };
  }
  return best && { build: best.build, plan: best.plan };
}

// ---------- hangar (basic version; drag and drop, paint and compare arrive in build step 4) ----------
const SLOT_LABEL = { engine: 'Engine', antenna: 'Antenna', top: 'Top mount', bottom: 'Bottom mount', side: 'Side mounts', bay: 'Instrument bays', core: 'Internal slots' };
const SLOT_HINT = { engine: 'engines', antenna: 'antennas', top: 'the return capsule', bottom: 'the lander', side: 'solar wings and RTGs', bay: 'instruments and the sample arm', core: 'batteries, computers, pointing, recorders and shields' };

function isSimple() { return !!DIFF[S.difficulty].simple; }
function partVisible(id) { return isUnlocked(id, S.mission, S.difficulty) && (S.showAdv || !isSimple() || !ADVANCED.includes(id)); }

// Why a part cannot go in a slot, or '' if it can.
function placeProblem(id, type, idx) {
  const p = PARTS[id];
  if (!isUnlocked(id, S.mission, S.difficulty)) return 'Locked until mission ' + p.unlock + '.';
  if (p.slot !== type) return p.name + ' goes in ' + SLOT_LABEL[p.slot].toLowerCase() + '.';
  if (!canAct(CAT_ROLE[p.cat])) return holderName(CAT_ROLE[p.cat]) + ' owns ' + p.cat + ' parts.';
  if (p.kind) {
    const clash = allPartsWithPos(S.build).find(x => PARTS[x.id].kind === p.kind && !(x.type === type && x.idx === idx));
    if (clash) return 'Only one ' + p.kind + ' per spacecraft. Remove the ' + PARTS[clash.id].name.toLowerCase() + ' first.';
  }
  return '';
}
function canPlace(id, type, idx) { return !placeProblem(id, type, idx); }
function allPartsWithPos(build) {
  const out = [];
  for (const t of SLOT_TYPES) build.slots[t].forEach((id, i) => { if (id) out.push({ id, type: t, idx: i }); });
  return out;
}

function place(id, type, idx) {
  const why = placeProblem(id, type, idx);
  if (why) { SFX.deny(); toast(why); return false; }
  S.build.slots[type][idx] = id;
  SFX.place();
  afterDesignChange();
  return true;
}
// Tap to place: the first empty slot of the right type. Single mounts and unique kinds swap in place.
function autoPlace(id) {
  const p = PARTS[id], arr = S.build.slots[p.slot];
  if (p.kind) {
    const same = allPartsWithPos(S.build).find(x => PARTS[x.id].kind === p.kind);
    if (same) { if (same.id === id) { toast('Already fitted.'); return false; } return place(id, same.type, same.idx); }
  }
  let i = arr.indexOf(null);
  if (i < 0 && arr.length === 1) i = 0;
  if (i < 0) { SFX.deny(); toast('No free ' + SLOT_LABEL[p.slot].toLowerCase().replace(/s$/, '') + '. Remove a part or pick a bigger bus.'); return false; }
  return place(id, p.slot, i);
}
function removePart(type, idx) {
  const id = S.build.slots[type][idx];
  if (!id) return;
  if (!canAct(CAT_ROLE[PARTS[id].cat])) { toast(holderName(CAT_ROLE[PARTS[id].cat]) + ' owns that part.'); return; }
  S.build.slots[type][idx] = null;
  afterDesignChange();
}
function afterDesignChange() { syncFuel(); saveBuild(); refreshHangar(); }

// Beginner mode fills the fuel tank automatically unless the player has moved the slider.
function syncFuel() {
  if (!S.mission || !S.plan) return;
  if (isSimple() && !S.plan.manualFuel) S.plan.fuel = autoFuel(S.build, S.plan, S.mission, S.difficulty, bonusBudget());
}

// ---------- meters ----------
function dashMeters(c) {
  const d = c.d, lvl = (bad, warn) => bad ? 'bad' : warn ? 'warn' : 'ok';
  const fill = x => Math.max(0, Math.min(1, x));
  return [
    { key: 'mass', label: 'Mass', value: fmtKg(c.wet) + ' / ' + fmtKg(c.capacity), fill: fill(c.wet / c.capacity), level: lvl(c.massMargin < 0, c.massMargin < 0.1) },
    { key: 'fuel', label: 'Fuel', value: d.engine ? fmtKg(c.fuel) + ' / ' + fmtKg(c.fuelReq) + ' needed' : 'No engine', fill: c.fuelReq ? fill(c.fuel / c.fuelReq / 1.3) : 1,
      level: d.engine ? lvl(c.fuelMargin < 0, c.fuelMargin < 0.05) : 'bad' },
    { key: 'power', label: 'Power', value: fmtW(c.avgGen) + ' made · ' + fmtW(c.load) + ' used', fill: c.load ? fill(c.avgGen / c.load / 2) : 0,
      level: lvl(c.powerMargin < 0 || !(d.solarKw || d.rtg), c.powerMargin < 0.15 || !c.batteryOk) },
    { key: 'budget', label: 'Budget', value: fmtM(c.cost) + ' / ' + fmtM(c.budget), fill: isFinite(c.budget) ? fill(c.cost / c.budget) : 0.1,
      level: lvl(c.budgetLeft < 0, isFinite(c.budget) && c.budgetLeft < c.budget * 0.05) },
    { key: 'data', label: 'Data', value: d.antenna ? fmtPct(c.dataRatio) + ' gets home' : 'No antenna', fill: fill(c.dataRatio),
      level: d.antenna && c.ground ? lvl(c.dataRatio < 0.6, c.dataRatio < 0.9) : 'bad' },
    { key: 'time', label: 'Time', value: c.cruise ? c.cruise.toFixed(1) + ' yr trip' + (S.mission.window ? ' · limit ' + S.mission.window : '') : 'Straight to orbit',
      fill: S.mission.window ? fill(c.cruise / S.mission.window) : fill(c.cruise / 8), level: lvl(!c.arrivalOk, S.mission.window && c.cruise > S.mission.window * 0.9) }
  ];
}
function meter(mt) {
  const ex = EXPLAIN[mt.key];
  return `<div class="meter ${mt.level}"><div class="row"><b>${ex.icon} ${mt.label}</b><span class="mono small">${mt.value}</span>
    <button class="qbtn" data-act="explain" data-arg="${mt.key}" aria-label="What is ${mt.label}?">?</button></div>
    <div class="bar"><i style="width:${Math.round(mt.fill * 100)}%"></i></div>${mt.level !== 'ok' ? `<div class="fix small">${ex.fix}</div>` : ''}</div>`;
}
function metersHtml(c) { return dashMeters(c).map(meter).join(''); }

// ---------- shelf and ship ----------
function partChip(id, extra) {
  const p = PARTS[id], st = CAT_STYLE[p.cat];
  return `<span class="chip" style="--cat:${st.color}">${st.icon} ${esc(p.short)}${extra || ''}</span>`;
}
function partStats(p) {
  const s = [fmtKg(p.mass), fmtM(p.cost)];
  if (p.power) s.push(p.power + ' W');
  if (p.kw) s.push(p.kw + ' kW');
  if (p.watts) s.push(p.watts + ' W');
  if (p.wh) s.push(p.wh + ' Wh');
  if (p.data) s.push(p.data + ' Mb/day');
  if (p.rate) s.push('×' + p.rate + ' link');
  if (p.isp) s.push('Isp ' + p.isp);
  if (p.gb) s.push(p.gb + ' Gb');
  return s.join(' · ');
}
function shelfHtml() {
  const goalSet = new Set(S.plan.goal ? goalParts(S.mission, S.plan.goal) : []);
  const on = new Set(allParts(S.build));
  let hidden = 0;
  const cats = CATS.map(cat => {
    const ids = Object.keys(PARTS).filter(id => PARTS[id].cat === cat && isUnlocked(id, S.mission, S.difficulty));
    const vis = ids.filter(partVisible); hidden += ids.length - vis.length;
    if (!vis.length) return '';
    const st = CAT_STYLE[cat], locked = !canAct(CAT_ROLE[cat]);
    return `<div class="shelf-cat"><h4 style="color:${st.color}">${st.icon} ${cat}${locked ? ` <span class="small muted">· ${esc(holderName(CAT_ROLE[cat]))}</span>` : ''}</h4>` +
      vis.map(id => { const p = PARTS[id];
        return `<button class="part${on.has(id) ? ' on' : ''}${locked ? ' locked' : ''}" style="--cat:${st.color}" data-act="tapPart" data-arg="${id}" title="${esc(p.desc)}">
          <b>${esc(p.name)}${goalSet.has(id) ? ' <span class="goalstar">★ Goal</span>' : ''}${ADVANCED.includes(id) ? ' <span class="pill">Advanced</span>' : ''}</b>
          <span class="small">${partStats(p)}</span><span class="small muted">${esc(p.desc)}</span></button>`; }).join('') + '</div>';
  }).join('');
  const adv = isSimple() && (hidden || S.showAdv)
    ? `<button class="btn ghost small" data-act="toggleAdv">${S.showAdv ? 'Hide advanced parts' : 'Show advanced parts too (' + hidden + ')'}</button>` : '';
  return cats + adv;
}
function shipHtml() {
  const rows = SLOT_TYPES.map(t => {
    const cells = S.build.slots[t].map((id, i) => id
      ? `<button class="slot full" style="--cat:${CAT_STYLE[PARTS[id].cat].color}" data-act="removePart" data-arg="${t}:${i}" title="Remove ${esc(PARTS[id].name)}">${CAT_STYLE[PARTS[id].cat].icon} ${esc(PARTS[id].short)} <span aria-hidden="true">✕</span></button>`
      : `<span class="slot empty" data-slot="${t}" data-idx="${i}">empty</span>`).join('');
    return `<div class="slotrow"><div class="small muted">${SLOT_LABEL[t]} <span class="hint">· ${SLOT_HINT[t]}</span></div><div class="slots">${cells}</div></div>`;
  }).join('');
  const buses = Object.keys(BUSES).filter(k => busUnlocked(k, S.mission, S.difficulty)).map(k =>
    `<button class="btn small ${S.build.bus === k ? 'primary' : 'ghost'}" data-act="setBus" data-arg="${k}" title="${esc(BUSES[k].desc)}">${esc(BUSES[k].name)}</button>`).join('');
  return `<div class="ship-head"><b>${esc(S.shipName || 'Your spacecraft')}</b><div class="row gap wrap">${buses}</div></div>${rows}`;
}

// ---------- plan tab ----------
function choiceCard(act, key, cur, title, body, extra) {
  return `<button class="choice${key === cur ? ' sel' : ''}" data-act="${act}" data-arg="${key}"><b>${title}</b>${extra || ''}<span class="small muted">${body}</span></button>`;
}
function planHtml(c) {
  const m = S.mission, lead = canAct('lead');
  const lvs = Object.keys(LAUNCHERS).map(k => {
    const L = LAUNCHERS[k], cap = L.leo * m.capFactor * c.traj.lf * (c.orbit.cap || 1), fits = c.wet <= cap;
    return choiceCard('setLv', k, S.plan.lv, esc(L.name), esc(L.desc), `<span class="small mono">${fmtKg(cap)} here · ${fmtM(L.cost)} · ${fits ? '<span class="good">✓ fits</span>' : '<span class="badc">✗ too heavy</span>'}</span>`);
  }).join('');
  const orbits = Object.entries(m.orbits).map(([k, o]) => choiceCard('setOrbit', k, S.plan.orbit, esc(o.name), esc(o.desc))).join('');
  const grounds = Object.entries(GROUND).map(([k, g]) => choiceCard('setGround', k, S.plan.ground, esc(g.name), esc(g.desc), `<span class="small mono">${g.hours} h a day · ${fmtM(g.cost)}</span>`)).join('');
  const trajs = Object.entries(m.trajs).map(([k, t]) => choiceCard('setTraj', k, S.plan.traj, esc(t.name), esc(t.desc), `<span class="small mono">Δv ${t.dvIns} km/s${t.dvDep ? ' + ' + t.dvDep + ' home' : ''} · ${t.cruise ? t.cruise + ' yr' : 'no cruise'}</span>`)).join('');
  const dis = lead ? '' : ' disabled';
  return `<div class="plan${lead ? '' : ' locked'}">
    ${lead ? '' : `<p class="small muted">${esc(holderName('lead'))} chooses the rocket, orbit and route.</p>`}
    <h3>🚀 Rocket</h3><div class="choices">${lvs}</div>
    <h3>🪐 Orbit</h3><div class="choices">${orbits}</div>
    <h3>📡 Ground stations</h3><div class="choices">${grounds}</div>
    <details class="adv"${isSimple() ? '' : ' open'}><summary>More settings: route, fuel and operations</summary>
      <h3>🧭 Route</h3><div class="choices">${trajs}</div>
      <h3>⛽ Fuel</h3><p class="small muted">${isSimple() && !S.plan.manualFuel ? 'Fuel fills itself on Beginner. Move the slider to take over.' : 'You need about ' + fmtKg(c.fuelReq) + '.'}</p>
      <div class="row gap"><input type="range" min="0" max="${FUEL_CAP}" step="10" value="${Math.round(S.plan.fuel)}" data-input="fuel" aria-label="Fuel in kg"${canAct('prop') ? '' : ' disabled'}>
        <span class="mono" id="fuelVal">${fmtKg(S.plan.fuel)}</span><button class="btn small ghost" data-act="fillFuel"${canAct('prop') ? '' : ' disabled'}>Fill to need + 8%</button></div>
      <h3>🗓️ Science operations</h3><p class="small muted">Each month costs ${fmtM(m.opsPerMonth)}. One science pass every ${m.passMonths} month${m.passMonths > 1 ? 's' : ''}.</p>
      <div class="row gap"><input type="range" min="${m.ops[0]}" max="${m.ops[1]}" step="1" value="${S.plan.opsMonths}" data-input="opsMonths" aria-label="Operations months"${dis}>
        <span class="mono" id="opsVal">${S.plan.opsMonths} months · ${c.passes} passes</span></div>
    </details></div>`;
}

function hangarHtml() {
  const c = C(), tab = S.hangarTab;
  const tabs = [['build', '🔧 Build'], ['plan', '🗺️ Plan']].map(([k, l]) =>
    `<button class="tab${tab === k ? ' sel' : ''}" data-act="tab" data-arg="${k}">${l}</button>`).join('');
  const blocks = review(S.build, S.plan, S.mission, c).filter(i => i.level === 'block').length;
  const body = tab === 'plan' ? planHtml(c)
    : `<div class="hangar-grid"><div class="card" id="ship">${shipHtml()}</div><div class="card shelf" id="shelf">${shelfHtml()}</div></div>`;
  return `<div class="hangar">
    <div class="row between wrap"><div><div class="eyebrow">Mission ${S.mission.num} · ${esc(S.mission.name)}</div><h2>Hangar</h2></div>
      <div class="row gap wrap"><button class="btn ghost" data-act="autoBuild">✨ Auto-build</button>
      <button class="btn primary" data-act="toReview">Launch review →</button></div></div>
    ${goalChip()}
    <div class="meters card" id="meters">${metersHtml(c)}</div>
    <div class="tabs">${tabs}</div>
    ${body}
    <div class="row between wrap"><p class="small muted" id="blockNote">${blocks ? blocks + ' problem' + (blocks > 1 ? 's' : '') + ' must be fixed before launch.' : 'No blockers. Check the launch review.'}</p>
      <button class="btn ghost small" data-act="shareCode">Share design code</button></div>
  </div>`;
}
function goalChip() {
  if (!S.plan.goal) return '';
  const o = S.mission.objectives.find(x => x.id === S.plan.goal), g = goalStatus(S.build, S.plan, S.mission, S.plan.goal);
  return `<div class="goalchip ${g.ok ? 'ok' : 'warn'}">🎯 Prime goal: <b>${esc(o.text)}</b> ${g.ok ? '✓ this design can do it' : '· not yet: ' + esc(GOAL_NEEDS[o.id].why)}</div>`;
}

// Update only the live parts of the hangar, so the page does not jump while editing.
function refreshHangar(full) {
  if (S.screen !== 'hangar') return;
  if (full || S.hangarTab !== 'build') { rerender(); return; }
  const c = C(), set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('meters', metersHtml(c));
  set('ship', shipHtml());
  set('shelf', shelfHtml());
  const gc = document.querySelector('.goalchip');
  if (gc) gc.outerHTML = goalChip();
  const blocks = review(S.build, S.plan, S.mission, c).filter(i => i.level === 'block').length;
  set('blockNote', blocks ? blocks + ' problem' + (blocks > 1 ? 's' : '') + ' must be fixed before launch.' : 'No blockers. Check the launch review.');
}
