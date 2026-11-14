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
