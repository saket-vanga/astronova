/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* All content and tuning lives in this file. Balance the game here, not in code.
   Units: mass kg, cost $M, power W (solar kw = kW at 1 AU), distance AU, delta-v km/s, time years. */

// ---------- difficulty ----------
const DIFF = {
  rookie:   { label: 'Beginner',        budgetMult: 1.5,  events: 1, retries: 3, tol: 1.7,  simple: true,
              desc: 'Start here. Extra money, fuel fills itself, a coach tells you what to do next, and easy piloting.' },
  cadet:    { label: 'Cadet',           budgetMult: 1.3,  events: 1, retries: 2, tol: 1.4,
              desc: 'More money, gentler piloting, two retries on landings.' },
  engineer: { label: 'Engineer',        budgetMult: 1,    events: 2, retries: 1, tol: 1,
              desc: 'Realistic budgets and one retry on landings.' },
  director: { label: 'Flight Director', budgetMult: 0.85, events: 3, retries: 0, tol: 0.75,
              desc: 'Tight money, harder piloting, no retries.' },
  sandbox:  { label: 'Sandbox',         budgetMult: Infinity, events: 0, retries: 9, tol: 1.4, allOpen: true,
              desc: 'Every mission and part unlocked, no budget limit.' }
};
const DIFF_ORDER = ['rookie', 'cadet', 'engineer', 'director', 'sandbox'];
const STAR_BONUS = 30; // $M added to later budgets per star earned

