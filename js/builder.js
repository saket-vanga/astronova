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


// ---------- hangar ----------
const SLOT_LABEL = { engine: 'Engine', antenna: 'Antenna', top: 'Top mount', bottom: 'Bottom mount', side: 'Side mounts', bay: 'Instrument bays', core: 'Internal slots' };
const SLOT_HINT = { engine: 'engines', antenna: 'antennas', top: 'the return capsule', bottom: 'the lander', side: 'solar wings and RTGs', bay: 'instruments and the sample arm', core: 'batteries, computers, pointing, recorders and shields' };
const SLOT_ICON = { engine: '🔥', antenna: '📡', top: '🪂', bottom: '🛬', side: '⚡', bay: '🔬', core: '🧠' };
const SLOT_SHORT = { engine: 'Engine', antenna: 'Antenna', top: 'Capsule', bottom: 'Lander', side: 'Side', bay: 'Bay', core: 'Inside' };

function isSimple() { return !!DIFF[S.difficulty].simple; }
function partVisible(id) { return isUnlocked(id, S.mission, S.difficulty) && (S.showAdv || !isSimple() || !ADVANCED.includes(id)); }
function partIcon(id) { return PART_ICON[id] || CAT_STYLE[PARTS[id].cat].icon; }

// Why a part cannot go in a slot, or '' if it can. `from` is where it is being moved from, if anywhere.
function placeProblem(id, type, idx, from) {
  const p = PARTS[id];
  if (!isUnlocked(id, S.mission, S.difficulty)) return 'Locked until mission ' + p.unlock + '.';
  if (p.slot !== type) return p.name + ' goes in ' + SLOT_LABEL[p.slot].toLowerCase() + '.';
  if (!canAct(CAT_ROLE[p.cat])) return holderName(CAT_ROLE[p.cat]) + ' owns ' + p.cat + ' parts.';
  const target = S.build.slots[type][idx];
  if (target && target !== id && !canAct(CAT_ROLE[PARTS[target].cat])) return holderName(CAT_ROLE[PARTS[target].cat]) + ' owns the part in that slot.';
  if (p.kind) {
    const here = x => (x.type === type && x.idx === idx) || (from && x.type === from.type && x.idx === from.idx);
    const clash = allPartsWithPos(S.build).find(x => PARTS[x.id].kind === p.kind && !here(x));
    if (clash) return 'Only one ' + p.kind + ' per spacecraft. Remove the ' + PARTS[clash.id].name.toLowerCase() + ' first.';
  }
  return '';
}
function canPlace(id, type, idx, from) { return !placeProblem(id, type, idx, from); }
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
// Move a fitted part to another mount of the same type, swapping with whatever is there.
function movePart(from, type, idx) {
  if (from.type === type && from.idx === idx) return false;
  const id = S.build.slots[from.type][from.idx];
  const why = placeProblem(id, type, idx, from);
  if (why) { SFX.deny(); toast(why); return false; }
  const other = S.build.slots[type][idx];
  S.build.slots[type][idx] = id;
  S.build.slots[from.type][from.idx] = other;
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
    { key: 'time', label: 'Time', value: c.cruise ? fmtYears(c.cruise) + ' trip' + (S.mission.window ? ' · limit ' + S.mission.window : '') : 'Straight to orbit',
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

// ---------- shelf ----------
function partChip(id, extra) {
  const p = PARTS[id], st = CAT_STYLE[p.cat];
  return `<span class="chip" style="--cat:${st.color}">${partIcon(id)} ${esc(p.short)}${extra || ''}</span>`;
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
        return `<button class="part${on.has(id) ? ' on' : ''}${locked ? ' locked' : ''}" style="--cat:${st.color}" data-act="tapPart" data-arg="${id}" data-part="${id}" title="${esc(p.desc)}">
          <b>${partIcon(id)} ${esc(p.name)}${goalSet.has(id) ? ' <span class="goalstar">★ Goal</span>' : ''}${ADVANCED.includes(id) ? ' <span class="pill">Advanced</span>' : ''}</b>
          <span class="small">${partStats(p)}</span><span class="small muted">${esc(p.desc)}</span></button>`; }).join('') + '</div>';
  }).join('');
  const adv = isSimple() && (hidden || S.showAdv)
    ? `<button class="btn ghost small" data-act="toggleAdv">${S.showAdv ? 'Hide advanced parts' : 'Show advanced parts too (' + hidden + ')'}</button>` : '';
  return `<p class="small muted shelf-tip">Drag a part onto a glowing mount, or tap it to fit it.</p>` + cats + adv;
}

// ---------- the spacecraft ----------
function paintColor() { return (PAINTS.find(p => p.id === S.paint) || PAINTS[0]).color; }
function patchImg(cls) {
  return S.patch ? `<img class="patch-img ${cls || ''}" src="${S.patch}" alt="Mission patch">` : `<span class="patch-img empty ${cls || ''}" aria-hidden="true">🎨</span>`;
}
function mountHtml(type, idx, cls) {
  const id = S.build.slots[type][idx];
  if (id) {
    const p = PARTS[id], st = CAT_STYLE[p.cat], look = p.kw ? ' solar' : p.watts ? ' rtg' : '';
    return `<button class="mount full ${cls}${look}" data-slot="${type}" data-idx="${idx}" data-part="${id}" data-act="removePart" data-arg="${type}:${idx}"
      style="--cat:${st.color}" title="${esc(p.name)}. Tap to remove, or drag to move." aria-label="${esc(p.name)}. Remove it."><span class="mi">${partIcon(id)}</span><span class="ml">${esc(p.short)}</span></button>`;
  }
  const any = Object.keys(PARTS).some(k => PARTS[k].slot === type && isUnlocked(k, S.mission, S.difficulty));
  return `<span class="mount empty ${cls}${any ? '' : ' locked'}" data-slot="${type}" data-idx="${idx}" title="${SLOT_LABEL[type]}: ${any ? SLOT_HINT[type] : 'unlocks on a later mission'}">
    <span class="mi">${any ? SLOT_ICON[type] : '🔒'}</span><span class="ml">${SLOT_SHORT[type]}</span></span>`;
}
function shipHtml() {
  const s = S.build.slots;
  const sides = s.side.map((_, i) => mountHtml('side', i, 'wing'));
  const buses = Object.keys(BUSES).filter(k => busUnlocked(k, S.mission, S.difficulty)).map(k =>
    `<button class="btn small ${S.build.bus === k ? 'primary' : 'ghost'}" data-act="setBus" data-arg="${k}" title="${esc(BUSES[k].desc)}">${esc(BUSES[k].name.replace(' bus', ''))}</button>`).join('');
  return `<div class="ship-head"><b>${esc(S.shipName || 'Your spacecraft')}</b><div class="row gap wrap"><span class="small muted">Bus:</span>${buses}</div></div>
    <div class="ship bus-${S.build.bus}" style="--paint:${paintColor()}">
      <div class="ship-row top">${mountHtml('antenna', 0, 'ant')}${mountHtml('top', 0, 'cap')}</div>
      <div class="ship-row mid">
        <div class="wings left">${sides.filter((_, i) => i % 2 === 0).join('')}</div>
        <div class="body">
          <div class="googly" aria-hidden="true"><i><b></b></i><i><b></b></i></div>
          <div class="body-head">${patchImg()}<span class="nameplate">${esc(S.shipName || 'Unnamed')}</span></div>
          <div class="zone"><span class="zl">Instrument bays</span><div class="mgrid">${s.bay.map((_, i) => mountHtml('bay', i, 'bay')).join('')}</div></div>
          <div class="zone"><span class="zl">Inside the bus</span><div class="mgrid">${s.core.map((_, i) => mountHtml('core', i, 'core')).join('')}</div></div>
        </div>
        <div class="wings right">${sides.filter((_, i) => i % 2 === 1).join('')}</div>
      </div>
      <div class="ship-row bot">${mountHtml('bottom', 0, 'lnd')}${mountHtml('engine', 0, 'eng')}</div>
    </div>
    <p class="small muted center">${BUSES[S.build.bus].desc} Tap a fitted part to remove it.</p>`;
}

