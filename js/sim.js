/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Pure engineering maths. No DOM, no side effects. Real relationships, simplified numbers.
   Every number on the dashboard comes from calc(). */

// ---------- builds ----------
const SLOT_TYPES = ['engine', 'antenna', 'top', 'bottom', 'side', 'bay', 'core'];

function slotCounts(busKey) {
  const b = BUSES[busKey];
  return { engine: 1, antenna: 1, top: 1, bottom: 1, side: b.side, bay: b.bays, core: b.core };
}
function emptyBuild(busKey) {
  busKey = busKey || 'medium';
  const n = slotCounts(busKey), slots = {};
  for (const t of SLOT_TYPES) slots[t] = Array(n[t]).fill(null);
  return { bus: busKey, slots };
}
// Change bus size, keeping as many parts as fit. Returns the ids that were dropped.
function resizeBuild(build, busKey) {
  const n = slotCounts(busKey), dropped = [];
  for (const t of SLOT_TYPES) {
    const ids = (build.slots[t] || []).filter(Boolean);
    while (ids.length > n[t]) dropped.push(ids.pop());
    build.slots[t] = ids.concat(Array(n[t] - ids.length).fill(null));
  }
  build.bus = busKey;
  return dropped;
}
function allParts(build) {
  const out = [];
  for (const t of SLOT_TYPES) for (const id of (build.slots[t] || [])) if (id && PARTS[id]) out.push(id);
  return out;
}

// Turn slot contents into the facts the maths needs.
function derive(build) {
  const ids = allParts(build);
  const d = { ids, engine: null, antenna: null, capsule: null, lander: null, instruments: [], sampler: false,
    solarKw: 0, solarWings: 0, span: 0, rtg: 0, batteryWh: 0, fuelcell: 0, computer: null, adcs: null, recorder: null, shields: 0 };
  for (const id of ids) {
    const p = PARTS[id];
    if (p.slot === 'engine') d.engine = p;
    else if (p.slot === 'antenna') d.antenna = p;
    else if (id === 'capsule') d.capsule = p;
    else if (id === 'lander') d.lander = p;
    if (p.inst) d.instruments.push(id);
    if (id === 'sampler') d.sampler = true;
    if (p.kw) { d.solarKw += p.kw; d.solarWings++; }
    if (p.span) d.span += p.span;
    if (p.watts) d.rtg++;
    if (p.wh) { if (p.emergency) d.fuelcell += p.wh; else d.batteryWh += p.wh; }
    if (p.kind === 'computer') d.computer = p;
    if (p.kind === 'adcs') d.adcs = p;
    if (p.kind === 'recorder') d.recorder = p;
    if (id === 'shield') d.shields++;
  }
  return d;
}

// ---------- physics pieces ----------
function solarAt(kw, au) { return kw * 1000 / (au * au) * (au > 3 ? 1.2 : 1); }
function rtgAt(n, years) { return n * RTG_W * Math.pow(1 - RTG_DECAY, years); }

// Rocket equation with the lander dropped before the departure burn.
function fuelRequired(dry, landerMass, dvIns, dvDep, ve) {
  const mEnd = dry - landerMass;
  const mBeforeDep = mEnd * Math.exp(dvDep / ve);
  const mBeforeIns = (mBeforeDep + landerMass) * Math.exp(dvIns / ve);
  return Math.max(0, mBeforeIns - dry);
}

function missionBudget(m, diffKey, bonus) {
  return m.budget * DIFF[diffKey].budgetMult + (bonus || 0);
}

function defaultPlan(m) {
  return { lv: 'condor', traj: Object.keys(m.trajs)[0], orbit: Object.keys(m.orbits)[0], fuel: 0, manualFuel: false,
           opsMonths: m.ops[2], ground: 'network', goal: null };
}

