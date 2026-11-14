# Engineering model (`js/sim.js`)

The idea: **real relationships, simplified numbers**. Every number on the dashboard comes from one function, `calc(build, plan, mission, diffKey, bonusBudget)`. It touches no DOM and has no side effects, so it can run every frame.

## Inputs

- `build.slots`: part ids by slot. `derive(build)` turns it into facts: `engine`, `antenna`, `capsule`, `lander`, `instruments`, `sampler`, `solarKw`, `solarWings`, `rtg` (count), `batteryWh`, `fuelcell`, `computer`, `adcs`, `recorder`, `shields`.
- `plan`: `lv` (a `LAUNCHERS` key), `traj` and `orbit` (keys in the mission's `trajs` and `orbits`), `fuel` (kg), `opsMonths`, `ground` (a `GROUND` key), `goal` (an objective id).
- Mission fields used: `au`, `comm` (data-rate factor for distance), `capFactor`, `budget`, `opsPerMonth`, `passMonths`, `needReturn`, `window` (deadline in years), `trajs[k] = {lf, dvIns, dvDep, cruise}`, `orbits[k] = {dv, cap?, eclipse, dataFactor, detail, radRisk}`.

## Mass

```
partsMass  = Σ part.mass
structMass = bus.mass + STRUCT_FRAC(0.10) × partsMass
tankMass   = TANK_FRAC(0.08) × fuel
dry = parts + struct + tank;  wet = dry + fuel
capacity   = launcher.leo × m.capFactor × traj.lf × (orbit.cap || 1)
massMargin = (capacity − wet) / capacity
```

The capacity shrinks for harder destinations. Gravity assists and aerobraking raise `lf` or `cap`.

## Fuel (the rocket equation)

```
ve = isp × g0 / 1000            (km/s; with no engine, isp is taken as 300)
dvIns = traj.dvIns + orbit.dv + 0.05
dvDep = needReturn ? traj.dvDep : 0
fuelRequired: the lander is dropped before departure, so
  mEnd       = dry − landerMass
  mBeforeDep = mEnd × e^(dvDep/ve)
  mBeforeIns = (mBeforeDep + landerMass) × e^(dvIns/ve)
  fuelReq    = mBeforeIns − dry
fuelMargin = (fuel − fuelReq) / fuelReq
```

`autoFuel()` runs this 30 times (tank mass depends on fuel), adds 8% and rounds up to the next 10 kg, with a cap of 12,000 kg. In simple mode `syncFuel()` calls it after every change unless the player has moved the slider themselves (`plan.manualFuel`).

An ion engine (`slow: true`) adds 25% to cruise time and needs `minPower` watts at the target.

## Power

```
solarAt(kw, au) = kw × 1000 / au²  × (au > 3 ? 1.2 : 1)   (inverse square; the far-sun bonus keeps Ceruvia from being impossible)
rtgAt(n, years) = n × 150 W × (1 − 0.016)^years
heater = au > 3 ? 60 W : 30 W
baseLoad = heater + computer + adcs + recorder
load = baseLoad + instruments + antenna
avgGen = rtg + solar × (1 − orbit.eclipse)
powerMargin = (avgGen − load) / load
eclipse need (Wh) = max(0, load − rtg) × eclipse × 2 h   → battery must cover it
duty = how much of the time instruments can run when power is short (and when the battery can't cover the eclipse)
```

`duty` multiplies the data made and the science points. That's how a power shortfall costs science instead of just blocking the launch.

## Data and the ground segment

```
genMbDay  = Σ instrument.data × orbit.dataFactor × duty
downMbDay = antenna.rate × 28.8 × m.comm × ground.hours / 8
dataRatio = min(1, down / gen)
```

The `GROUND` options are a single station (4 h a day, $5M), a three-station network like the DSN (8 h, $20M) and priority time (16 h, $45M). The recorder (`gb`) holds data that hasn't been sent yet. During exploration, entries can be lost if the recorder fills up or gets wiped in the crisis.

## Cost and schedule

```
hwCost   = Σ part.cost + bus.cost
opsCost  = cruise × (needReturn ? 2 : 1) × 12 + opsMonths × m.opsPerMonth
cost     = hwCost + launcher.cost + opsCost + ground.cost
budget   = m.budget × DIFF.budgetMult + bonus   (bonus = $30M per star earned on earlier missions)
passes   = max(1, floor(opsMonths / m.passMonths))
arrivalOk = cruise ≤ m.window
devYears(c) in game.js = 1.5 + 0.06 × parts + 0.5 lander + 0.4 capsule + 0.6 RTG + 0.3 ion  (build-and-test time, shown first on the ConOps timeline)
```

## Launch review (`review()`)

`reviewItems()` returns `{level: 'block'|'warn'|'ok', title, why}`. `review()` gives each item a segment (`launch|space|ground|user|mission`) from `SEG_OF[title]`, or `'space'` by default. The review screen groups items by segment, following NASA's "Design and Develop Science Missions" breakdown.

- **Blocks** (launch is not allowed): missing essentials (engine, antenna, computer, ADCS, battery, a power source, recorder), no science instruments, too heavy for the rocket, over budget.
- **Warnings** (allowed, but it will hurt): not enough or little spare fuel, arriving after the deadline, ion engine with no power, power deficit, battery too small for eclipses, antenna can't keep up, ground stations missing data, no capsule/lander/sampler when the mission needs one, low-orbit-only instrument in a high orbit, high-res camera too far away, radiation risk with a standard computer, no debris shield when there's a hazard, prime goal at risk.
- **OKs** give the actual margins, so the player learns what "good" looks like.

`requirementsHtml(c)` shows the same checks as a table of requirement against what the design delivers.

## Science goal

`GOAL_NEEDS[objectiveId] = {users, parts?, tag?, orbit?, why}`. `goalParts(m, id)` lists the parts that serve the goal: the listed parts, or any instrument whose discovery `tag` matches. `goalStatus(build, plan, m, id)` → `{ok, have, orbitOk}`. Meeting the prime goal is worth +100 in `finalize()`.

## Scoring (`finalize()` in game.js)

```
run.sciMult starts at the ADCS part's `mult` (1 with no ADCS) and drops ×0.8 if the crisis froze instruments
science = Σ finding.pts × fractionDownlinked × run.sciMult × duty × (finding.mult ?? 1)  + sample-lab bonus + bonusSci
total = science + stars×100 + piloting scores + dataReturned×50 + budget left over (0–100) + prime goal (0/100)
```

The scan minigame sets `finding.mult` (×0.85 to ×1.3). Objectives are `check(R)` functions on the result summary `R` (from `liveR()`): `sitesWithFinds`, `tags`, `found` (a Set of finding ids), `capsuleLanded`, `dataReturned` and so on.

## Balancing workflow

1. Change numbers in `data.js` only.
2. For each mission and difficulty, run `recommendBuild(m)` and check `review()` has no blocks and `goalStatus().ok` is true (see TESTING.md for the snippet).
3. Check that a careless build fails in a way you can learn from, and that the review says why.
4. Rookie must never need ADVANCED parts. `recommendBuild` skips them in simple mode.