// ---------- drag and drop (pointer events: mouse drags at once, touch needs a short press) ----------
const DRAG = { pending: false, on: false, justDropped: 0 };
function mountAt(x, y) { const el = document.elementFromPoint(x, y); return el ? el.closest('.mount') : null; }
function moveGhost(x, y) { if (DRAG.ghost) DRAG.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -70%)`; }
function beginDrag(x, y) {
  DRAG.pending = false; DRAG.on = true; clearTimeout(DRAG.timer);
  const p = PARTS[DRAG.id];
  const g = document.createElement('div');
  g.className = 'drag-ghost'; g.style.setProperty('--cat', CAT_STYLE[p.cat].color);
  g.innerHTML = `${partIcon(DRAG.id)} ${esc(p.short)}`;
  document.body.appendChild(g); DRAG.ghost = g; moveGhost(x, y);
  document.body.classList.add('dragging');
  document.querySelectorAll('.mount').forEach(m => {
    const ok = m.dataset.slot === p.slot && canPlace(DRAG.id, m.dataset.slot, +m.dataset.idx, DRAG.from);
    m.classList.add(ok ? 'can' : 'nope');
  });
  if (DRAG.touch && navigator.vibrate) navigator.vibrate(10);
}
function endDragVisual() {
  if (DRAG.ghost) DRAG.ghost.remove();
  DRAG.ghost = null;
  document.body.classList.remove('dragging');
  document.querySelectorAll('.mount.can, .mount.nope, .mount.over').forEach(m => m.classList.remove('can', 'nope', 'over'));
}
function cancelDrag() { clearTimeout(DRAG.timer); if (DRAG.on) endDragVisual(); DRAG.pending = DRAG.on = false; }
document.addEventListener('pointerdown', e => {
  if (S.screen !== 'hangar' || e.button > 0) return;
  const src = e.target.closest('[data-part]');
  if (!src || src.classList.contains('locked')) return;
  Object.assign(DRAG, { pending: true, on: false, id: src.dataset.part, x: e.clientX, y: e.clientY, pid: e.pointerId, touch: e.pointerType !== 'mouse',
    from: src.dataset.slot ? { type: src.dataset.slot, idx: +src.dataset.idx } : null });
  if (DRAG.touch) DRAG.timer = setTimeout(() => { if (DRAG.pending) beginDrag(DRAG.x, DRAG.y); }, 260);
});
document.addEventListener('pointermove', e => {
  if (e.pointerId !== DRAG.pid) return;
  if (DRAG.pending) {
    const far = Math.hypot(e.clientX - DRAG.x, e.clientY - DRAG.y);
    if (DRAG.touch) { if (far > 10) { clearTimeout(DRAG.timer); DRAG.pending = false; } }   // finger moved first: it's a scroll
    else if (far > 6) beginDrag(e.clientX, e.clientY);
    return;
  }
  if (!DRAG.on) return;
  moveGhost(e.clientX, e.clientY);
  const m = mountAt(e.clientX, e.clientY);
  document.querySelectorAll('.mount.over').forEach(x => x.classList.remove('over'));
  if (m && m.classList.contains('can')) m.classList.add('over');
});
document.addEventListener('pointerup', e => {
  if (e.pointerId !== DRAG.pid) return;
  clearTimeout(DRAG.timer);
  if (!DRAG.on) { DRAG.pending = false; return; }
  const m = mountAt(e.clientX, e.clientY), overShip = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.ship');
  const { id, from } = DRAG;
  endDragVisual();
  DRAG.on = false; DRAG.justDropped = performance.now();
  if (m && m.dataset.slot) {
    const t = m.dataset.slot, i = +m.dataset.idx;
    if (from) movePart(from, t, i); else place(id, t, i);
  } else if (from && !overShip) removePart(from.type, from.idx);   // dragged off the spacecraft: take it off
});
document.addEventListener('pointercancel', cancelDrag);
// While dragging on a touch screen, stop the page from scrolling.
document.addEventListener('touchmove', e => { if (DRAG.on) e.preventDefault(); }, { passive: false });
// The click that follows a drop must not also count as a tap.
document.addEventListener('click', e => {
  if (DRAG.justDropped && performance.now() - DRAG.justDropped < 400) { e.stopPropagation(); e.preventDefault(); DRAG.justDropped = 0; }
}, true);

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
      <div class="row gap wrap"><input type="range" min="0" max="${FUEL_CAP}" step="10" value="${Math.round(S.plan.fuel)}" data-input="fuel" aria-label="Fuel in kg"${canAct('prop') ? '' : ' disabled'}>
        <span class="mono" id="fuelVal">${fmtKg(S.plan.fuel)}</span><button class="btn small ghost" data-act="fillFuel"${canAct('prop') ? '' : ' disabled'}>Fill to need + 8%</button></div>
      <h3>🗓️ Science operations</h3><p class="small muted">Each month costs ${fmtM(m.opsPerMonth)}. One science pass every ${m.passMonths} month${m.passMonths > 1 ? 's' : ''}.</p>
      <div class="row gap wrap"><input type="range" min="${m.ops[0]}" max="${m.ops[1]}" step="1" value="${S.plan.opsMonths}" data-input="opsMonths" aria-label="Operations months"${dis}>
        <span class="mono" id="opsVal">${S.plan.opsMonths} months · ${plural(c.passes, 'pass')}</span></div>
    </details></div>`;
}

// ---------- paint tab: name, colour and a hand-drawn mission patch ----------
const PATCH = { tool: 'brush', color: '#ffd166', size: 10, stamp: '⭐', undo: [], drawing: false, last: null, ctx: null, ring: null };
const PATCH_N = 320, PATCH_R = 160, PATCH_IN = 118, PATCH_BG = '#1b1f3b';