// ---------- the one big calculation ----------
function calc(build, plan, m, diffKey, bonus) {
  const d = derive(build);
  const bus = BUSES[build.bus];
  const lv = LAUNCHERS[plan.lv] || LAUNCHERS.condor;
  const traj = m.trajs[plan.traj] || Object.values(m.trajs)[0];
  const orbit = m.orbits[plan.orbit] || Object.values(m.orbits)[0];
  const ground = GROUND[plan.ground] || null;
  const P = d.ids.map(id => PARTS[id]);
  const c = { d, bus, lv, traj, orbit, ground };

  // Mass
  c.partsMass = P.reduce((s, p) => s + p.mass, 0);
  c.structMass = bus.mass + STRUCT_FRAC * c.partsMass;
  c.fuel = Math.max(0, plan.fuel || 0);
  c.tankMass = TANK_FRAC * c.fuel;
  c.dry = c.partsMass + c.structMass + c.tankMass;
  c.wet = c.dry + c.fuel;
  c.capacity = lv.leo * m.capFactor * traj.lf * (orbit.cap || 1);
  c.massMargin = (c.capacity - c.wet) / c.capacity;

  // Fuel
  c.isp = d.engine ? d.engine.isp : 300;
  c.ve = c.isp * G0 / 1000;
  c.dvIns = traj.dvIns + orbit.dv + 0.05;
  c.dvDep = m.needReturn ? traj.dvDep : 0;
  c.landerMass = d.lander ? d.lander.mass : 0;
  c.fuelReq = fuelRequired(c.dry, c.landerMass, c.dvIns, c.dvDep, c.ve);
  c.fuelMargin = c.fuelReq > 0 ? (c.fuel - c.fuelReq) / c.fuelReq : 1;

  // Power (sized for conditions at the target, after the cruise)
  const slow = d.engine && d.engine.slow;
  c.cruise = traj.cruise * (slow ? 1.25 : 1);
  c.solarW = solarAt(d.solarKw, m.au);
  c.rtgW = rtgAt(d.rtg, c.cruise);
  c.heater = m.au > 3 ? HEATER_W : HEATER_W / 2;
  c.baseLoad = c.heater + (d.computer ? d.computer.power : 0) + (d.adcs ? d.adcs.power : 0) + (d.recorder ? d.recorder.power : 0);
  c.instP = d.instruments.reduce((s, id) => s + PARTS[id].power, 0) + (d.sampler ? PARTS.sampler.power : 0);
  c.antP = d.antenna ? d.antenna.power : 0;
  c.load = c.baseLoad + c.instP + c.antP;
  c.avgGen = c.rtgW + c.solarW * (1 - orbit.eclipse);
  c.powerMargin = c.load > 0 ? (c.avgGen - c.load) / c.load : 1;
  c.eclipseWh = Math.max(0, c.load - c.rtgW) * orbit.eclipse * 2;
  c.batteryOk = d.batteryWh >= c.eclipseWh;
  let duty = 1;
  if (c.avgGen < c.load) duty = c.instP > 0 ? Math.min(1, Math.max(0, (c.avgGen - c.baseLoad - c.antP) / c.instP)) : 0;
  if (!c.batteryOk && c.eclipseWh > 0) duty *= 1 - orbit.eclipse * (1 - d.batteryWh / c.eclipseWh);
  c.duty = duty;
  c.ionOk = !slow || c.avgGen >= d.engine.minPower;
  if (!c.ionOk) c.cruise *= 1.5; // a starved ion engine limps along

  // Data
  c.genMb = d.instruments.reduce((s, id) => s + PARTS[id].data, 0) * orbit.dataFactor * duty;
  c.downMb = d.antenna && ground ? d.antenna.rate * 28.8 * m.comm * ground.hours / 8 : 0;
  c.dataRatio = c.genMb > 0 ? Math.min(1, c.downMb / c.genMb) : 1;
  c.backlogMb = Math.max(0, c.genMb - c.downMb) * 30 * m.passMonths;
  c.recorderOk = !!d.recorder && d.recorder.gb * 1000 >= c.backlogMb;

  // Cost and schedule
  c.hwCost = P.reduce((s, p) => s + p.cost, 0) + bus.cost;
  c.lvCost = lv.cost;
  c.opsCost = c.cruise * (m.needReturn ? 2 : 1) * 12 + plan.opsMonths * m.opsPerMonth;
  c.groundCost = ground ? ground.cost : 0;
  c.cost = c.hwCost + c.lvCost + c.opsCost + c.groundCost;
  c.budget = missionBudget(m, diffKey, bonus);
  c.budgetLeft = c.budget - c.cost;
  c.passes = Math.max(1, Math.floor(plan.opsMonths / m.passMonths));
  c.arrivalOk = !m.window || c.cruise <= m.window;
  c.missionYears = c.cruise * (m.needReturn ? 2 : 1) + plan.opsMonths / 12;
  return c;
}