// Lowercase just the first letter, so "Battery (600 Wh)" reads well mid-sentence and Earth, RTG and Wh keep their capitals.
function lc1(t) { t = String(t); return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

// ---------- crew and co-op roles ----------
const CREW = {
  vega:  { name: 'Director Vega',  job: 'Mission director',  color: '#ff6b9d' },
  hale:  { name: 'Dr. Imani Hale', job: 'Chief scientist',   color: '#5ee6c8' },
  ollie: { name: 'Ollie Park',     job: 'Flight dynamics',   color: '#ffd166' }
};
const ROLES = {
  lead: { name: 'Mission Lead', icon: '🧭', desc: 'Picks the mission, science goal, route, orbit and ground stations. Flies the cruise and reentry.' },
  prop: { name: 'Propulsion',   icon: '🚀', desc: 'Owns engines, the lander and the capsule. Flies the launch and orbit insertion.' },
  sci:  { name: 'Science',      icon: '🔬', desc: 'Owns the instruments. Flies landings and runs the science scans.' },
  pwr:  { name: 'Power & Comms', icon: '🔋', desc: 'Owns power, antennas and avionics. Runs the power emergency.' }
};
const ROLE_ORDER = ['lead', 'prop', 'sci', 'pwr'];
const GAME_ROLE = { launch: 'prop', dodge: 'lead', insertion: 'prop', landing: 'sci', tag: 'sci', reentry: 'lead', scan: 'sci', crisis: 'pwr' };
const CAT_ROLE = { 'Science': 'sci', 'Power': 'pwr', 'Comms': 'pwr', 'Avionics': 'pwr', 'Propulsion': 'prop', 'Landing & return': 'prop' };

// ---------- spacecraft buses ----------
const BUSES = {
  small:  { name: 'Small bus',  bays: 3, core: 4, side: 2, mass: 120, cost: 80,  desc: '3 instrument bays, 4 internal slots, 2 side mounts.' },
  medium: { name: 'Medium bus', bays: 5, core: 5, side: 4, mass: 200, cost: 130, desc: '5 instrument bays, 5 internal slots, 4 side mounts.' },
  large:  { name: 'Large bus',  bays: 7, core: 6, side: 6, mass: 320, cost: 200, unlock: 2, desc: '7 instrument bays, 6 internal slots, 6 side mounts.' }
};

// ---------- parts ----------
const CATS = ['Science', 'Power', 'Comms', 'Avionics', 'Propulsion', 'Landing & return'];
const UNIQUE_KINDS = ['computer', 'adcs', 'recorder'];
const PARTS = {
  // Propulsion
  chem:   { slot: 'engine', cat: 'Propulsion', name: 'Bipropellant engine', short: 'Biprop', mass: 60, cost: 30, isp: 320, unlock: 1,
            desc: 'Strong, simple thrust. Isp 320 s.' },
  chemHi: { slot: 'engine', cat: 'Propulsion', name: 'High-performance engine', short: 'Hi-perf', mass: 80, cost: 60, isp: 345, unlock: 3,
            desc: 'Isp 345 s: about 8% less fuel than the basic engine.' },
  ion:    { slot: 'engine', cat: 'Propulsion', name: 'Ion engine', short: 'Ion', mass: 140, cost: 110, isp: 2500, unlock: 3, minPower: 500, slow: true,
            desc: 'Isp 2,500 s, so it needs very little fuel. Gentle thrust adds time, and it needs 500 W at the target.' },
  // Landing & return
  capsule: { slot: 'top', cat: 'Landing & return', name: 'Return capsule', short: 'Capsule', mass: 90, cost: 60, unlock: 3,
             desc: 'Heat shield and parachutes. Lands samples and the recorder on Earth.' },
  lander:  { slot: 'bottom', cat: 'Landing & return', name: 'Surface lander', short: 'Lander', mass: 180, cost: 140, data: 400, unlock: 2,
             desc: 'You pilot it down to any site, even the poles. Heavy and expensive.' },
  sampler: { slot: 'bay', cat: 'Landing & return', name: 'Sample collector arm', short: 'Sampler', mass: 40, cost: 80, power: 20, data: 10, unlock: 3,
             desc: 'Touch-and-go arm or plume catcher. Samples only count if the capsule lands.' },
  // Power
  solarS: { slot: 'side', cat: 'Power', name: 'Solar wing (6 m²)', short: 'Solar S', mass: 30, cost: 10, kw: 2, span: 1, unlock: 1,
            desc: "2 kW at Earth's distance from the Sun. Less farther out." },
  solarL: { slot: 'side', cat: 'Power', name: 'Solar wing (15 m²)', short: 'Solar L', mass: 75, cost: 22, kw: 5, span: 1.6, unlock: 1,
            desc: "5 kW at Earth's distance. A bigger target for debris." },
  solarX: { slot: 'side', cat: 'Power', name: 'Giant solar wing (30 m²)', short: 'Solar XL', mass: 160, cost: 45, kw: 10, span: 2.4, unlock: 4,
            desc: "10 kW at Earth's distance. Huge, heavy and easy to hit." },
  rtg:    { slot: 'side', cat: 'Power', name: 'RTG (nuclear power)', short: 'RTG', mass: 55, cost: 90, watts: 150, span: 0.4, unlock: 4,
            desc: '150 W day or night, anywhere. Loses 1.6% a year. Expensive.' },
  batS:   { slot: 'core', cat: 'Power', name: 'Battery (600 Wh)', short: 'Battery S', mass: 8, cost: 4, wh: 600, unlock: 1,
            desc: 'Carries you through shadows and emergencies.' },
  batL:   { slot: 'core', cat: 'Power', name: 'Battery (2,000 Wh)', short: 'Battery L', mass: 25, cost: 11, wh: 2000, unlock: 2,
            desc: 'Three times the energy of the small battery.' },
  fuelcell: { slot: 'core', cat: 'Power', name: 'Emergency fuel cell', short: 'Fuel cell', mass: 35, cost: 25, wh: 3000, emergency: true, unlock: 4,
            desc: 'A one-time 3,000 Wh boost you start during an emergency.' },
  // Comms
  lga: { slot: 'antenna', cat: 'Comms', name: 'Low-gain antenna', short: 'Low-gain', mass: 3, cost: 3, power: 20, rate: 1, hl: 0, unlock: 1,
         desc: 'Tiny and light. Very slow far from Earth.' },
  mga: { slot: 'antenna', cat: 'Comms', name: 'Medium dish (1.5 m)', short: 'Med dish', mass: 20, cost: 15, power: 45, rate: 12, hl: 1, unlock: 1,
         desc: '12× faster than the low-gain antenna.' },
  hga: { slot: 'antenna', cat: 'Comms', name: 'High-gain dish (3 m)', short: 'High-gain', mass: 55, cost: 40, power: 70, rate: 50, hl: 2, unlock: 1,
         desc: '50× faster than the low-gain antenna.' },
  ka:  { slot: 'antenna', cat: 'Comms', name: 'Ka-band dish (4 m)', short: 'Ka-band', mass: 85, cost: 70, power: 100, rate: 140, hl: 3, unlock: 4,
         desc: 'The best link money can buy.' },
  // Avionics
  compStd: { slot: 'core', cat: 'Avionics', name: 'Standard computer', short: 'Computer', mass: 8, cost: 10, power: 15, kind: 'computer', radHard: false, unlock: 1,
             desc: 'Cheap. Radiation can crash it.' },
  compRad: { slot: 'core', cat: 'Avionics', name: 'Rad-hard computer', short: 'Rad-hard', mass: 12, cost: 35, power: 20, kind: 'computer', radHard: true, unlock: 4,
             desc: 'Shielded against radiation near giant planets.' },
  adcsBasic:   { slot: 'core', cat: 'Avionics', name: 'Reaction wheels', short: 'Wheels', mass: 20, cost: 15, power: 25, kind: 'adcs', agility: 1, mult: 1, spare: false, unlock: 1,
                 desc: 'Points the spacecraft. No spare wheel.' },
  adcsPrecise: { slot: 'core', cat: 'Avionics', name: 'Precision pointing', short: 'Precision', mass: 32, cost: 35, power: 35, kind: 'adcs', agility: 1.35, mult: 1.1, spare: true, unlock: 3,
                 desc: 'Spare wheel and star trackers. +10% science and quicker steering.' },
  rec32:  { slot: 'core', cat: 'Avionics', name: '32 Gb recorder', short: 'Rec 32', mass: 2, cost: 3, power: 4, gb: 32, kind: 'recorder', unlock: 1,
            desc: 'Small data buffer.' },
  rec256: { slot: 'core', cat: 'Avionics', name: '256 Gb recorder', short: 'Rec 256', mass: 4, cost: 8, power: 6, gb: 256, kind: 'recorder', unlock: 1,
            desc: 'Medium data buffer.' },
  rec2t:  { slot: 'core', cat: 'Avionics', name: '2 Tb recorder', short: 'Rec 2T', mass: 8, cost: 20, power: 10, gb: 2000, kind: 'recorder', unlock: 5,
            desc: 'Holds everything.' },
  shield: { slot: 'core', cat: 'Avionics', name: 'Debris shield', short: 'Shield', mass: 25, cost: 12, hits: 2, unlock: 1,
            desc: 'Whipple shield layers. Each one absorbs 2 debris hits during the cruise.' },
  // Science
  wac:   { slot: 'bay', cat: 'Science', name: 'Wide-angle camera', short: 'Wide cam', mass: 12, cost: 25, power: 10, data: 400, inst: true, unlock: 1,
           desc: 'Maps large areas.' },
  hirc:  { slot: 'bay', cat: 'Science', name: 'High-res camera', short: 'Hi-res cam', mass: 30, cost: 60, power: 18, data: 1500, inst: true, detail: true, unlock: 1,
           desc: 'Sees small details from a low orbit. Huge images.' },
  irs:   { slot: 'bay', cat: 'Science', name: 'Infrared spectrometer', short: 'IR spec', mass: 22, cost: 50, power: 15, data: 800, inst: true, unlock: 1,
           desc: 'Reads the chemical fingerprint of ice, rock and organics, and measures heat.' },
  mag:   { slot: 'bay', cat: 'Science', name: 'Magnetometer', short: 'Magnet', mass: 5, cost: 12, power: 4, data: 20, inst: true, unlock: 1,
           desc: 'Light and cheap. Measures magnetic fields.' },
  sig:   { slot: 'bay', cat: 'Science', name: 'Radio receiver', short: 'Radio', mass: 15, cost: 30, power: 12, data: 300, inst: true, unlock: 2,
           desc: 'Listens for the Ceruvia signal.' },
  radar: { slot: 'bay', cat: 'Science', name: 'Ground-penetrating radar', short: 'Radar', mass: 35, cost: 70, power: 40, data: 1200, inst: true, unlock: 4,
           desc: 'Sees through ice and soil to buried water. Power hungry.' },
  mspec: { slot: 'bay', cat: 'Science', name: 'Mass spectrometer', short: 'Mass spec', mass: 18, cost: 55, power: 25, data: 100, inst: true, low: true, unlock: 4,
           desc: '"Tastes" gas. Needs a low orbit.' }
};

// ---------- launch vehicles (made-up names) ----------
const LAUNCHERS = {
  sparrow:   { name: 'Sparrow-1',    leo: 5000,  cost: 90,  desc: 'Small and cheap.' },
  condor:    { name: 'Condor',       leo: 11000, cost: 170, desc: 'The deep-space workhorse.' },
  albatross: { name: 'Albatross H',  leo: 21000, cost: 320, boosters: true, desc: 'Heavy lift with side boosters.' },
  leviathan: { name: 'Leviathan SH', leo: 40000, cost: 600, boosters: true, desc: 'Super-heavy. Eats budgets.' }
};

// ---------- physics constants ----------
const G0 = 9.80665;
const STRUCT_FRAC = 0.10;   // structure = 10% of parts mass
const TANK_FRAC = 0.08;     // tank = 8% of fuel mass
const RTG_DECAY = 0.016;    // per year
const RTG_W = 150;
const HEATER_W = 60;        // beyond 3 AU; half inside
const FUEL_CAP = 12000;

// ---------- ground stations ----------
const GROUND = {
  single:   { name: 'One ground station', hours: 4, cost: 5,
              desc: "A single dish. The spacecraft is only in view a few hours a day, and Earth's spin hides it the rest of the time." },
  network:  { name: 'Three-station network', hours: 8, cost: 20,
              desc: "Dishes spread around the world, like NASA's Deep Space Network in California, Spain and Australia, so one can always see you. You share them with other missions." },
  priority: { name: 'Network with priority time', hours: 16, cost: 45,
              desc: 'You book the big dishes for twice as long each day. Doubles the data you can send. Expensive.' }
};

// ---------- paint ----------
const PAINTS = [
  { id: 'white',  name: 'Clean-room white', color: '#f2f4ff' },
  { id: 'gold',   name: 'Foil gold',        color: '#ffcf5c' },
  { id: 'teal',   name: 'Comet teal',       color: '#5ee6c8' },
  { id: 'pink',   name: 'Nebula pink',      color: '#ff8fb8' },
  { id: 'violet', name: 'Deep violet',      color: '#a78bfa' },
  { id: 'orange', name: 'Rust orange',      color: '#ff9f5a' },
  { id: 'blue',   name: 'Ice blue',         color: '#7cc4ff' },
  { id: 'black',  name: 'Stealth black',    color: '#4a5078' }
];
const PATCH_COLORS = ['#ffffff', '#ffd166', '#ff6b9d', '#5ee6c8', '#7cc4ff', '#a78bfa', '#ff9f5a', '#ef476f', '#06d6a0', '#1b1f3b'];
const PATCH_STAMPS = ['⭐', '🚀', '🛰️', '🌙', '🪐', '☄️', '👽', '❤️', '⚡', '🌍'];

// ---------- discoveries helper ----------
// f(id, tag, pts, title, why, extra?)  tag = a clue category id of the mission
function f(id, tag, pts, title, why, extra) { return Object.assign({ id, tag, pts, title, why }, extra || {}); }

// ---------- missions ----------
const MISSIONS = [
  {
    id: 'm1', num: 1, name: 'Shakedown', target: 'Earth orbit', planet: 'earth',
    au: 1, comm: 400, capFactor: 1, budget: 440, opsPerMonth: 2, passMonths: 1, ops: [3, 8, 4],
    minigames: ['launch'], hazard: 0, crisis: null, needReturn: false, gravity: 9.81,
    teaches: 'Mass, power and budget. Tilted orbits versus sun-synchronous orbits.',
    newParts: ['chem', 'solarS', 'solarL', 'batS', 'lga', 'mga', 'hga', 'compStd', 'adcsBasic', 'rec32', 'rec256', 'shield', 'wac', 'hirc', 'irs', 'mag'],
    intro: [
      ['vega', 'Welcome to Mission Control. Three weeks ago our antennas caught a faint, repeating radio pulse from Ceruvia, an icy moon 1.4 billion km away.'],
      ['hale', 'It might come from somewhere with water and warmth. Places like that could host life. But the signal is fading.'],
      ['vega', 'Nobody will fund a trip to Ceruvia until this team proves it can fly. Your first job: build a small Earth-watching satellite and get it working.'],
      ['ollie', 'Drag parts from the shelf onto the spacecraft. Every part adds mass, cost and power. Then you fly the launch yourself. No pressure.']
    ],
    outro: [
      ['hale', 'Real data from a spacecraft you built. Farmers, mapmakers and climate scientists will all use it.'],
      ['vega', 'The agency noticed. They are funding a harder test: the far side of the Moon.'],
      ['ollie', 'You kept it on the line! Mostly. The Moon is 1,000 times farther, so pack more fuel.']
    ],
    objectives: [
      { id: 'regions', text: 'Photograph 3 different regions of Earth', check: R => R.sitesWithFinds >= 3 },
      { id: 'climate', text: 'Measure the climate at 2 regions with the infrared spectrometer', check: R => (R.tags.climate || 0) >= 2 },
      { id: 'poles',   text: 'Observe a polar ice sheet', check: R => R.found.has('e-green-wac') || R.found.has('e-ant-wac') || R.found.has('e-green-irs') }
    ],
    critical: [
      ['Budget', 'Your first mission has the smallest budget. The rocket is the biggest cost.'],
      ['Power', "Low orbits spend part of every lap in Earth's shadow, so the battery matters."]
    ],
    trajs: {
      leo: { name: 'Direct to orbit', lf: 1, dvIns: 0.05, dvDep: 0, cruise: 0, desc: 'The rocket puts you straight into orbit.' }
    },
    orbits: {
      leo: { name: 'Low Earth orbit (28° tilt)', dv: 0, cap: 1, eclipse: 0.38, dataFactor: 1, detail: true, radRisk: 0.002, maxLat: 30,
             desc: "The easiest orbit to reach. Only passes over the tropics, and spends 38% of each orbit in Earth's shadow." },
      sso: { name: 'Sun-synchronous polar orbit', dv: 0.15, cap: 0.85, eclipse: 0, dataFactor: 1, detail: true, radRisk: 0.004, maxLat: 90, polar: true,
             desc: 'Flies over both poles and follows the line between day and night, so it never enters shadow. The rocket carries 15% less.' }
    },
    clues: [{ id: 'maps', name: 'Maps' }, { id: 'climate', name: 'Climate' }, { id: 'mag', name: 'Magnetic field' }],
    sites: [
      { id: 'amz', name: 'Amazon Rainforest', lat: -3, x: 0.3, y: 0.56, finds: {
        wac:  f('e-amz-wac', 'maps', 12, 'Forest edge map', 'Wide images show where the forest ends and farms begin, year by year.'),
        hirc: f('e-amz-hirc', 'maps', 22, 'Hidden logging roads', 'Sharp images pick out roads only a few metres wide under the canopy edge.'),
        irs:  f('e-amz-irs', 'climate', 18, 'Thirsty trees', 'Infrared light shows which parts of the forest are short of water before the leaves turn brown.'),
        mag:  f('e-amz-mag', 'mag', 10, 'A weak spot in the field', "Earth's magnetic shield dips over South America, so satellites here get more radiation.") } },
      { id: 'sah', name: 'Sahara Desert', lat: 23, x: 0.52, y: 0.4, finds: {
        wac:  f('e-sah-wac', 'maps', 12, 'Dust on the move', 'A plume of dust is blowing out over the ocean. It will feed plankton and forests far away.'),
        hirc: f('e-sah-hirc', 'maps', 20, 'Ancient river beds', 'Dry channels show the Sahara was green a few thousand years ago.'),
        irs:  f('e-sah-irs', 'climate', 16, 'Day and night heat', 'Sand heats quickly and cools quickly. Measuring that swing helps check climate models.') } },
      { id: 'green', name: 'Greenland Ice Sheet', lat: 72, x: 0.38, y: 0.14, finds: {
        wac:  f('e-green-wac', 'maps', 16, 'Melt ponds', 'Blue lakes of meltwater dot the ice in summer. More of them appear every decade.'),
        hirc: f('e-green-hirc', 'maps', 24, 'A glacier breaking up', 'Cracks near the coast show where the next icebergs will split away.'),
        irs:  f('e-green-irs', 'climate', 24, 'Warming ice', 'The surface of the ice is warmer than it was. That is how scientists track melting from space.'),
        mag:  f('e-green-mag', 'mag', 12, 'Where the aurora begins', 'Near the poles, magnetic field lines plunge into Earth and guide particles that make the northern lights.') } },
      { id: 'ant', name: 'Antarctic Ice Shelf', lat: -80, x: 0.56, y: 0.9, finds: {
        wac:  f('e-ant-wac', 'maps', 16, 'A giant iceberg', 'A slab of ice the size of a city has drifted free of the shelf.'),
        hirc: f('e-ant-hirc', 'maps', 24, 'Penguin colonies', 'Dark stains on the ice are penguin colonies. Counting them from orbit tracks ocean health.'),
        irs:  f('e-ant-irs', 'climate', 22, 'Thinning shelf', 'Warm water is melting the ice shelf from below. Its temperature pattern gives it away.') } },
      { id: 'typ', name: 'Pacific Typhoon', lat: 15, x: 0.82, y: 0.44, finds: {
        wac:  f('e-typ-wac', 'maps', 14, 'The eye of the storm', 'A full view of the spiral lets forecasters warn people in its path.'),
        hirc: f('e-typ-hirc', 'maps', 18, 'Towering clouds', 'Close-ups of the eye wall show how fast the storm is growing.'),
        irs:  f('e-typ-irs', 'climate', 20, 'Warm ocean fuel', 'Typhoons feed on warm sea water. Infrared shows how much fuel is left ahead of it.') } }
    ]
  },
  {
    id: 'm2', num: 2, name: 'Quiet Side', target: 'The Moon', planet: 'moon',
    au: 1, comm: 120, capFactor: 0.4, budget: 670, opsPerMonth: 3, passMonths: 1, ops: [3, 8, 4],
    minigames: ['launch', 'dodge', 'insertion', 'landing'], hazard: 0.5, crisis: null, needReturn: false, gravity: 1.62,
    teaches: 'Radio noise, the lunar far side and landing.',
    newParts: ['lander', 'sig', 'batL'],
    intro: [
      ['hale', 'Earth is full of radio noise: phones, TV, radar. The Ceruvia signal is buried under it.'],
      ['hale', 'The far side of the Moon always faces away from Earth. It is the quietest radio spot in the solar system.'],
      ['vega', 'Land a lander on the far side, or fly a radio receiver around behind the Moon, and record the signal cleanly.'],
      ['ollie', 'New parts unlocked: a lander, a radio receiver, a bigger battery and a large bus. You fly the lander yourself, so go easy on the throttle.']
    ],
    outro: [
      ['hale', 'With Earth out of the way the signal is clear. It repeats every 47 seconds, and it is not natural noise.'],
      ['vega', 'To learn more we will need samples. First we must prove we can bring something home.'],
      ['ollie', 'Next stop is an asteroid with almost no gravity. Landing is easy. Leaving by accident is easier.']
    ],
    objectives: [
      { id: 'signal', text: 'Record the Ceruvia signal from the far side', check: R => (R.tags.signal || 0) >= 1 },
      { id: 'water',  text: 'Find water ice at the south pole', check: R => (R.tags.water || 0) >= 1 },
      { id: 'land',   text: 'Land the lander safely', check: R => R.landed }
    ],
    critical: [
      ['Communications', 'The far side of the Moon never faces Earth, so radio contact is tricky.'],
      ['Mass', 'A lander is heavy, and the Moon is harder to reach than Earth orbit.']
    ],
    trajs: {
      direct: { name: 'Direct transfer', lf: 1, dvIns: 0.9, dvDep: 0, cruise: 0.012, desc: 'Fast. You arrive quickly but must brake hard.' },
      weak:   { name: 'Low-energy transfer', lf: 1.1, dvIns: 0.65, dvDep: 0, cruise: 0.3, desc: "A long loop that uses the Sun's gravity. Saves fuel and the rocket carries 10% more." }
    },
    orbits: {
      eq:    { name: 'Low equatorial orbit', dv: 0, eclipse: 0.4, dataFactor: 1, detail: true, radRisk: 0.003, maxLat: 30, desc: 'Cheap, but misses the poles.' },
      polar: { name: 'Low polar orbit', dv: 0.12, eclipse: 0.35, dataFactor: 1, detail: true, radRisk: 0.003, maxLat: 90, polar: true, desc: 'Sees the whole Moon, including the dark polar craters.' }
    },
    clues: [{ id: 'signal', name: 'The signal' }, { id: 'water', name: 'Water ice' }, { id: 'history', name: 'History' }, { id: 'geology', name: 'Geology' }],
    sites: [
      { id: 'dae', name: 'Daedalus Crater (far side)', lat: -6, x: 0.82, y: 0.52, far: true, finds: {
        sig:  f('l-dae-sig', 'signal', 30, 'A clean recording', 'Behind the Moon, Earth\'s radio chatter is blocked. The pulse comes through sharp and steady.'),
        land: f('l-dae-land', 'signal', 40, 'Far-side listening post', 'A lander sitting in the crater can listen for weeks. It hears a second, fainter pulse under the first.'),
        wac:  f('l-dae-wac', 'geology', 12, 'The battered far side', 'The far side has far more craters and almost none of the dark lava seas.'),
        mag:  f('l-dae-mag', 'geology', 10, 'Magnetic swirls', 'Patches of old magnetism are frozen in the rocks, left from when the Moon had a molten core.') } },
      { id: 'sha', name: 'Shackleton Crater', lat: -89, x: 0.5, y: 0.93, finds: {
        irs:  f('l-sha-irs', 'water', 30, 'Frost in the dark', 'The crater floor never sees the Sun. Infrared picks up the fingerprint of water frost.'),
        land: f('l-sha-land', 'water', 42, 'Ice in the soil', 'The lander scoops up soil and warms it. Water vapour comes off: real ice, mixed with dust.'),
        hirc: f('l-sha-hirc', 'geology', 20, 'Peaks of near-eternal light', 'Some crater rims get sunlight almost all year. Good places for future solar panels.'),
        wac:  f('l-sha-wac', 'geology', 12, 'Long polar shadows', 'The Sun skims the horizon at the pole, so shadows stretch for kilometres.') } },
      { id: 'tra', name: 'Sea of Tranquility', lat: 8, x: 0.36, y: 0.44, finds: {
        hirc: f('l-tra-hirc', 'history', 26, 'Footpaths from 1969', 'From low orbit you can see the tracks astronauts left between their lander and their experiments.'),
        wac:  f('l-tra-wac', 'geology', 12, 'A frozen lava sea', 'The dark plains are lava that flooded old basins billions of years ago.'),
        irs:  f('l-tra-irs', 'geology', 16, 'Titanium-rich lava', 'The rock here is rich in titanium, which could be mined one day.'),
        land: f('l-tra-land', 'history', 24, 'Old dust, new data', 'Landing near a historic site shows how surfaces change after 50 years in space.') } },
      { id: 'tyc', name: 'Tycho Crater', lat: -43, x: 0.42, y: 0.74, finds: {
        wac:  f('l-tyc-wac', 'geology', 14, 'Bright rays', 'Streaks of debris spread out for 1,500 km. They show Tycho is young: about 100 million years.'),
        hirc: f('l-tyc-hirc', 'geology', 22, 'The central peak', 'A mountain in the middle of the crater brought deep rock up to the surface.'),
        irs:  f('l-tyc-irs', 'geology', 16, 'Melted rock', 'The impact melted the ground into glass. Infrared shows where it pooled.') } },
      { id: 'imb', name: 'Sea of Rains', lat: 33, x: 0.26, y: 0.24, finds: {
        wac:  f('l-imb-wac', 'geology', 12, 'A giant impact basin', 'This sea fills a basin more than 1,000 km wide, made by one huge impact.'),
        hirc: f('l-imb-hirc', 'history', 20, 'Old rover tracks', 'Wheel tracks from an early robot rover are still there. Nothing on the Moon wears them away.'),
        mag:  f('l-imb-mag', 'geology', 10, 'A quiet field', 'No magnetism here. The impact wiped it out, which helps date the Moon\'s old core.') } }
    ]
  },
  {
    id: 'm3', num: 3, name: 'Pebble Run', target: 'Asteroid 2031 QX', planet: 'asteroid',
    au: 1.1, comm: 40, capFactor: 0.32, budget: 920, opsPerMonth: 3, passMonths: 1, ops: [2, 6, 4],
    minigames: ['launch', 'dodge', 'insertion', 'tag', 'reentry'], hazard: 0.75, crisis: null, needReturn: true, gravity: 0.25,
    teaches: 'Sample return, ion versus chemical engines, and reentry.',
    newParts: ['capsule', 'sampler', 'ion', 'chemHi', 'adcsPrecise'],
    intro: [
      ['vega', 'To prove life on Ceruvia, we will need samples in Earth labs. That means a capsule that survives hitting the atmosphere at 12 km/s.'],
      ['hale', "Asteroid 2031 QX is a dark, carbon-rich rock. Its chemistry may be a lot like Ceruvia's dark basin."],
      ['ollie', 'You will touch the surface for three seconds, grab a sample, and back away. Then bring it home. New: capsule, sampler arm, ion engine, precision pointing.']
    ],
    outro: [
      ['hale', 'The pebbles are 4.5 billion years old and full of carbon. The same ingredients may be on Ceruvia.'],
      ['vega', 'One problem left. Ceruvia is so far from the Sun that solar panels barely work. We test our power systems at Mars.'],
      ['ollie', 'A capsule on the ground and a sample in the lab. That is a round trip, team!']
    ],
    objectives: [
      { id: 'tag',   text: 'Grab a sample with a touch-and-go', check: R => R.tagOk },
      { id: 'home',  text: 'Land the capsule on Earth with the sample', check: R => R.capsuleLanded && R.tagOk },
      { id: 'water', text: 'Find evidence of ancient water', check: R => (R.tags.water || 0) >= 1 }
    ],
    critical: [
      ['Fuel and mass', 'You have to stop at the asteroid and come all the way back.'],
      ['Budget', 'A capsule and a sample arm are expensive.']
    ],
    trajs: {
      direct: { name: 'Direct rendezvous', lf: 1, dvIns: 1.6, dvDep: 1.2, cruise: 1, desc: "Match the asteroid's orbit directly. Costs a lot of Δv." },
      flyby:  { name: 'Earth flyby assist', lf: 1.15, dvIns: 1.1, dvDep: 1, cruise: 1.8, desc: 'Loop past Earth once for a free boost. Slower, but cheaper in fuel.' }
    },
    orbits: {
      hover: { name: 'Hover at 20 km', dv: 0, eclipse: 0, dataFactor: 0.7, detail: false, radRisk: 0.001, maxLat: 90, polar: true,
               desc: 'Safe and simple. The asteroid spins beneath you, so you see all of it, but not in detail.' },
      close: { name: 'Close orbit at 2 km', dv: 0.03, eclipse: 0.15, dataFactor: 1, detail: true, radRisk: 0.001, maxLat: 70,
               desc: 'Sharp images. The weak gravity makes this orbit tricky, and the poles are out of view.' }
    },
    clues: [{ id: 'water', name: 'Ancient water' }, { id: 'organics', name: 'Organics' }, { id: 'structure', name: 'Structure' }, { id: 'sample', name: 'Sample' }],
    tagFinding: f('a-tag', 'sample', 40, 'Pebbles in the collector', 'The arm puffed gas at the surface and caught about 100 grams of dust and pebbles.'),
    sampleLab: { pts: 60, title: 'Sample in the lab', why: 'Earth labs find clay minerals and amino acids in the pebbles. No spacecraft instrument could have measured that.' },
    sites: [
      { id: 'bou', name: 'Boulder Field', lat: 20, x: 0.3, y: 0.36, rough: 0.9, finds: {
        wac:  f('a-bou-wac', 'structure', 12, 'A pile of rubble', 'The asteroid is not solid rock. It is loose boulders held together by very weak gravity.'),
        hirc: f('a-bou-hirc', 'structure', 22, 'Cracked boulders', 'Day and night temperature swings are splitting the boulders apart.'),
        irs:  f('a-bou-irs', 'water', 22, 'Clay minerals', 'Clays only form when rock sits in liquid water. This rubble was once wet.') } },
      { id: 'pon', name: 'Smooth Pond', lat: -10, x: 0.62, y: 0.56, rough: 0.2, finds: {
        wac:  f('a-pon-wac', 'structure', 12, 'A pond of dust', 'Fine grains have settled into a flat patch. The safest place to touch down.'),
        hirc: f('a-pon-hirc', 'structure', 20, 'Grain sizes', 'The grains are a few centimetres across: small enough for the sample arm.'),
        irs:  f('a-pon-irs', 'organics', 24, 'Carbon-rich dust', 'The dust is full of carbon compounds, the raw ingredients of life.') } },
      { id: 'rid', name: 'Equatorial Ridge', lat: 0, x: 0.5, y: 0.46, rough: 0.6, finds: {
        wac:  f('a-rid-wac', 'structure', 14, 'A spinning-top shape', 'The asteroid spins so fast that loose rock has slid to the equator and piled into a ridge.'),
        mag:  f('a-rid-mag', 'structure', 12, 'No magnetic field', 'The rock was never molten, so it is a time capsule from the birth of the solar system.'),
        irs:  f('a-rid-irs', 'water', 20, 'Water locked in rock', 'A dip in the infrared spectrum shows water molecules bound inside the minerals.') } },
      { id: 'pit', name: 'North Pit', lat: 80, x: 0.46, y: 0.1, rough: 0.7, finds: {
        wac:  f('a-pit-wac', 'structure', 16, 'A collapsed pit', 'Part of the surface has fallen in, showing fresh material from the inside.'),
        irs:  f('a-pit-irs', 'water', 28, 'Bright veins', 'White carbonate veins run through the walls. Water once flowed through cracks in the parent body.') } },
      { id: 'drk', name: 'Dark Streak', lat: -35, x: 0.36, y: 0.74, rough: 0.5, finds: {
        wac:  f('a-drk-wac', 'organics', 14, 'Blacker than coal', 'This streak reflects only 3% of the sunlight that hits it.'),
        hirc: f('a-drk-hirc', 'organics', 22, 'Fresh landslide', 'A recent slide uncovered dark material that space weather has not yet bleached.'),
        irs:  f('a-drk-irs', 'organics', 30, 'Complex organics', 'Long carbon chains, much like the dark material seen on Ceruvia.') } }
    ]
  },
  {
    id: 'm4', num: 4, name: 'Red Shadow', target: 'Mars', planet: 'mars',
    au: 1.52, comm: 14, capFactor: 0.3, budget: 1120, opsPerMonth: 4, passMonths: 2, ops: [4, 16, 8],
    minigames: ['launch', 'dodge', 'insertion', 'landing'], hazard: 0.9, needReturn: false, gravity: 3.71,
    crisis: { name: 'Dust storm', solarCut: 0.95, rtgCut: 0, turns: 8,
              text: 'A dust storm has covered the whole planet. Almost no sunlight reaches your solar panels.' },
    teaches: 'Solar versus RTG power, dust storms, aerobraking and buried ice.',
    newParts: ['rtg', 'radar', 'mspec', 'solarX', 'ka', 'compRad', 'fuelcell'],
    intro: [
      ['vega', 'Ceruvia is so far from the Sun that solar power barely works there. We need a power system that cannot be switched off by the weather.'],
      ['hale', 'Mars is perfect for testing that. Its dust storms can cover the whole planet for weeks. And we still do not know how much ice is buried there.'],
      ['ollie', 'New: RTGs, ground-penetrating radar, a mass spectrometer, giant solar wings, a Ka-band dish, a rad-hard computer and an emergency fuel cell.']
    ],
    outro: [
      ['hale', 'There is ice under the Martian soil, enough for future explorers to drink and to make fuel from.'],
      ['vega', 'The storm did not stop us. The agency has approved the big one. We are going to Ceruvia.'],
      ['ollie', 'Four missions flown. One to go. It is only nine times farther than anything we have done. Easy.']
    ],
    objectives: [
      { id: 'ice',   text: 'Find buried water with radar', check: R => R.found.has('m-arc-radar') || R.found.has('m-pol-radar') || R.found.has('m-arc-land') },
      { id: 'storm', text: 'Survive the dust storm without losing data', check: R => R.crisisClean },
      { id: 'land',  text: 'Land the lander safely', check: R => R.landed }
    ],
    critical: [
      ['Power', "Mars gets less than half of Earth's sunlight, and a dust storm is coming."],
      ['Data', 'Mars is far, so the radio link is slow.']
    ],
    trajs: {
      hohmann: { name: 'Transfer + braking burn', lf: 1, dvIns: 2.1, dvDep: 0, cruise: 0.7, desc: 'The classic route. Braking into orbit costs a lot of fuel.' },
      aero:    { name: 'Transfer + aerobraking', lf: 1, dvIns: 0.9, dvDep: 0, cruise: 1.2, desc: 'Dip into the upper atmosphere hundreds of times to slow down for free. Takes months longer.' }
    },
    orbits: {
      high:  { name: 'High orbit', dv: 0, eclipse: 0.05, dataFactor: 0.7, detail: false, radRisk: 0.002, maxLat: 60, desc: 'Calm and almost always in sunlight, but too far for detail.' },
      eq:    { name: 'Low equatorial orbit', dv: 0.3, eclipse: 0.38, dataFactor: 1, detail: true, radRisk: 0.003, maxLat: 40, desc: 'Close-up views of the middle latitudes.' },
      polar: { name: 'Low polar orbit', dv: 0.45, eclipse: 0.35, dataFactor: 1, detail: true, radRisk: 0.003, maxLat: 90, polar: true, desc: 'Sees every latitude, including the ice caps.' }
    },
    clues: [{ id: 'water', name: 'Water' }, { id: 'organics', name: 'Organics & methane' }, { id: 'geology', name: 'Geology' }],
    sites: [
      { id: 'jez', name: 'Jezero Crater', lat: 18, x: 0.68, y: 0.4, finds: {
        wac:   f('m-jez-wac', 'geology', 12, 'A dried-up lake', 'A river once flowed into this crater and filled it with water.'),
        hirc:  f('m-jez-hirc', 'water', 24, 'The river delta', 'A fan of mud and sand shows where the river met the lake, 3.5 billion years ago.'),
        irs:   f('m-jez-irs', 'water', 22, 'Clays and carbonates', 'These minerals form in calm water that life could have lived in.'),
        mspec: f('m-jez-mspec', 'organics', 26, 'A puff of methane', 'Methane comes and goes with the seasons. Rocks can make it. So can microbes.'),
        land:  f('m-jez-land', 'organics', 36, 'Organics in mudstone', 'The lander drills into old lake mud and finds carbon compounds kept safe for billions of years.') } },
      { id: 'pol', name: 'South Polar Cap', lat: -87, x: 0.5, y: 0.93, finds: {
        wac:   f('m-pol-wac', 'geology', 14, 'Layers like tree rings', 'Stripes of ice and dust record how the Martian climate changed.'),
        irs:   f('m-pol-irs', 'water', 20, 'Dry ice over water ice', 'A crust of frozen carbon dioxide sits on a thick cap of water ice.'),
        radar: f('m-pol-radar', 'water', 36, 'A bright echo under the ice', 'Radar bounces strongly off something 1.5 km down. It may be salty water or wet clay.') } },
      { id: 'val', name: 'Valles Marineris', lat: -14, x: 0.34, y: 0.56, finds: {
        wac:   f('m-val-wac', 'geology', 14, 'A canyon as wide as a continent', 'This canyon would stretch right across North America.'),
        hirc:  f('m-val-hirc', 'water', 24, 'Dark streaks on the slopes', 'Streaks grow in warm seasons. They may be dry sand slides, or briny water.'),
        irs:   f('m-val-irs', 'geology', 18, 'Layered sulfates', 'Salt layers in the walls were left behind when ancient water dried up.'),
        mspec: f('m-val-mspec', 'organics', 20, 'Morning fog chemistry', 'Low orbit lets the spectrometer sample thin gas rising from the canyon at dawn.') } },
      { id: 'oly', name: 'Olympus Mons', lat: 18, x: 0.14, y: 0.4, finds: {
        wac:   f('m-oly-wac', 'geology', 14, 'The tallest volcano known', 'It is nearly three times the height of Mount Everest.'),
        hirc:  f('m-oly-hirc', 'geology', 20, 'Young lava flows', 'Few craters on these flows means they are young. Mars may not be fully dead inside.'),
        mag:   f('m-oly-mag', 'geology', 12, 'Patchy old magnetism', 'Mars lost its global magnetic field long ago. Only patches remain in old rock.') } },
      { id: 'arc', name: 'Arcadia Planitia', lat: 47, x: 0.24, y: 0.2, finds: {
        wac:   f('m-arc-wac', 'geology', 12, 'Smooth northern plains', 'Flat, gentle ground. A good place for people to land one day.'),
        radar: f('m-arc-radar', 'water', 38, 'Ice sheets under the soil', 'Clean water ice lies less than a metre down, across an area the size of a country.'),
        hirc:  f('m-arc-hirc', 'water', 24, 'Ice in a fresh crater', 'A new impact dug up bright white ice, which slowly fades as it turns to vapour.'),
        land:  f('m-arc-land', 'water', 40, 'Ice under the landing legs', 'The landing engines blew the soil away and uncovered a slab of solid ice.') } }
    ]
  },
  {
    id: 'm5', num: 5, name: 'Last Signal', target: 'Ceruvia', planet: 'ceruvia',
    au: 9.5, comm: 1, capFactor: 0.29, budget: 1420, opsPerMonth: 5, passMonths: 2, ops: [4, 24, 12],
    minigames: ['launch', 'dodge', 'insertion', 'landing', 'reentry'], hazard: 1, needReturn: true, window: 7.5, gravity: 1.1,
    crisis: { name: 'Radiation storm', solarCut: 0.7, rtgCut: 0.45, turns: 8,
              text: "A burst from the gas giant's radiation belts has knocked out part of your power system." },
    teaches: 'Everything at once: sunlight 90 times weaker, a 7.5-year deadline, and the trip home.',
    newParts: ['rec2t'],
    intro: [
      ['vega', 'This is it. Ceruvia: 1.4 billion km away, sunlight 90 times weaker than at Earth, and a signal that fades for good in 7.5 years.'],
      ['hale', 'We want to know if Ceruvia has water, food and shelter, what makes the signal, and whether anything lives there.'],
      ['ollie', 'Every part is unlocked. You need to arrive before the signal fades, survive the trip home, and land the capsule. Good luck, team.']
    ],
    outro: [
      ['hale', 'The signal was never a message. It is the moon itself: tides flexing the ice over a warm, salty ocean.'],
      ['vega', 'An ocean with water, energy and carbon. You found the best place to look for life beyond Earth.'],
      ['ollie', 'From a little Earth satellite to an icy moon and back. I am not crying. It is the solar wind.']
    ],
    objectives: [
      { id: 'habit',  text: 'Confirm 3 of the 5 habitability clues', check: R => R.clueCount >= 3 },
      { id: 'signal', text: 'Find the source of the signal', check: R => (R.tags.signal || 0) >= 1 },
      { id: 'home',   text: 'Land the capsule on Earth', check: R => R.capsuleLanded }
    ],
    critical: [
      ['Power', 'Sunlight at Ceruvia is 90 times weaker than at Earth.'],
      ['Time', 'The signal fades in 7.5 years, so the trip must be fast.'],
      ['Communications', 'Data trickles home from 1.4 billion km away.']
    ],
    trajs: {
      direct: { name: 'Direct transfer', lf: 1, dvIns: 2, dvDep: 2, cruise: 5, desc: 'Fast, but you arrive going very fast and need a lot of fuel to brake.' },
      assist: { name: 'Jupiter gravity assist', lf: 1.2, dvIns: 1.3, dvDep: 1.4, cruise: 7, desc: 'Swing past Jupiter for free speed. Saves fuel and the rocket carries 20% more, but it takes 2 years longer.' }
    },
    orbits: {
      high:  { name: 'High orbit', dv: 0, eclipse: 0, dataFactor: 0.7, detail: false, radRisk: 0.01, maxLat: 60, desc: 'Cheap and safe from radiation. Too far for close-ups or plume fly-throughs.' },
      low:   { name: 'Low equatorial orbit', dv: 0.6, eclipse: 0.15, dataFactor: 1, detail: true, radRisk: 0.04, maxLat: 45, desc: 'Close-up views of the middle latitudes. Heavy radiation from the gas giant.' },
      polar: { name: 'Low polar orbit', dv: 0.9, eclipse: 0.3, dataFactor: 1, detail: true, radRisk: 0.025, maxLat: 90, polar: true, desc: 'Sees every latitude, including the plumes at the south pole.' }
    },
    clues: [{ id: 'water', name: 'Water' }, { id: 'food', name: 'Food & energy' }, { id: 'shelter', name: 'Shelter' }, { id: 'signal', name: 'The signal' }, { id: 'life', name: 'Signs of life' }],
    plumeSite: 'plu',
    tagFinding: f('c-plume-sample', 'life', 45, 'Plume grains caught', 'The collector swept through the plume and trapped frozen droplets of ocean water.'),
    sampleLab: { pts: 80, title: 'Ocean water in the lab', why: 'The frozen droplets hold salts, carbon compounds and tiny structures that labs will study for years.' },
    sites: [
      { id: 'fra', name: 'Fracture Canyons', lat: 10, x: 0.3, y: 0.46, finds: {
        wac:   f('c-fra-wac', 'shelter', 14, 'Cracks around the globe', 'Long double ridges cross the ice. Something underneath is pushing and pulling the shell.'),
        hirc:  f('c-fra-hirc', 'water', 24, 'Fresh ice in the cracks', 'Bright new ice has welled up between the ridges, like water freezing in a split pond.'),
        radar: f('c-fra-radar', 'water', 38, 'An ocean under the ice', 'Radar finds liquid water 12 km down. The ice shell floats on a global ocean.'),
        mag:   f('c-fra-mag', 'water', 26, 'A salty conductor', "The moon bends the gas giant's magnetic field. Only a salty ocean could do that."),
        irs:   f('c-fra-irs', 'food', 22, 'Salts on the surface', 'Salts from the ocean have reached the surface. Salty water can carry the chemicals life needs.') } },
      { id: 'plu', name: 'Plume Fields', lat: -78, x: 0.52, y: 0.9, finds: {
        wac:   f('c-plu-wac', 'water', 18, 'Geysers into space', 'Jets of ice grains shoot 200 km above the south pole.'),
        irs:   f('c-plu-irs', 'food', 28, 'Warm stripes', 'The cracks are 80 degrees warmer than the ice around them. There is heat inside this moon.'),
        mspec: f('c-plu-mspec', 'food', 40, 'Hydrogen and organics', 'Flying through the plume, the spectrometer tastes hydrogen and carbon compounds: food for microbes.'),
        land:  f('c-plu-land', 'life', 44, 'Snow that fell from the ocean', 'The lander sits in fresh plume snow and finds complex organic molecules in it.') } },
      { id: 'bea', name: 'Beacon Crater', lat: 30, x: 0.72, y: 0.3, finds: {
        sig:   f('c-bea-sig', 'signal', 42, 'The source of the signal', 'The pulse comes from here. Every 47 seconds the tide squeezes the ice and it rings like a bell.'),
        land:  f('c-bea-land', 'signal', 46, 'Listening from the ground', 'On the surface the lander feels each pulse as a tiny icequake, then hears the radio crackle that follows.'),
        hirc:  f('c-bea-hirc', 'shelter', 22, 'A young, thin floor', 'The crater floor has re-frozen recently. The ice here is thin.'),
        radar: f('c-bea-radar', 'shelter', 30, 'A lake inside the ice', 'A pocket of liquid water sits just 3 km down, shielded from radiation by the ice above.') } },
      { id: 'cap', name: 'Northern Ice Cap', lat: 82, x: 0.46, y: 0.08, finds: {
        wac:   f('c-cap-wac', 'shelter', 14, 'Old, quiet ice', 'This is the oldest ice on Ceruvia, with the most craters.'),
        radar: f('c-cap-radar', 'shelter', 30, 'A thick roof', 'The ice is 30 km thick here. Anything in the ocean below is well protected.'),
        mag:   f('c-cap-mag', 'water', 20, 'The ocean reaches the pole', 'The magnetic signature is the same at the pole. The ocean is global.') } },
      { id: 'bas', name: 'Dark Basin', lat: -25, x: 0.22, y: 0.68, finds: {
        wac:   f('c-bas-wac', 'food', 14, 'A reddish-brown stain', 'Dark material covers the basin. It was not there in old telescope images.'),
        irs:   f('c-bas-irs', 'food', 30, 'Organics like the asteroid', 'The same long carbon chains you found on asteroid 2031 QX.'),
        hirc:  f('c-bas-hirc', 'life', 34, 'Patterns in the stain', 'The dark material follows the cracks, as if it seeped up from below.'),
        land:  f('c-bas-land', 'life', 46, 'Too tidy to be chance', 'Molecules in the soil all twist the same way. On Earth, only living things do that.') } }
    ]
  }
];

// ---------- random events ----------
// Each event's apply(run) changes the run and returns {good, text}.
// run fields used: d (derived design facts, mutable), c (calc snapshot), plan, passPenalty, sciMult, downMult, extraCost, bonusSci, fuelSpare.
function damage(run) {
  const d = run.d;
  if (d.solarWings > 0 && Math.random() < 0.6) {
    d.solarKw = d.solarKw * (d.solarWings - 1) / d.solarWings; d.solarWings--;
    run.broken.push('solar');
    return 'A solar wing is torn off. You have less power for the rest of the mission.';
  }
  if (d.instruments.length > 1) {
    const i = Math.floor(Math.random() * d.instruments.length);
    const id = d.instruments.splice(i, 1)[0];
    run.broken.push(id);
    return 'The ' + PARTS[id].name.toLowerCase() + ' is smashed. It will not find anything now.';
  }
  run.downMult *= 0.7; run.broken.push('antenna');
  return 'The antenna dish is dented. Data goes home 30% slower.';
}
const EVENTS = [
  { id: 'flare', icon: '☀️', title: 'Solar storm',
    text: 'A burst of charged particles from the Sun sweeps past the spacecraft.',
    apply(run) {
      if (run.d.computer && run.d.computer.radHard) return { good: true, text: 'Your rad-hard computer shrugs it off. Nothing is lost.' };
      run.passPenalty++;
      return { good: false, text: 'The standard computer crashes and takes weeks to restart. You lose one science pass. A rad-hard computer would have kept going.' };
    } },
  { id: 'wheel', icon: '🎡', title: 'Reaction wheel failure',
    text: 'One of the spinning wheels that points the spacecraft has stopped.',
    apply(run) {
      if (run.d.adcs && run.d.adcs.spare) return { good: true, text: 'The spare wheel takes over. Pointing is as steady as ever.' };
      run.sciMult *= 0.85;
      return { good: false, text: 'With no spare wheel, pointing is shaky and images blur. Science is worth 15% less. Precision pointing includes a spare.' };
    } },
  { id: 'leak', icon: '💧', title: 'Thruster valve leak',
    text: 'A valve did not close fully after a course correction.',
    apply(run) {
      const lost = Math.round(run.c.fuel * 0.06);
      run.fuelSpare -= lost;
      if (run.fuelSpare >= 0) return { good: true, text: 'You lose ' + lost + ' kg of fuel, but your spare fuel covers it.' };
      run.passPenalty++;
      return { good: false, text: 'You lose ' + lost + ' kg of fuel and have no spare. The team shortens the mission to save fuel: one science pass fewer.' };
    } },
  { id: 'dsn', icon: '📡', title: 'Ground antenna outage',
    text: 'A storm damaged one of the big dishes on Earth that listen to your spacecraft.',
    apply(run) {
      if (run.plan.ground !== 'single') return { good: true, text: 'The other stations in your network cover the gap. No data is lost.' };
      run.downMult *= 0.75;
      return { good: false, text: 'It was your only station. You send 25% less data home until it is fixed. A network has spares.' };
    } },
  { id: 'budget', icon: '💸', title: 'Budget review',
    text: 'The agency has to cut costs and asks every mission to give money back.',
    apply(run) {
      if (!isFinite(run.c.budget)) return { good: true, text: 'Sandbox budgets are bottomless. The accountants give up.' };
      const cut = Math.round(run.c.budget * 0.04);
      run.extraCost += cut;
      if (run.c.budget - run.c.cost - run.extraCost >= 0) return { good: true, text: 'You hand back $' + cut + 'M from your reserve and carry on.' };
      run.passPenalty++;
      return { good: false, text: 'You had no reserve, so $' + cut + 'M comes out of operations. One science pass is cancelled. Keep some budget spare.' };
    } },
  { id: 'debris', icon: '🛰️', title: 'Debris warning', needHazard: true,
    text: 'Tracking stations spot a cloud of old satellite fragments crossing your path.',
    apply(run) {
      if (run.d.shields > 0) { run.d.shields--; return { good: true, text: 'A fragment hits your debris shield and breaks up. One shield layer is used.' }; }
      return { good: false, text: 'With no shield, a fragment gets through. ' + damage(run) };
    } },
  { id: 'detour', icon: '☄️', title: 'Asteroid flyby opportunity', needHazard: true,
    text: 'An unexplored asteroid passes close to your path. A small detour would let you photograph it.',
    choices: [
      { label: 'Take the detour', apply(run) {
          const cost = Math.round(run.c.fuel * 0.05) + 5;
          const cam = run.d.instruments.some(id => id === 'wac' || id === 'hirc');
          if (run.fuelSpare < cost) { run.fuelSpare -= cost; run.passPenalty++;
            return { good: false, text: 'The detour needs ' + cost + ' kg of fuel you did not have spare. You make it, but lose a science pass later.' }; }
          run.fuelSpare -= cost;
          if (!cam) return { good: false, text: 'You fly past, but with no camera on board there is nothing to show for the ' + cost + ' kg of fuel.' };
          run.bonusSci += 25;
          return { good: true, text: 'Your spare fuel covers the ' + cost + ' kg. The camera returns the first images of a new world. +25 science.' };
        } },
      { label: 'Stay on course', apply() { return { good: true, text: 'You stay on course and keep your fuel. Sometimes the right call is no.' }; } }
    ] }
];

// ---------- science goals: who uses the data and what helps ----------
const GOAL_NEEDS = {
  regions: { users: 'Mapmakers, farmers and disaster responders', parts: ['wac', 'hirc', 'irs'],
             why: 'Any instrument that finds something at three different places counts. A wide-angle camera is the cheapest way.' },
  climate: { users: 'Climate scientists tracking heat, drought and forests', tag: 'climate',
             why: 'Infrared light shows temperature and plant health.' },
  poles:   { users: 'Glaciologists measuring how fast ice is melting', parts: ['wac', 'irs'], orbit: 'polar',
             why: 'You need an orbit that flies over the poles, and a camera or spectrometer.' },
  signal:  { users: 'Radio astronomers studying the mystery pulse', tag: 'signal',
             why: 'Listening needs a radio receiver, or a lander parked on the quiet side.' },
  water:   { users: 'Planetary scientists, and future astronauts who will need water', tag: 'water',
             why: 'Different instruments find water in different ways: infrared, radar, or digging with a lander.' },
  land:    { users: 'Engineers planning future landings', parts: ['lander'],
             why: 'You need the surface lander, and you have to fly it down yourself.' },
  tag:     { users: 'Scientists studying how the planets formed', parts: ['sampler'],
             why: 'The sample collector arm grabs the pebbles during a touch-and-go.' },
  home:    { users: 'Lab scientists on Earth with instruments too big to fly', parts: ['capsule'],
             why: 'Only a return capsule with a heat shield can bring anything back to Earth.' },
  ice:     { users: 'Future Mars explorers looking for water to drink and make fuel', parts: ['radar', 'lander'],
             why: 'Ground-penetrating radar sees ice under the soil. A lander can dig for it.' },
  storm:   { users: 'Mission operations engineers who keep spacecraft alive', parts: ['rtg', 'batL', 'fuelcell'],
             why: 'Dust blocks sunlight. An RTG, a big battery or a fuel cell keeps the lights on.' },
  habit:   { users: 'Astrobiologists searching for places life could exist', parts: ['irs', 'radar', 'hirc', 'mag', 'lander', 'sampler', 'mspec'],
             why: 'Each clue needs a different instrument, so a mix works best.' }
};

// ---------- real missions like yours ----------
// match(x): x = { m (mission), d (derived design), plan }
const has = (x, id) => x.d.instruments.includes(id);
const REAL_MISSIONS = [
  { name: 'Landsat 9', year: 2021, fact: 'Photographs all of Earth\'s land every 16 days from a sun-synchronous orbit, carrying on a record that began in 1972.',
    match: x => x.m.id === 'm1' && x.plan.orbit === 'sso' && (has(x, 'wac') || has(x, 'hirc')) },
  { name: 'Terra', year: 1999, fact: 'Carries five instruments that watch Earth\'s land, oceans, ice and air together, to track how the climate is changing.',
    match: x => x.m.id === 'm1' && has(x, 'irs') },
  { name: 'Lunar Reconnaissance Orbiter', year: 2009, fact: 'Maps the Moon from a low polar orbit and found some of the coldest places measured in the solar system, inside dark polar craters.',
    match: x => x.m.id === 'm2' && x.plan.orbit === 'polar' },
  { name: 'LCROSS', year: 2009, fact: 'Sent a spent rocket stage crashing into a dark crater near the Moon\'s south pole and found water in the cloud it threw up.',
    match: x => x.m.id === 'm2' && has(x, 'irs') },
  { name: "Chang'e 4", year: 2019, fact: "China's lander made the first soft landing on the far side of the Moon, talking to Earth through a relay satellite.",
    match: x => x.m.id === 'm2' && !!x.d.lander },
  { name: 'OSIRIS-REx', year: 2016, fact: 'Touched asteroid Bennu for a few seconds in 2020 and dropped its sample capsule in the Utah desert in 2023.',
    match: x => x.m.id === 'm3' && !!x.d.sampler && !!x.d.capsule },
  { name: 'Hayabusa2', year: 2014, fact: "Japan's spacecraft used ion engines to reach asteroid Ryugu and returned samples to Australia in 2020.",
    match: x => x.m.id === 'm3' && x.d.engine && x.d.engine.slow },
  { name: 'Dawn', year: 2007, fact: 'Used ion engines to orbit two different worlds, Vesta and Ceres, something no chemical engine could afford.',
    match: x => x.m.id !== 'm3' && x.d.engine && x.d.engine.slow },
  { name: 'Mars Reconnaissance Orbiter', year: 2005, fact: 'Spent about six months aerobraking into a low orbit. Its radar has mapped ice buried under the Martian plains.',
    match: x => x.m.id === 'm4' && (x.plan.traj === 'aero' || has(x, 'radar')) },
  { name: 'Perseverance', year: 2020, fact: 'Landed in Jezero Crater in 2021. It runs on a nuclear power source, so dust and night do not stop it.',
    match: x => x.m.id === 'm4' && !!x.d.lander && x.d.rtg > 0 },
  { name: 'Opportunity', year: 2003, fact: 'This solar-powered rover worked for more than 14 years, until a planet-wide dust storm in 2018 blocked its sunlight.',
    match: x => x.m.id === 'm4' && x.d.rtg === 0 },
  { name: 'Cassini', year: 1997, fact: 'Flew past Venus, Earth and Jupiter to reach Saturn, ran on nuclear power, and flew through the ice plumes of the moon Enceladus.',
    match: x => x.m.id === 'm5' && (x.d.rtg > 0 || x.plan.traj === 'assist') },
  { name: 'Europa Clipper', year: 2024, fact: "Carries ice-penetrating radar and some of the largest solar wings ever flown on a planetary mission, to study Jupiter's ocean moon Europa.",
    match: x => x.m.id === 'm5' && (has(x, 'radar') || x.d.solarKw >= 20) },
  { name: 'Juno', year: 2011, fact: 'Proved solar power can work at Jupiter, with three wings each about 9 metres long.',
    match: x => x.m.id === 'm5' && x.d.rtg === 0 && x.d.solarKw > 0 }
];

// ---------- learn more (the challenge resources, and what each one shaped in the game) ----------
const RESOURCES = [
  { name: 'NASA: Design and Develop Science Missions (webinar slides)', url: 'https://ntrs.nasa.gov/citations/20250002492',
    note: 'How a mission grows from a science question into a design, split into launch, space, ground and user segments.',
    used: 'You pick the science goal first, choose ground stations, and the launch review is grouped by segment.' },
  { name: 'JPL: Concept Maturity Levels (Mission Development 101)', url: 'https://science.nasa.gov/wp-content/uploads/2023/11/03-ziemer-mission-development-101-cmls.pdf',
    note: 'A scale for how grown-up a mission idea is, from a sketch on a napkin (CML 1) to a full point design and beyond.',
    used: 'The phase bar at the top of the planning screens.' },
  { name: 'NASA Goddard: Mission Design Lab', url: 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/',
    note: 'A room where engineers design a whole mission together in a few days, trading one option against another.',
    used: 'The Compare tab in the hangar: a trade study of up to three designs.' },
  { name: 'NASA: General Mission Analysis Tool (GMAT)', url: 'https://software.nasa.gov/software/GSC-19640-1',
    note: 'Free, open-source software that real teams use to plan orbits and trajectories.',
    used: 'The rocket equation behind the fuel meter, and the trajectory diagram in the launch review.' },
  { name: 'NASA: Web-based Mission Visualization (Mission Viz)', url: 'https://nasa.github.io/mission-viz/X3Dom/WebMissionVisualizationTutorialSeries.html',
    note: 'Tutorials on turning a planned trajectory into a picture anyone can explore in a web browser.',
    used: 'The concept-of-operations timeline and the trajectory diagram in the launch review.' },
  { name: 'NASA Webb: For Fun (includes the "Build It Yourself" satellite game)', url: 'https://science.nasa.gov/mission/webb/for-fun/',
    note: 'Choose what your telescope should study, then pick the instruments and optics to match.',
    used: 'Each goal shows who uses the data and its ★ parts, and the report lists real missions like yours.' },
  { name: 'NASA: CubeSat 101', url: 'https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf',
    note: 'A guide for first-time teams building and launching a very small satellite.',
    used: 'The small bus and the power and data budgets on mission 1.' },
  { name: 'Canadian Space Agency: digital games and activities', url: 'https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp',
    note: 'Free space games and activities for young explorers.',
    used: 'Beginner mode, Ollie the coach and plain-language help.' }
];

// ---------- phase bar (with JPL Concept Maturity Level labels) ----------
const PHASES = [
  { id: 'goal',   label: 'Science goal', cml: 'CML 1–2 · the idea', screens: ['briefing', 'goal'] },
  { id: 'design', label: 'Design',       cml: 'CML 3 · trade space', screens: ['hangar'] },
  { id: 'review', label: 'Review',       cml: 'CML 4 · point design', screens: ['review'] },
  { id: 'fly',    label: 'Fly',          cml: 'Operations', screens: ['game', 'watch', 'explore', 'crisis'] },
  { id: 'report', label: 'Report',       cml: 'Lessons learned', screens: ['report'] }
];

// ---------- plain-language help for each meter ----------
const EXPLAIN = {
  mass:   { title: 'Mass', icon: '⚖️',
            text: 'Everything you add makes the spacecraft heavier. Your rocket can only lift so much, and less for far-away targets. Fuel is usually the heaviest thing on board.',
            fix: 'Too heavy? Remove a part, pick a route that needs less fuel, or choose a bigger rocket.' },
  fuel:   { title: 'Fuel', icon: '⛽',
            text: 'You need fuel to brake into orbit, and more to come home. The rocket equation says heavier ships need much more fuel, and that fuel adds weight too.',
            fix: 'Short of fuel? Add more in the Plan tab, lighten the ship, or use a better engine.' },
  power:  { title: 'Power', icon: '⚡',
            text: 'Instruments, the antenna and heaters all use electricity. Solar wings get weaker the farther you are from the Sun. Batteries cover the time spent in shadow.',
            fix: 'Low on power? Add a solar wing or an RTG, or carry fewer power-hungry parts.' },
  budget: { title: 'Budget', icon: '💰',
            text: 'Parts, the rocket, ground stations and every month of operations all cost money. Go over budget and the mission is cancelled before launch.',
            fix: 'Over budget? Try a smaller rocket, a cheaper antenna, or fewer months of operations.' },
  data:   { title: 'Data', icon: '📶',
            text: 'Instruments make data. The antenna sends it to Earth, more slowly the farther away you are. Data that never gets home is science you never did.',
            fix: 'Losing data? Fit a bigger dish, book more ground-station time, or carry fewer big cameras.' },
  time:   { title: 'Time', icon: '⏱️',
            text: 'Longer trips cost more to run, and power sources fade. Some missions have a deadline.',
            fix: 'Too slow? Pick the faster route, or swap the ion engine for a chemical one.' }
};

// ---------- handbook ----------
const HANDBOOK = [
  { title: 'How to play', html:
    '<p>Each mission follows the same path that real missions do.</p>' +
    '<ol><li><b>Pick a science goal.</b> It decides which parts matter most.</li>' +
    '<li><b>Build the spacecraft.</b> Drag parts onto it, or tap a part to place it. Watch the meters.</li>' +
    '<li><b>Plan the trip.</b> Choose a rocket, an orbit and ground stations.</li>' +
    '<li><b>Pass the launch review.</b> Red items stop the launch. Amber items are risks you can accept.</li>' +
    '<li><b>Fly it.</b> You pilot the launch, the cruise, the braking burn and any landing.</li>' +
    '<li><b>Do science.</b> Choose where to look. Each instrument finds different things.</li>' +
    '<li><b>Read the report.</b> It says what happened, why, and what to try next.</li></ol>' },
  { title: 'The six meters', html:
    '<p><b>Mass</b>: must fit on the rocket. <b>Fuel</b>: enough to brake and come home. <b>Power</b>: make more than you use. ' +
    '<b>Budget</b>: stay under it. <b>Data</b>: send home as much as you collect. <b>Time</b>: arrive before any deadline.</p>' +
    '<p>Green is healthy, amber is risky and red will hurt. Press the <b>?</b> on a meter to learn more.</p>' },
  { title: 'Words you will meet', html:
    '<p><b>Bus</b>: the body of the spacecraft that everything bolts onto.<br>' +
    '<b>Delta-v (Δv)</b>: how much you must change your speed. More Δv means more fuel.<br>' +
    '<b>Isp</b>: engine efficiency. Higher means less fuel for the same push.<br>' +
    '<b>Max-Q</b>: the moment of peak air pressure on the rocket during launch.<br>' +
    '<b>ADCS</b>: the system that points the spacecraft.<br>' +
    '<b>RTG</b>: a nuclear battery that turns heat into electricity.<br>' +
    '<b>Downlink</b>: sending data to Earth.<br>' +
    '<b>AU</b>: the distance from Earth to the Sun, about 150 million km.<br>' +
    '<b>ConOps</b>: concept of operations. The plan for the whole mission, start to finish.</p>' },
  { title: 'Tips', html:
    '<ul><li>There is no single right spacecraft. Light and cheap can beat big and fancy.</li>' +
    '<li>Leave some spare fuel and budget. Things go wrong on the way.</li>' +
    '<li>A big camera is no use if the antenna cannot send its pictures home.</li>' +
    '<li>Stuck? Press "Build it for me" in the hangar, then improve the design yourself.</li></ul>' },
  { title: 'About this game', html:
    '<p><b>AstroNova</b> was made by Team Poppy Pants for the NASA Space Apps Challenge "Space Mission Design Game". The engineering uses real relationships with simplified numbers. Rocket and part names are made up, and Ceruvia is fictional.</p>' +
    '<p><b>Use of AI:</b> the code, in-game text and synthesized sound were written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. No AI-generated images are used. All art is drawn in code.</p>' +
    '<p>This game is not affiliated with or endorsed by NASA or any other space agency.</p>' }
];