function paintHtml() {
  const tool = (k, label) => `<button class="btn small ${PATCH.tool === k ? 'primary' : 'ghost'}" data-act="patchTool" data-arg="${k}">${label}</button>`;
  return `<div class="paint-grid">
    <div class="card"><h3>🏷️ Name and colour</h3>
      <label class="field"><span>Spacecraft name</span><input type="text" maxlength="20" value="${esc(S.shipName)}" data-input="shipName" placeholder="e.g. Little Listener" autocomplete="off"></label>
      <div class="swatches">${PAINTS.map(p => `<button class="swatch${S.paint === p.id ? ' sel' : ''}" style="--sw:${p.color}" data-act="setPaint" data-arg="${p.id}" title="${esc(p.name)}" aria-label="${esc(p.name)}"></button>`).join('')}</div>
      <p class="small muted">The name goes round the edge of your mission patch. Real teams design a patch for every mission.</p></div>
    <div class="card"><h3>🎨 Mission patch</h3>
      <div class="patch-editor">
        <div class="patchwrap"><canvas id="patchArt" width="${PATCH_N}" height="${PATCH_N}" aria-label="Patch drawing area"></canvas><canvas id="patchRing" width="${PATCH_N}" height="${PATCH_N}" aria-hidden="true"></canvas></div>
        <div class="tools">
          <div class="row gap wrap">${tool('brush', '🖌️ Brush')}${tool('eraser', '🧽 Eraser')}${tool('fill', '🪣 Fill')}${tool('stamp', '⭐ Stamp')}</div>
          <div class="swatches small-sw">${PATCH_COLORS.map(c => `<button class="swatch${PATCH.color === c ? ' sel' : ''}" style="--sw:${c}" data-act="patchColor" data-arg="${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
          <div class="row gap wrap"><span class="small muted">Size</span>${[4, 10, 20].map((n, i) => `<button class="btn small ${PATCH.size === n ? 'primary' : 'ghost'}" data-act="patchSize" data-arg="${n}">${['S', 'M', 'L'][i]}</button>`).join('')}</div>
          <div class="stamps">${PATCH_STAMPS.map(s => `<button class="stampbtn${PATCH.stamp === s && PATCH.tool === 'stamp' ? ' sel' : ''}" data-act="patchStamp" data-arg="${s}" aria-label="Stamp ${s}">${s}</button>`).join('')}</div>
          <div class="row gap wrap"><button class="btn small ghost" data-act="patchUndo">↩️ Undo</button><button class="btn small ghost" data-act="patchClear">🗑️ Clear</button></div>
        </div></div></div></div>`;
}

function initPatch() {
  const art = document.getElementById('patchArt'), ring = document.getElementById('patchRing');
  if (!art || !ring) return;
  PATCH.ctx = art.getContext('2d', { willReadFrequently: true }); PATCH.ring = ring.getContext('2d');
  const ctx = PATCH.ctx;
  ctx.fillStyle = PATCH_BG; ctx.fillRect(0, 0, PATCH_N, PATCH_N);
  // The drawing lives in memory between redraws, so switching tools never reloads (and never races) the saved image.
  if (PATCH.mem && PATCH.memFor === S.patch) { ctx.drawImage(PATCH.mem, 0, 0); }
  else if (S.patch) {
    PATCH.loading = true;
    const img = new Image(), want = S.patch;
    img.onload = img.onerror = () => {
      PATCH.loading = false;
      if (S.patch !== want || PATCH.ctx !== ctx) return;
      if (img.naturalWidth) ctx.drawImage(img, 0, 0, PATCH_N, PATCH_N);
      maskPatch(); rememberPatch();
    };
    img.src = want;
  } else { drawDefaultPatch(); maskPatch(); }
  drawRing();
  art.onpointerdown = e => {
    e.preventDefault();
    if (PATCH.loading) return;
    try { art.setPointerCapture(e.pointerId); } catch (err) { /* keep drawing without capture */ }
    pushUndo();
    const p = patchPoint(e, art);
    if (PATCH.tool === 'fill') { floodFill(p.x, p.y, PATCH.color); maskPatch(); savePatch(); return; }
    if (PATCH.tool === 'stamp') { stamp(p.x, p.y); maskPatch(); savePatch(); return; }
    PATCH.drawing = true; PATCH.last = p; strokeTo(p);
  };
  art.onpointermove = e => { if (PATCH.drawing) strokeTo(patchPoint(e, art)); };
  art.onpointerup = art.onpointercancel = () => { if (!PATCH.drawing) return; PATCH.drawing = false; maskPatch(); savePatch(); };
}
function patchPoint(e, el) { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * PATCH_N / r.width, y: (e.clientY - r.top) * PATCH_N / r.height }; }
function drawDefaultPatch() {
  const ctx = PATCH.ctx;
  const g = ctx.createRadialGradient(PATCH_R, PATCH_R * 0.8, 10, PATCH_R, PATCH_R, PATCH_IN);
  g.addColorStop(0, '#2b3a8f'); g.addColorStop(1, PATCH_BG);
  ctx.fillStyle = g; ctx.fillRect(0, 0, PATCH_N, PATCH_N);
  ctx.font = '72px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(FACES.planet[S.mission ? S.mission.planet : 'earth'], PATCH_R, PATCH_R);
}
function strokeTo(p) {
  const ctx = PATCH.ctx;
  ctx.strokeStyle = PATCH.tool === 'eraser' ? PATCH_BG : PATCH.color;
  ctx.lineWidth = PATCH.tool === 'eraser' ? PATCH.size * 2 : PATCH.size;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(PATCH.last.x, PATCH.last.y); ctx.lineTo(p.x + 0.01, p.y); ctx.stroke();
  PATCH.last = p;
}
function stamp(x, y) {
  const ctx = PATCH.ctx;
  ctx.font = (PATCH.size * 3 + 18) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PATCH.stamp, x, y);
}
// Keep the drawing inside the inner circle; the ring is drawn on top.
function maskPatch() {
  const ctx = PATCH.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath(); ctx.arc(PATCH_R, PATCH_R, PATCH_IN, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawRing(ctx) {
  ctx = ctx || PATCH.ring;
  if (!ctx) return;
  ctx.clearRect(0, 0, PATCH_N, PATCH_N);
  ctx.beginPath(); ctx.arc(PATCH_R, PATCH_R, PATCH_R - 3, 0, Math.PI * 2); ctx.arc(PATCH_R, PATCH_R, PATCH_IN, 0, Math.PI * 2, true);
  ctx.fillStyle = paintColor(); ctx.fill('evenodd');
  ctx.lineWidth = 5; ctx.strokeStyle = PATCH_BG;
  ctx.beginPath(); ctx.arc(PATCH_R, PATCH_R, PATCH_R - 3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(PATCH_R, PATCH_R, PATCH_IN, 0, Math.PI * 2); ctx.stroke();
  const text = (S.shipName || 'Poppy Pants').toUpperCase();
  writeArc(ctx, text, -Math.PI / 2, (PATCH_R + PATCH_IN) / 2, false);
  writeArc(ctx, '★ ★ ★', Math.PI / 2, (PATCH_R + PATCH_IN) / 2, true);
}
// Letters around a circle, centred on an angle; the bottom text reads left to right too.
function writeArc(ctx, text, centre, radius, bottom) {
  ctx.save();
  ctx.fillStyle = PATCH_BG; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const step = Math.min(0.17, 2.6 / Math.max(1, text.length));
  const start = centre + (bottom ? 1 : -1) * step * (text.length - 1) / 2;
  for (let i = 0; i < text.length; i++) {
    const a = start + (bottom ? -1 : 1) * step * i;
    ctx.save();
    ctx.translate(PATCH_R + Math.cos(a) * radius, PATCH_R + Math.sin(a) * radius);
    ctx.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
function pushUndo() { if (!PATCH.ctx) return; PATCH.undo.push(PATCH.ctx.getImageData(0, 0, PATCH_N, PATCH_N)); if (PATCH.undo.length > 20) PATCH.undo.shift(); }
function patchUndo() { if (!PATCH.ctx || !PATCH.undo.length) { toast('Nothing to undo.'); return; } PATCH.ctx.putImageData(PATCH.undo.pop(), 0, 0); savePatch(); }
function patchClear() { if (!PATCH.ctx) return; pushUndo(); PATCH.ctx.fillStyle = PATCH_BG; PATCH.ctx.fillRect(0, 0, PATCH_N, PATCH_N); maskPatch(); savePatch(); }
function floodFill(x0, y0, hex) {
  const ctx = PATCH.ctx, img = ctx.getImageData(0, 0, PATCH_N, PATCH_N), d = img.data;
  x0 = Math.floor(x0); y0 = Math.floor(y0);
  const at = (x, y) => (y * PATCH_N + x) * 4, i0 = at(x0, y0);
  const t = [d[i0], d[i0 + 1], d[i0 + 2]];
  const n = parseInt(hex.slice(1), 16), fill = [n >> 16 & 255, n >> 8 & 255, n & 255];
  if (Math.abs(t[0] - fill[0]) + Math.abs(t[1] - fill[1]) + Math.abs(t[2] - fill[2]) < 10) return;
  const r2 = (PATCH_IN - 1) * (PATCH_IN - 1);
  const match = (x, y) => { const i = at(x, y), dx = x - PATCH_R, dy = y - PATCH_R;
    return dx * dx + dy * dy < r2 && Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) < 60; };
  const stack = [[x0, y0]];
  while (stack.length) {
    let [x, y] = stack.pop();
    while (x > 0 && match(x - 1, y)) x--;
    let up = false, down = false;
    for (; x < PATCH_N && match(x, y); x++) {
      const i = at(x, y); d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255;
      if (y > 0) { const m = match(x, y - 1); if (m && !up) stack.push([x, y - 1]); up = m; }
      if (y < PATCH_N - 1) { const m = match(x, y + 1); if (m && !down) stack.push([x, y + 1]); down = m; }
    }
  }
  ctx.putImageData(img, 0, 0);
}
// The patch image = drawing + ring with the name, saved with the campaign.
function savePatch() {
  if (!PATCH.ctx) return;
  const off = document.createElement('canvas');
  off.width = off.height = PATCH_N;
  const o = off.getContext('2d');
  o.drawImage(PATCH.ctx.canvas, 0, 0);
  drawRing(o);
  S.patch = off.toDataURL('image/png');
  rememberPatch();
  saveCampaign();
}
function rememberPatch() {
  if (!PATCH.ctx) return;
  if (!PATCH.mem) { PATCH.mem = document.createElement('canvas'); PATCH.mem.width = PATCH.mem.height = PATCH_N; }
  const m = PATCH.mem.getContext('2d');
  m.clearRect(0, 0, PATCH_N, PATCH_N); m.drawImage(PATCH.ctx.canvas, 0, 0);
  PATCH.memFor = S.patch;
}

// ---------- compare tab: a trade study of up to three saved designs ----------
function tradeList() { if (!S.trades[S.mission.id]) S.trades[S.mission.id] = []; return S.trades[S.mission.id]; }
function tradeSummary(build, plan) {
  const m = S.mission, c = calc(build, plan, m, S.difficulty, bonusBudget()), items = review(build, plan, m, c);
  const R = bestCaseR(build, plan, m), pts = {};
  for (const s of m.sites) for (const f of Object.values(s.finds)) pts[f.id] = f.pts;
  if (m.tagFinding) pts[m.tagFinding.id] = m.tagFinding.pts;
  let sci = 0; R.found.forEach(id => { sci += pts[id] || 0; });
  sci *= c.dataRatio * c.duty * (c.d.adcs ? c.d.adcs.mult : 1);
  return { c, blocks: items.filter(i => i.level === 'block').length, warns: items.filter(i => i.level === 'warn').length,
    stars: m.objectives.filter(o => o.check(R)).length, sci: Math.round(sci), parts: allParts(build).length };
}
function compareHtml() {
  const list = tradeList();
  const cols = [{ name: 'Current design', build: S.build, plan: S.plan, cur: true }].concat(list.map((t, i) => Object.assign({ i }, t)));
  const sums = cols.map(col => tradeSummary(col.build, col.plan));
  const rows = [
    ['Parts', s => s.parts, null],
    ['Rocket', (s, col) => LAUNCHERS[col.plan.lv].name, null],
    ['Mass margin', s => fmtPct(s.c.massMargin), s => s.c.massMargin],
    ['Cost', s => fmtM(s.c.cost), s => -s.c.cost],
    ['Budget left', s => fmtM(s.c.budgetLeft), s => s.c.budgetLeft],
    ['Power spare', s => fmtPct(s.c.powerMargin), s => s.c.powerMargin],
    ['Data home', s => fmtPct(s.c.dataRatio), s => s.c.dataRatio],
    ['Trip time', s => s.c.cruise ? fmtYears(s.c.cruise) : '—', s => -s.c.cruise],
    ['Science passes', s => s.c.passes, s => s.c.passes],
    ['Stars possible', s => s.stars + ' / 3', s => s.stars],
    ['Science potential', s => s.sci + ' pts', s => s.sci],
    ['Review', s => s.blocks ? `✗ ${plural(s.blocks, 'blocker')}` : s.warns ? `! ${plural(s.warns, 'risk')}` : '✓ all green', s => -s.blocks * 10 - s.warns]
  ];
  const body = rows.map(([label, val, rank]) => {
    let best = null;
    if (rank && cols.length > 1) { const v = sums.map(rank); best = Math.max(...v); if (v.every(x => x === best)) best = null; }
    return `<tr><th>${label}</th>${sums.map((s, i) => `<td class="${best !== null && rank(s) === best ? 'best' : ''}">${val(s, cols[i])}</td>`).join('')}</tr>`;
  }).join('');
  const head = cols.map(col => `<th>${esc(col.name)}${col.cur ? '' : `<div class="row gap"><button class="btn small ghost" data-act="tradeLoad" data-arg="${col.i}">Load</button><button class="btn small ghost" data-act="tradeDel" data-arg="${col.i}" aria-label="Delete ${esc(col.name)}">✕</button></div>`}</th>`).join('');
  return `<div class="card"><h3>⚖️ Trade study</h3>
    <p class="small muted">Real teams compare several designs before choosing one. At NASA Goddard's Mission Design Lab, engineers do exactly this in a few days. Save up to three versions of your spacecraft and see which is best at what. The best value in each row is highlighted.</p>
    <div class="tablewrap"><table class="compare"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="row end"><button class="btn primary" data-act="tradeSave"${list.length >= 3 ? ' disabled' : ''}>💾 Save current design${list.length >= 3 ? ' (3 saved)' : ''}</button></div></div>`;
}
function tradeSave() {
  const list = tradeList();
  if (list.length >= 3) { toast('You can save three designs. Delete one first.'); return; }
  const used = list.map(t => t.name);
  const name = ['Design A', 'Design B', 'Design C'].find(n => !used.includes(n));
  list.push({ name, build: clone(S.build), plan: clone(S.plan) });
  saveCampaign(); rerender(); toast(name + ' saved.');
}
function tradeLoad(i) {
  const t = tradeList()[+i]; if (!t) return;
  S.build = clone(t.build); S.plan = Object.assign(clone(t.plan), { goal: S.plan.goal });
  saveBuild(); rerender(); toast(t.name + ' loaded.');
}
function tradeDel(i) { tradeList().splice(+i, 1); saveCampaign(); rerender(); }

// ---------- the hangar screen ----------
function hangarHtml() {
  const c = C(), tab = S.hangarTab;
  const tabs = [['build', '🔧 Build'], ['plan', '🗺️ Plan'], ['paint', '🎨 Paint'], ['compare', '⚖️ Compare']].map(([k, l]) =>
    `<button class="tab${tab === k ? ' sel' : ''}" data-act="tab" data-arg="${k}">${l}</button>`).join('');
  const blocks = review(S.build, S.plan, S.mission, c).filter(i => i.level === 'block').length;
  const body = tab === 'plan' ? planHtml(c) : tab === 'paint' ? paintHtml() : tab === 'compare' ? compareHtml()
    : `<div class="hangar-grid"><div class="card" id="ship">${shipHtml()}</div><div class="card shelf" id="shelf">${shelfHtml()}</div></div>`;
  return `<div class="hangar">
    <div class="row between wrap"><div><div class="eyebrow">Step 2 · Design · Mission ${S.mission.num}</div><h2>Hangar</h2></div>
      <div class="row gap wrap"><button class="btn ghost small" data-act="startTour">🧭 Show me around</button><button class="btn ghost" data-act="autoBuild">✨ Auto-build</button>
      <button class="btn primary" data-act="toReview">Launch review →</button></div></div>
    ${goalChip()}
    ${coachHtml(c)}
    <div class="meters card" id="meters">${metersHtml(c)}</div>
    <div class="tabs" role="tablist">${tabs}</div>
    ${body}
    <div class="row between wrap"><p class="small muted" id="blockNote">${blockNote(blocks)}</p>
      <button class="btn ghost small" data-act="shareCode">Share design code</button></div>
  </div>`;
}
function hangarAfter() {
  if (S.hangarTab === 'paint') initPatch();
  if (isSimple() && S.hangarTab === 'build' && !tourState && store.get('ceruvia-tour') !== '1') setTimeout(() => { if (S.screen === 'hangar' && !tourState) startTour(); }, 400);
}
function blockNote(n) { return n ? plural(n, 'problem') + ' must be fixed before launch.' : 'No blockers. Check the launch review.'; }
function goalChip() {
  if (!S.plan.goal) return '';
  const o = S.mission.objectives.find(x => x.id === S.plan.goal), g = goalStatus(S.build, S.plan, S.mission, S.plan.goal);
  return `<div class="goalchip ${g.ok ? 'ok' : 'warn'}">🎯 Prime goal: <b>${esc(o.text)}</b> ${g.ok ? '✓ this design can do it' : '· not yet: ' + esc(GOAL_NEEDS[o.id].why)}</div>`;
}

// Update only the live parts of the hangar, so a drag in progress and the scroll position survive.
function refreshHangar(full) {
  if (S.screen !== 'hangar') return;
  if (DRAG.on) cancelDrag();
  if (full || S.hangarTab !== 'build') { rerender(); return; }
  const c = C(), set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('meters', metersHtml(c));
  set('ship', shipHtml());
  set('shelf', shelfHtml());
  const gc = document.querySelector('.goalchip');
  if (gc) gc.outerHTML = goalChip();
  const co = document.getElementById('coach');
  if (co) co.outerHTML = coachHtml(c);
  set('blockNote', blockNote(review(S.build, S.plan, S.mission, c).filter(i => i.level === 'block').length));
}

// ---------- beginner helpers: Ollie the coach ----------
// The coach finds the single most important thing to fix next, and offers to do it.
function hasFree(type) { const a = S.build.slots[type]; return a.length === 1 || a.includes(null); }
function biggerBus() {
  const order = Object.keys(BUSES), i = order.indexOf(S.build.bus);
  return order.slice(i + 1).find(k => busUnlocked(k, S.mission, S.difficulty)) || null;
}
function canShow(id) { return partVisible(id); }
// A fix that fits a part, or first grows the bus if there is no room.
function partFix(id, verb) {
  if (!id || !PARTS[id]) return null;
  const p = PARTS[id], role = CAT_ROLE[p.cat];
  if (!canAct(role)) return { arg: '', label: holderName(role) + ' can fit the ' + p.name.toLowerCase(), locked: true };
  if (!hasFree(p.slot)) { const b = biggerBus(); return b ? { arg: 'bus:' + b, label: 'Use the ' + BUSES[b].name.toLowerCase() } : null; }
  return { arg: 'part:' + id, label: (verb || 'Fit the') + ' ' + p.name.toLowerCase() };
}
function antennaFor(c, need) {
  const hours = c.ground ? c.ground.hours : 8;
  const ants = ['lga', 'mga', 'hga', 'ka'].filter(canShow);
  return ants.find(a => PARTS[a].rate * 28.8 * S.mission.comm * hours / 8 >= 0.9 * need) || ants[ants.length - 1];
}
function coachSteps(c) {
  const d = c.d, m = S.mission, out = [];
  const add = (text, fix) => out.push({ text, fix: fix || null });
  const powerPart = (m.au > 3 || m.crisis) && canShow('rtg') ? 'rtg' : canShow('solarL') ? 'solarL' : 'solarS';
  // 1. essentials
  if (!d.engine) add('Every spacecraft needs an engine to brake into orbit. Fit one on the engine mount at the bottom.', partFix('chem'));
  if (!d.antenna) add('No antenna means no way to talk to Earth. Fit one on the top mount.', partFix(antennaFor(c, Math.max(c.genMb, 400))));
  if (!d.computer) add('The flight computer runs everything. It goes in an internal slot.', partFix(c.orbit.radRisk >= 0.02 && canShow('compRad') ? 'compRad' : 'compStd'));
  if (!d.adcs) add('Reaction wheels point the spacecraft. Without them nothing aims. Fit them inside the bus.', partFix('adcsBasic'));
  if (!d.batteryWh) add('A battery keeps you alive in shadow and during burns.', partFix(m.crisis && canShow('batL') ? 'batL' : 'batS'));
  if (!d.solarKw && !d.rtg) add(m.au > 3 ? 'Far from the Sun, solar wings barely work. An RTG makes power anywhere.' : 'Nothing makes electricity yet. Add a solar wing to a side mount.', partFix(powerPart));
  if (!d.recorder) add('Science data needs a recorder to wait in until it can be sent home.', partFix('rec256'));
  const essentials = out.length === 0;
  // 2. the prime goal
  let science = true;
  if (S.plan.goal) {
    const g = goalStatus(S.build, S.plan, m, S.plan.goal);
    if (!g.ok) {
      science = false;
      const need = GOAL_NEEDS[S.plan.goal];
      if (!g.orbitOk) {
        const k = Object.keys(m.orbits).find(o => m.orbits[o].maxLat >= 70);
        add('Your goal needs an orbit that flies over the poles. ' + need.why, k ? { arg: 'orbit:' + k, label: 'Switch to the ' + m.orbits[k].name.toLowerCase() } : null);
      } else {
        const byCost = (a, b) => PARTS[a].cost - PARTS[b].cost;
        const cands = goalParts(m, S.plan.goal).filter(id => canShow(id) && !d.ids.includes(id)).sort(byCost);
        // any other science-slot part that completes the goal (e.g. the sample arm for "bring the sample home")
        const others = Object.keys(PARTS).filter(id => ['bay', 'top', 'bottom'].includes(PARTS[id].slot) && canShow(id) && !d.ids.includes(id) && !cands.includes(id)).sort(byCost);
        const completes = id => { const b = clone(S.build), arr = b.slots[PARTS[id].slot]; let i = arr.indexOf(null); if (i < 0 && arr.length === 1) i = 0; if (i < 0) return false; arr[i] = id; return goalStatus(b, S.plan, m, S.plan.goal).ok; };
        const pick = cands.find(completes) || others.find(completes) || cands[0];
        if (pick) add(`To ${m.objectives.find(o => o.id === S.plan.goal).text.toLowerCase()}, add a ★ Goal part. ${need.why}`, partFix(pick, 'Add the'));
        else {
          const k = Object.keys(m.orbits).find(o => { const p = Object.assign({}, S.plan, { orbit: o }); return goalStatus(S.build, p, m, S.plan.goal).ok; });
          add('Your goal parts cannot see the right places from this orbit. ' + need.why, k ? { arg: 'orbit:' + k, label: 'Switch to the ' + m.orbits[k].name.toLowerCase() } : null);
        }
      }
    }
  }
  if (science && !d.instruments.length && !d.lander) {
    science = false;
    const orbit = c.orbit, cam = ['wac', 'mag', 'irs', 'sig'].filter(canShow).find(id => m.sites.some(st => st.finds[id] && canSee(id, st, orbit))) || 'wac';
    add('Your goal is covered, but a spacecraft with no instruments cannot do any science. Add a cheap instrument too.', partFix(cam, 'Add the'));
  }
  // 3. fits the rocket
  const fits = c.massMargin >= 0;
  if (!fits && essentials) {
    const lv = Object.keys(LAUNCHERS).sort((a, b) => LAUNCHERS[a].cost - LAUNCHERS[b].cost)
      .find(k => LAUNCHERS[k].leo * m.capFactor * c.traj.lf * (c.orbit.cap || 1) >= c.wet * 1.03);
    if (lv && canAct('lead')) add(`Too heavy for the ${c.lv.name}: ${fmtKg(c.wet)} but it can only send ${fmtKg(c.capacity)}. A bigger rocket will lift it.`, { arg: 'lv:' + lv, label: 'Use the ' + LAUNCHERS[lv].name });
    else add(`Too heavy even for the biggest rocket. Remove a heavy part, or pick a route that needs less fuel in More settings.`);
  }
  // 4. budget
  const budgetOk = c.budgetLeft >= 0;
  if (!budgetOk && essentials) {
    const cheaper = Object.keys(LAUNCHERS).filter(k => LAUNCHERS[k].cost < c.lv.cost && LAUNCHERS[k].leo * m.capFactor * c.traj.lf * (c.orbit.cap || 1) >= c.wet * 1.03)
      .sort((a, b) => LAUNCHERS[a].cost - LAUNCHERS[b].cost)[0];
    if (cheaper && canAct('lead')) add(`Over budget by ${fmtM(-c.budgetLeft)}. The ${LAUNCHERS[cheaper].name} can still lift you and costs less.`, { arg: 'lv:' + cheaper, label: 'Use the ' + LAUNCHERS[cheaper].name });
    else {
      const goalSet = new Set(S.plan.goal ? goalParts(m, S.plan.goal) : []);
      const spare = allPartsWithPos(S.build).filter(x => PARTS[x.id].inst && !goalSet.has(x.id)).sort((a, b) => PARTS[b.id].cost - PARTS[a.id].cost)[0];
      if (spare) add(`Over budget by ${fmtM(-c.budgetLeft)}. The ${PARTS[spare.id].name.toLowerCase()} is not needed for your goal.`, { arg: 'remove:' + spare.type + ':' + spare.idx, label: 'Remove it' });
      else add(`Over budget by ${fmtM(-c.budgetLeft)}. Try fewer months of operations, or a cheaper antenna or ground station.`);
    }
  }
  // 5. power
  const powerOk = c.powerMargin >= 0 && c.batteryOk;
  if (essentials && c.powerMargin < 0) add(`You use ${fmtW(c.load)} but only make ${fmtW(c.avgGen)}. Add more power.`, partFix(powerPart, 'Add a'));
  else if (essentials && !c.batteryOk) {
    const big = canShow('batL') && !d.ids.includes('batL') ? 'batL' : null;
    add(`Each pass through shadow needs ${Math.round(c.eclipseWh)} Wh, but the battery holds ${d.batteryWh} Wh.`, big ? swapFix('batS', big) : null);
  }
  // 6. nice to have: data and the deadline
  if (essentials && science && fits && budgetOk && powerOk) {
    if (c.dataRatio < 0.9 && d.antenna) {
      const better = antennaFor(c, c.genMb);
      if (better !== d.antenna && PARTS[better].rate > d.antenna.rate) add(`Only ${fmtPct(c.dataRatio)} of your data will get home. A bigger dish sends more.`, { arg: 'part:' + better, label: 'Fit the ' + PARTS[better].name.toLowerCase() });
    }
    if (!c.arrivalOk) add(`The trip takes too long for the deadline. Pick the faster route in More settings.`, (() => {
      const k = Object.keys(m.trajs).find(t => m.trajs[t].cruise <= m.window); return k ? { arg: 'traj:' + k, label: 'Take the ' + m.trajs[k].name.toLowerCase() } : null; })());
  }
  return {
    checks: [['Parts', essentials], ['Science', science], ['Fits the rocket', fits], ['Budget', budgetOk], ['Power', powerOk]],
    next: out[0] || null
  };
}
function swapFix(from, to) {
  const pos = allPartsWithPos(S.build).find(x => x.id === from);
  return pos ? { arg: `swap:${pos.type}:${pos.idx}:${to}`, label: 'Swap in the ' + PARTS[to].name.toLowerCase() } : partFix(to, 'Add the');
}
function coachHtml(c) {
  if (!isSimple()) return '';
  const k = coachSteps(c);
  const next = k.next;
  const say = next ? esc(next.text) : (review(S.build, S.plan, S.mission, c).some(i => i.level === 'warn')
    ? 'Ready to fly! The launch review will show a few amber risks. You can fly with them, or fix them for a better score.'
    : 'Looks great! Everything is green. Head to the launch review.');
  const btn = next && next.fix && next.fix.locked ? `<button class="btn ghost small" disabled>👤 ${esc(next.fix.label)}</button>`
    : next && next.fix ? `<button class="btn primary small" data-act="coachFix" data-arg="${next.fix.arg}">✨ ${esc(next.fix.label)}</button>`
    : !next ? '<button class="btn primary small" data-act="toReview">Launch review →</button>' : '';
  return `<div class="coach" id="coach"><div class="face" style="--crew:${CREW.ollie.color}" aria-hidden="true">${FACES.crew.ollie}</div>
    <div class="coach-body"><b style="color:${CREW.ollie.color}">Ollie</b> <span class="small muted">· your coach</span><p>${say}</p>
      <div class="row gap wrap">${btn}<span class="checks">${k.checks.map(([l, ok]) => `<span class="check ${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${l}</span>`).join('')}</span></div></div></div>`;
}
function coachFix(arg) {
  const [kind, a, b, x] = String(arg).split(':');
  if (kind === 'part') autoPlace(a);
  else if (kind === 'bus') { const dropped = resizeBuild(S.build, a); if (dropped.length) toast('Removed to fit: ' + dropped.join(', ')); syncFuel(); saveBuild(); refreshHangar(true); }
  else if (kind === 'lv' && canAct('lead')) { S.plan.lv = a; syncFuel(); saveBuild(); refreshHangar(true); }
  else if (kind === 'orbit' && canAct('lead')) { S.plan.orbit = a; syncFuel(); saveBuild(); refreshHangar(true); }
  else if (kind === 'traj' && canAct('lead')) { S.plan.traj = a; syncFuel(); saveBuild(); refreshHangar(true); }
  else if (kind === 'remove') removePart(a, +b);
  else if (kind === 'swap') { S.build.slots[a][+b] = null; if (!place(x, a, +b)) { S.build.slots[a][+b] = null; afterDesignChange(); } }
}

// ---------- the first-time hangar tour (six spotlight steps) ----------
const TOUR = [
  { sel: '#meters', text: 'These six meters are your spacecraft\'s health. Green is good, amber is risky, red stops the launch. Press any ? to learn what it means.' },
  { sel: '.ship', text: 'This is your spacecraft. Each mount takes one kind of part: engine at the bottom, antenna on top, wings on the sides, instruments and electronics in the body.' },
  { sel: '#shelf', text: 'The shelf. Drag a part onto a glowing mount, or just tap it to fit it. Parts marked ★ Goal help your science goal.' },
  { sel: '#coach', text: 'That\'s me! I always show the next thing to fix, and I can do it for you if you\'re stuck.' },
  { sel: '[data-act="autoBuild"]', text: 'In a hurry? Auto-build makes a simple spacecraft that works. Then you can make it your own.' },
  { sel: '[data-act="toReview"]', text: 'When the meters look good, go to the launch review. Real missions have to pass one too. Good luck!' }
];
let tourState = null;
function startTour() {
  endTour(true);
  if (S.screen !== 'hangar') return;
  if (S.hangarTab !== 'build') { S.hangarTab = 'build'; rerender(); }
  tourState = { i: 0, raf: 0 };
  const el = document.createElement('div');
  el.id = 'tour'; el.className = 'tour';
  el.innerHTML = '<div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(el);
  tourStep();
  const follow = () => {
    if (!tourState) return;
    if (S.screen !== 'hangar') { endTour(true); return; }
    const t = document.querySelector(TOUR[tourState.i].sel), spot = el.querySelector('.tour-spot'), tip = el.querySelector('.tour-tip');
    if (t) {
      const r = t.getBoundingClientRect(), pad = 6;
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      // tip goes at the top or bottom of the screen, whichever the target leaves free
      const below = r.top + r.height / 2 < innerHeight / 2;
      tip.classList.toggle('at-bottom', below); tip.classList.toggle('at-top', !below);
    }
    tourState.raf = requestAnimationFrame(follow);
  };
  tourState.raf = requestAnimationFrame(follow);
}
function tourStep() {
  const el = document.getElementById('tour'); if (!el || !tourState) return;
  const st = TOUR[tourState.i], last = tourState.i === TOUR.length - 1;
  el.querySelector('.tour-tip').innerHTML = `<div class="row gap"><div class="face" style="--crew:${CREW.ollie.color}" aria-hidden="true">${FACES.crew.ollie}</div>
    <p>${st.text}</p></div><div class="row between"><span class="small muted">${tourState.i + 1} / ${TOUR.length}</span>
    <div class="row gap"><button class="btn ghost small" data-act="tourSkip">Skip tour</button><button class="btn primary small" data-act="tourNext">${last ? 'Let\'s build!' : 'Next ▸'}</button></div></div>`;
  const t = document.querySelector(st.sel);
  if (t) t.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  const b = el.querySelector('[data-act="tourNext"]'); if (b) b.focus({ preventScroll: true });
}
function tourNext() {
  if (!tourState) return;
  do { tourState.i++; } while (tourState.i < TOUR.length && !document.querySelector(TOUR[tourState.i].sel));
  if (tourState.i >= TOUR.length) { endTour(); return; }
  tourStep();
}
function endTour(silent) {
  if (tourState) cancelAnimationFrame(tourState.raf);
  tourState = null;
  const el = document.getElementById('tour'); if (el) el.remove();
  if (!silent) store.set('ceruvia-tour', '1');
}

// ---------- challenge resources: phase bar, ConOps timeline, trajectory diagram ----------
// Phase bar with JPL Concept Maturity Level labels. Shown on the planning screens.
function phaseBar() {
  const cur = PHASES.findIndex(p => p.screens.includes(S.screen));
  if (cur < 0) return '';
  return `<nav class="mphases" aria-label="Mission phase" title="CML means Concept Maturity Level, a JPL scale for how far a mission idea has grown.">
    <ol>${PHASES.map((p, i) => `<li class="${i < cur ? 'done' : i === cur ? 'cur' : ''}"${i === cur ? ' aria-current="step"' : ''}>
      <b>${i < cur ? '✓ ' : ''}${p.label}</b><span>${p.cml}</span></li>`).join('')}</ol></nav>`;
}

// A duration in years as days, months or years.
function fmtDur(y) {
  if (y < 1 / 12) return plural(Math.max(1, Math.round(y * 365)), 'day');
  if (y < 1.5) return plural(Math.max(1, Math.round(y * 12)), 'month');
  return `${y.toFixed(1)} years`;
}

// Concept of operations: every stage from build-and-test to the end, as a bar plus a list.
function conopsHtml(c, m, plan) {
  const d = c.d, steps = [];
  const add = (icon, name, dur, note, phase, cls) => steps.push({ icon, name, dur, note, phase, cls });
  add('🔧', 'Build and test', devYears(c), 'Assemble the spacecraft, shake it, bake it, check every part.', 'Phase C–D', 'build');
  add('🚀', 'Launch', 0, `On a ${c.lv.name}.`, 'Phase D', 'launch');
  if (c.cruise > 0) add('🛰️', 'Cruise', c.cruise, `${c.traj.name}.${m.hazard ? ' Watch for debris.' : ''}`, 'Phase E', 'cruise');
  if (m.minigames.includes('insertion')) add('🔥', 'Arrive', 0, `Braking burn into ${c.orbit.name.toLowerCase()}.`, 'Phase E', 'launch');
  add('🔬', 'Science', plan.opsMonths / 12, `${plan.opsMonths} months, ${plural(c.passes, 'science pass')}.`, 'Phase E', 'sci');
  if (d.lander) add('🪂', 'Landing', 0, 'The lander flies down to the surface.', 'Phase E', 'launch');
  if (m.minigames.includes('tag') && d.sampler) add('🪨', 'Touch-and-go', 0, 'Grab a sample from the surface.', 'Phase E', 'launch');
  if (m.crisis) add('⚡', m.crisis ? m.crisis.name : 'Power emergency', 0, 'Keep the spacecraft alive.', 'Phase E', 'launch');
  if (m.needReturn) {
    add('🏠', 'Trip home', c.cruise, 'Departure burn, then the long way back.', 'Phase E', 'cruise');
    add('🪂', 'Reentry', 0, 'The capsule lands on Earth.', 'Phase E', 'launch');
  }
  add('📊', 'Report', 0, 'Scientists study the data for years.', 'Phase F', 'launch');
  const total = steps.reduce((s, x) => s + x.dur, 0);
  const bar = steps.map(x => `<span class="cseg ${x.cls}" style="flex-grow:${x.dur ? Math.max(x.dur, total * 0.02).toFixed(3) : 0}" title="${esc(x.name)}"><i aria-hidden="true">${x.icon}</i></span>`).join('');
  const list = steps.map(x => `<li><span class="cicon" aria-hidden="true">${x.icon}</span><div><b>${esc(x.name)}</b>${x.dur ? ` <span class="mono small">${fmtDur(x.dur)}</span>` : ''}
    <span class="pill">${x.phase}</span><br><span class="small muted">${esc(x.note)}</span></div></li>`).join('');
  return `<div class="conops"><div class="cbar" role="img" aria-label="Timeline: about ${total.toFixed(1)} years from the start of building to the end of the mission">${bar}</div>
    <div class="cscale small muted"><span>Start of building</span><span>${total.toFixed(1)} years</span></div>
    <ol class="clist">${list}</ol></div>`;
}

// Trajectory diagram, drawn as SVG for the chosen route and orbit. Not to scale.
const TRAJ_COLOR = { earth: '#4fa3ff', moon: '#cfd3e6', asteroid: '#b8977a', mars: '#e2683c', ceruvia: '#8fe3ff' };
function trajSvg(m, plan) {
  const traj = m.trajs[plan.traj] || Object.values(m.trajs)[0], orbit = m.orbits[plan.orbit] || Object.values(m.orbits)[0];
  const tKey = plan.traj in m.trajs ? plan.traj : Object.keys(m.trajs)[0];
  const body = (x, y, r, col, name, anchor, dy) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="var(--ink)" stroke-width="1.5"/>` +
    (name ? `<text x="${x}" y="${y + (dy || r + 13)}" text-anchor="${anchor || 'middle'}" class="tlabel">${esc(name)}</text>` : '');
  const ell = (cx, cy, rx, ry, cls, rot) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="${cls}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`;
  let g = '';
  if (m.planet === 'earth') {
    const polar = !!orbit.polar;
    g += ell(160, 100, polar ? 26 : 92, polar ? 82 : 26, 'tpath', polar ? 10 : -14);
    g += body(160, 100, 34, TRAJ_COLOR.earth, '');
    g += `<text x="160" y="104" text-anchor="middle" class="tlabel strong">Earth</text>`;
    g += `<circle cx="${polar ? 165 : 248}" cy="${polar ? 20 : 79}" r="5" class="tship"/>`;
    g += `<text x="12" y="20" class="tlabel">${esc(orbit.name)}</text>`;
  } else if (m.planet === 'moon') {
    g += `<path d="M 40 196 A 230 230 0 0 1 300 30" class="torbit"/>`;
    g += body(50, 130, 22, TRAJ_COLOR.earth, 'Earth');
    if (tKey === 'weak') g += `<path d="M 68 118 C 170 -60 360 20 266 76" class="tpath"/><text x="312" y="14" text-anchor="end" class="tlabel">Loop out past the Moon</text>`;
    else g += `<path d="M 70 120 Q 170 60 262 82" class="tpath"/>`;
    g += ell(272, 86, 20, 9, 'tpath thin', orbit.polar ? 80 : 0);
    g += body(272, 86, 10, TRAJ_COLOR.moon, 'Moon', 'middle', 28);
  } else {
    // Around the Sun: Earth's orbit on the inside, the target's on the outside, squashed for perspective.
    const k = 0.6, cx = 165, cy = 96, r1 = 58;
    const r2 = { asteroid: 96, mars: 112, ceruvia: 136 }[m.planet] || 110;
    g += ell(cx, cy, r1, r1 * k, 'torbit') + ell(cx, cy, r2, r2 * k, 'torbit');
    g += `<circle cx="${cx}" cy="${cy}" r="9" fill="var(--accent)"/><text x="${cx}" y="${cy + 22}" text-anchor="middle" class="tlabel">Sun</text>`;
    const ex = cx - r1, tx = cx + r2, a = (r1 + r2) / 2;
    if (tKey === 'assist') {
      const rj = 108;
      g += ell(cx, cy, rj, rj * k, 'torbit');
      g += `<path d="M ${ex} ${cy} Q ${ex - 6} ${cy - 70} ${cx} ${cy - rj * k}" class="tpath"/><path d="M ${cx} ${cy - rj * k} Q ${tx - 10} ${cy - rj * k - 20} ${tx} ${cy}" class="tpath"/>`;
      g += body(cx, cy - rj * k, 7, '#e0b080', 'Jupiter boost', 'middle', -11);
    } else {
      g += `<path d="M ${ex} ${cy} A ${a} ${a * k} 0 0 1 ${tx} ${cy}" class="tpath"/>`;
    }
    if (tKey === 'flyby') g += ell(cx - 4, cy, r1 + 6, (r1 + 6) * k, 'tpath thin') + `<text x="${cx}" y="${cy + r1 * k + 22}" text-anchor="middle" class="tlabel">1 loop, then Earth flyby</text>`;
    if (m.needReturn) g += `<path d="M ${tx} ${cy + 4} A ${a} ${a * k} 0 0 1 ${ex} ${cy + 4}" class="tret"/>`;
    if (tKey === 'aero') g += ell(tx, cy, 18, 9, 'tpath thin') + ell(tx, cy, 13, 6, 'tpath thin') + `<text x="${tx}" y="${cy + 36}" text-anchor="end" class="tlabel">Aerobraking</text>`;
    else g += ell(tx, cy, 14, 6, 'tpath thin');
    g += body(ex, cy, 7, TRAJ_COLOR.earth, '') + `<text x="${ex - 11}" y="${cy + 4}" text-anchor="end" class="tlabel">Earth</text>`;
    g += body(tx, cy, m.planet === 'asteroid' ? 4 : 7, TRAJ_COLOR[m.planet] || '#fff', '') +
      `<text x="${tx - 10}" y="${cy - 12}" text-anchor="end" class="tlabel">${esc(m.target)}</text>`;
  }
  const legend = m.needReturn && m.planet !== 'earth' && m.planet !== 'moon'
    ? `<line x1="12" y1="190" x2="30" y2="190" class="tpath"/><text x="35" y="193" class="tlabel">Out</text><line x1="64" y1="190" x2="82" y2="190" class="tret"/><text x="87" y="193" class="tlabel">Home</text>` : '';
  return `<figure class="traj"><svg viewBox="0 0 320 200" role="img" aria-label="${esc(`Trajectory: ${traj.name}, then ${orbit.name}`)}">${g}${legend}</svg>
    <figcaption class="small"><b>${esc(traj.name)}</b> → ${esc(orbit.name)}. <span class="muted">${esc(traj.desc)} Not to scale.</span></figcaption></figure>`;
}