// Fuel needed plus 8%, rounded up to 10 kg. Tank mass depends on fuel, so iterate.
function autoFuel(build, plan, m, diffKey, bonus) {
  let fuel = 0;
  const p = Object.assign({}, plan);
  for (let i = 0; i < 30; i++) { p.fuel = fuel; fuel = calc(build, p, m, diffKey, bonus).fuelReq; }
  return Math.min(FUEL_CAP, Math.ceil(fuel * 1.08 / 10) * 10);
}

// Build-and-test time before launch (shown first on the ConOps timeline).
function devYears(c) {
  const d = c.d;
  return 1.5 + 0.06 * d.ids.length + (d.lander ? 0.5 : 0) + (d.capsule ? 0.4 : 0) + (d.rtg ? 0.6 : 0) + (d.engine && d.engine.slow ? 0.3 : 0);
}

// ---------- science goal ----------
// Parts that serve an objective: the listed parts, or any instrument whose discoveries carry the goal's tag.
function goalParts(m, id) {
  const need = GOAL_NEEDS[id];
  if (!need) return [];
  if (need.parts) return need.parts.slice();
  const out = new Set();
  for (const s of m.sites) for (const [k, f] of Object.entries(s.finds)) if (f.tag === need.tag) out.add(k === 'land' ? 'lander' : k);
  if (m.tagFinding && m.tagFinding.tag === need.tag) out.add('sampler');
  return [...out];
}

// Can an instrument on board find this site's discovery from this orbit?
function canSee(instId, site, orbit) {
  if (Math.abs(site.lat) > orbit.maxLat) return false;
  const p = PARTS[instId];
  if (p.low && !orbit.detail) return false;
  return true;
}

// The best result this design could possibly get: every reachable discovery, a perfect landing, and so on.
function bestCaseR(build, plan, m) {
  const d = derive(build);
  const orbit = m.orbits[plan.orbit] || Object.values(m.orbits)[0];
  const found = new Set(), tags = {}, sites = new Set();
  const add = (f, site) => { if (found.has(f.id)) return; found.add(f.id); tags[f.tag] = (tags[f.tag] || 0) + 1; if (site) sites.add(site.id); };
  for (const s of m.sites) for (const [k, f] of Object.entries(s.finds)) {
    if (k === 'land') { if (d.lander) add(f, s); }
    else if (d.instruments.includes(k) && canSee(k, s, orbit)) add(f, s);
  }
  const tagOk = d.sampler && !!m.tagFinding;
  if (tagOk) add(m.tagFinding);
  return { found, tags, sitesWithFinds: sites.size, clueCount: Object.keys(tags).length,
    landed: !!d.lander, tagOk, capsuleLanded: !!d.capsule,
    crisisClean: d.rtg > 0 || d.batteryWh >= 2000 || d.fuelcell > 0, dataReturned: 1 };
}

function goalStatus(build, plan, m, id) {
  const obj = m.objectives.find(o => o.id === id);
  if (!obj) return { ok: false, have: [], orbitOk: true };
  const d = derive(build), need = GOAL_NEEDS[id] || {};
  const have = goalParts(m, id).filter(p => d.ids.includes(p));
  const orbit = m.orbits[plan.orbit] || Object.values(m.orbits)[0];
  const orbitOk = need.orbit !== 'polar' || orbit.maxLat >= 70;
  return { ok: orbitOk && obj.check(bestCaseR(build, plan, m)), have, orbitOk };
}

// ---------- launch review ----------
const SEGMENTS = {
  launch:  { name: 'Launch segment',  icon: '🚀', desc: 'The rocket and the route that get the spacecraft to its target.' },
  space:   { name: 'Space segment',   icon: '🛰️', desc: 'The spacecraft itself: power, fuel, computers and instruments.' },
  ground:  { name: 'Ground segment',  icon: '📡', desc: 'The dishes on Earth that talk to the spacecraft and collect its data.' },
  user:    { name: 'User segment',    icon: '🔬', desc: 'The scientists and other people who will use the data.' },
  mission: { name: 'Whole mission',   icon: '🧭', desc: 'Money and time for everything together.' }
};
const SEG_OF = {
  'Too heavy for the rocket': 'launch', 'Fits the rocket': 'launch', 'Arrives after the deadline': 'launch', 'Arrival time': 'launch',
  'Over budget': 'mission', 'Budget': 'mission', 'Thin budget reserve': 'mission',
  'Ground stations missing data': 'ground', 'Ground link': 'ground', 'No ground stations': 'ground', 'Single ground station': 'ground',
  'No science instruments': 'user', 'Prime goal at risk': 'user', 'Prime goal': 'user', 'Instrument needs a low orbit': 'user', 'High-res camera too far away': 'user'
};

function reviewItems(build, plan, m, c) {
  const d = c.d, out = [];
  const block = (title, why) => out.push({ level: 'block', title, why });
  const warn = (title, why) => out.push({ level: 'warn', title, why });
  const ok = (title, why) => out.push({ level: 'ok', title, why });
  const pct = x => Math.round(x * 100) + '%';

  // Missing essentials
  if (!d.engine) block('No engine', 'Without an engine you cannot brake into orbit or steer. Add one to the engine mount.');
  if (!d.antenna) block('No antenna', 'Without an antenna the spacecraft cannot talk to Earth. Add one to the antenna mount.');
  if (!d.computer) block('No flight computer', 'The computer runs everything on board. Add one to an internal slot.');
  if (!d.adcs) block('No pointing system', 'Reaction wheels point the instruments, antenna and engine. Add them to an internal slot.');
  if (!d.batteryWh) block('No battery', 'The battery keeps you alive in shadow and during burns. Add one to an internal slot.');
  if (!d.solarKw && !d.rtg) block('No power source', 'Nothing makes electricity. Add a solar wing or an RTG to a side mount.');
  if (!d.recorder) block('No data recorder', 'Science data needs somewhere to wait until it can be sent home. Add a recorder.');
  if (!d.instruments.length && !d.lander) block('No science instruments', 'A spacecraft with no instruments cannot do science. Add one to an instrument bay.');

  // Mass
  if (c.massMargin < 0) block('Too heavy for the rocket', `You weigh ${fmtKg(c.wet)} but the ${c.lv.name} can only send ${fmtKg(c.capacity)} on this route. Remove parts, pick a route that needs less fuel, or choose a bigger rocket.`);
  else ok('Fits the rocket', `${fmtKg(c.wet)} of ${fmtKg(c.capacity)}: ${pct(c.massMargin)} to spare.`);

  // Budget
  if (c.budgetLeft < 0) block('Over budget', `The mission costs ${fmtM(c.cost)} but you have ${fmtM(c.budget)}. The rocket is ${fmtM(c.lvCost)} of that.`);
  else if (isFinite(c.budget) && c.budgetLeft < c.budget * 0.03) warn('Thin budget reserve', `Only ${fmtM(c.budgetLeft)} left. Real missions keep a reserve, because a budget cut could cancel a science pass.`);
  else ok('Budget', isFinite(c.budget) ? `${fmtM(c.budgetLeft)} left in reserve.` : 'Unlimited in Sandbox.');

  // Fuel
  if (c.fuelMargin < 0) warn('Not enough fuel', `You need about ${fmtKg(c.fuelReq)} and carry ${fmtKg(c.fuel)}. You may not make it into orbit${m.needReturn ? ', or home' : ''}.`);
  else if (c.fuelMargin < 0.05) warn('Little spare fuel', `Only ${pct(c.fuelMargin)} spare. A leak or a detour could leave you short.`);
  else ok('Fuel', `${fmtKg(c.fuel)} carried for ${fmtKg(c.fuelReq)} needed: ${pct(c.fuelMargin)} spare.`);

  // Schedule
  if (!c.arrivalOk) warn('Arrives after the deadline', `The trip takes ${c.cruise.toFixed(1)} years and the deadline is ${m.window} years. Pick a faster route or a chemical engine.`);
  else if (m.window) ok('Arrival time', `${c.cruise.toFixed(1)} years, inside the ${m.window}-year deadline.`);

  // Power
  if (!c.ionOk) warn('Ion engine starved of power', `The ion engine needs ${d.engine.minPower} W but you make about ${fmtW(c.avgGen)} out here. It will crawl, and the trip takes much longer.`);
  if (c.powerMargin < 0) warn('Power deficit', `You use ${fmtW(c.load)} but make ${fmtW(c.avgGen)} on average. Instruments will run only ${pct(c.duty)} of the time.`);
  else ok('Power', `${fmtW(c.avgGen)} made for ${fmtW(c.load)} used: ${pct(c.powerMargin)} spare.`);
  if (!c.batteryOk) warn('Battery too small for eclipses', `Each pass through shadow needs ${Math.round(c.eclipseWh)} Wh but the battery holds ${d.batteryWh} Wh.`);

  // Data and ground
  if (!c.ground) warn('No ground stations', 'Nobody on Earth is listening. Pick ground stations in the Plan tab.');
  else if (c.dataRatio < 0.9) {
    const withPriority = c.genMb > 0 ? Math.min(1, c.downMb * 16 / c.ground.hours / c.genMb) : 1;
    if (c.ground.hours < 16 && withPriority >= 0.9) warn('Ground stations missing data', `Only ${pct(c.dataRatio)} of the data gets home. More dish time on Earth would fix it.`);
    else warn("Antenna can't keep up", `Instruments make ${fmtMb(c.genMb)} a day but only ${fmtMb(c.downMb)} gets home. Fit a bigger dish or carry fewer big instruments.`);
  } else ok('Ground link', `${pct(c.dataRatio)} of the data gets home.`);
  if (c.ground && c.ground.hours < 8 && m.hazard > 0) warn('Single ground station', 'If that one dish breaks, nobody can hear you. A network has spares.');
  if (d.recorder && !c.recorderOk) warn('Recorder will overflow', `Unsent data piles up faster than the ${d.recorder.gb} Gb recorder can hold it.`);

  // Mission-specific hardware
  const ids = m.objectives.map(o => o.id);
  if (m.needReturn && !d.capsule) warn('No return capsule', 'This mission needs to bring something home. Only a capsule survives reentry.');
  if (ids.includes('land') && !d.lander) warn('No lander', 'One objective needs a landing. Add the lander to the bottom mount.');
  if (ids.includes('tag') && !d.sampler) warn('No sample arm', 'One objective needs a sample. Add the sample collector arm to a bay.');
  if (m.crisis && !(d.rtg || d.batteryWh >= 2000 || d.fuelcell)) warn('Weak backup power', `A ${m.crisis.name.toLowerCase()} is coming. An RTG, a big battery or a fuel cell would keep the lights on.`);

  // Instruments vs orbit
  if (!c.orbit.detail) {
    if (d.instruments.includes('mspec')) warn('Instrument needs a low orbit', 'The mass spectrometer must fly through the gas it tastes. It will find nothing from a high orbit.');
    if (d.instruments.includes('hirc')) warn('High-res camera too far away', 'From this orbit the high-res camera sees no more detail than a cheap one.');
  }
  if (c.orbit.radRisk >= 0.02 && d.computer && !d.computer.radHard) warn('Radiation risk', 'This orbit is full of radiation. A standard computer may crash. A rad-hard one will not.');
  if (m.hazard > 0 && !d.shields) warn('No debris shield', 'The cruise crosses a debris field. Without a shield, every hit breaks a part.');

  // Prime goal
  if (plan.goal) {
    const g = goalStatus(build, plan, m, plan.goal), obj = m.objectives.find(o => o.id === plan.goal);
    if (!g.ok) warn('Prime goal at risk', `This design cannot "${obj.text.toLowerCase()}". ${GOAL_NEEDS[plan.goal].why}`);
    else ok('Prime goal', `The design can "${obj.text.toLowerCase()}".`);
  }
  return out;
}

function review(build, plan, m, c) {
  return reviewItems(build, plan, m, c).map(i => Object.assign(i, { seg: SEG_OF[i.title] || 'space' }));
}

// ---------- formatters ----------
function fmtKg(x) { return x >= 10000 ? (x / 1000).toFixed(1) + ' t' : Math.round(x).toLocaleString('en-US') + ' kg'; }
function fmtW(x) { return x >= 10000 ? (x / 1000).toFixed(1) + ' kW' : Math.round(x).toLocaleString('en-US') + ' W'; }
function fmtM(x) { return isFinite(x) ? '$' + Math.round(x).toLocaleString('en-US') + 'M' : '∞'; }
function fmtPct(x) { return Math.round(x * 100) + '%'; }
function fmtMb(x) { return x >= 1000 ? (x / 1000).toFixed(1) + ' Gb' : Math.round(x) + ' Mb'; }
function fmtGb(x) { return x >= 1000 ? (x / 1000).toFixed(1) + ' Tb' : Math.round(x) + ' Gb'; }
