# Full build prompt: a space mission design game

Paste everything below the line into a coding agent to build a game like "Last Signal from Ceruvia" from scratch, or use it as a brief for a big change. It describes what was built, in the order it was built, with the rules that kept it working. Replace the story, names and numbers with your own if you're making a new game instead of rebuilding this one.

---

You are building a browser game for the NASA Space Apps Challenge "Space Mission Design Game". The player designs and flies science missions. They choose a science goal, build a spacecraft from parts with real trade-offs (mass, power, cost, data), pick a rocket, trajectory, orbit and ground stations, pass a launch review, fly arcade versions of each flight phase, do science, and get a report explaining what happened and why. It must be fun for complete beginners, teach how real missions are planned, and have no single correct spacecraft.

## Hard constraints

- Plain HTML, CSS and JavaScript. **No build step, no framework, no npm, no bundler.** It runs from `python3 -m http.server` and deploys to GitHub Pages as-is.
- **No image or audio files.** Draw everything with CSS, inline SVG and `<canvas>`, plus system emoji. Synthesize all sound with the Web Audio API.
- Classic `<script>` tags in a fixed order, sharing one global scope: `data.js → sim.js → audio.js → fx.js → builder.js → minigames.js → game.js → firebase-config.js → net.js → fun.js`. A later file may use or wrap things from an earlier one, never the reverse.
- Works at 375px wide with touch and no horizontal scroll. Keyboard works everywhere. Respect `prefers-reduced-motion`. All game text in English, short sentences, plain words.
- Wrap every `localStorage` access in try/catch.
- Escape all player-typed text before putting it in HTML.
- Put this header at the top of every JS and CSS file: `/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */`

## Story and structure

A faint, repeating radio signal is coming from Ceruvia, an icy moon 9.5 AU from the Sun, and it's fading. Nobody will fund a trip until the team proves itself across five missions:

1. **Shakedown**, Earth orbit: mass, power, budget, orbit coverage. Fly only the launch.
2. **Quiet Side**, the Moon's far side: radio quiet, landing.
3. **Pebble Run**, an asteroid: touch-and-go sample, ion vs chemical engine, reentry with a capsule.
4. **Red Shadow**, Mars: solar vs RTG power, a dust storm power emergency, buried ice.
5. **Last Signal**, Ceruvia: 90× weaker sunlight, a 7.5-year arrival deadline, everything at once.

Each mission has three objectives worth one star each. One star unlocks the next mission, and each star adds $30M to later budgets. A crew of three cartoon characters talks in each briefing: the mission director, the chief scientist and a cheeky flight dynamics officer who coaches the player and comments on results.

## Step 1: data (`js/data.js`)

All content and tuning goes here, so balancing never needs code changes.

- `DIFF`: Beginner (default; budget ×1.5, 1 event, 3 retries, minigame tolerance ×1.7, `simple: true`), Cadet, Engineer (realistic), Flight Director (hard), Sandbox (infinite budget, all missions open).
- `BUSES`: small, medium and large, setting the number of instrument bays, internal slots and side mounts, plus mass and cost.
- `PARTS`, each with `slot` (engine, antenna, top, bottom, side, bay, core), `cat`, `name`, `short`, `mass`, `cost`, and stats by type:
  - engines: `isp`; the ion engine also has `slow` and `minPower`
  - antennas: `rate`, `power`
  - solar: `kw`; RTG: `watts`; batteries and fuel cell: `wh`
  - computers, ADCS (`agility`, science `mult`) and recorder (`gb`): one of each kind per ship
  - debris shield
  - instruments: `power`, `data`, and `low` if they only work from a low orbit
  - capsule, lander, sampler
  - `unlock: missionNum` for parts that arrive later
- `LAUNCHERS`: four made-up rockets with LEO capacity and cost.
- `MISSIONS`, each with: `au`, `comm` (data-rate factor), `capFactor`, `budget`, ops cost per month, months per science pass, which minigames run, `hazard`, `crisis` settings, `needReturn`, `window`, dialog `intro`/`outro`, `objectives` with `check(R)` functions, `trajs` (`{lf, dvIns, dvDep, cruise}`), `orbits` (`{dv, cap, eclipse, dataFactor, detail, radRisk, maxLat}`), `clues`, `sites` with discoveries per instrument (`{id, tag, pts, title, why}`), and `critical` (the two resources that matter most, with reasons).
- `EVENTS`: solar storm, wheel failure, leak, ground antenna outage, budget review, debris, and a detour choice. Each is resolved by design choices.
- `GROUND`: one station (4 h a day, $5M), a three-station network (8 h, $20M), priority time (16 h, $45M).
- `GOAL_NEEDS`: for each objective, who uses the data, which parts help, and why.
- `REAL_MISSIONS`: short facts in your own words with match functions (Landsat 9, Terra, LRO/LCROSS, OSIRIS-REx, Hayabusa2, MRO, Perseverance, Cassini, Europa Clipper...).
- `RESOURCES` (Learn more links), `PHASES`, `EXPLAIN` (plain-language help for mass, fuel, power, budget, data and time), `HANDBOOK`.

## Step 2: engineering model (`js/sim.js`, no DOM)

One pure function, `calc(build, plan, mission, difficulty, bonus)`, returns every number the UI needs:

- **Mass**: parts + bus + 10% structure + tank (8% of fuel). Capacity = rocket LEO × mission factor × trajectory factor × orbit factor. Mass margin.
- **Fuel** by the rocket equation with `ve = isp·g0`. The insertion burn carries the lander. The lander is dropped before the departure burn. `autoFuel` iterates to the required fuel + 8%.
- **Power**: solar ∝ 1/au² (×1.2 beyond 3 AU so the outer mission stays possible), RTG 150 W decaying 1.6% a year over the cruise, heater load at distance, eclipse battery check, and a duty cycle when power is short (it scales data and science).
- **Data**: generated per day vs downlinked per day = antenna rate × distance factor × ground-station hours / 8.
- **Cost**: hardware + rocket + ops (cruise years and ops months) + ground stations, against budget × difficulty + star bonus.
- **Schedule**: cruise vs deadline. The ion engine adds 25%.
- `review()` returns block, warn and ok items, each tagged with a segment: launch, space, ground, user, or whole mission. Blocks: missing essentials, no instruments, too heavy, over budget. Everything else warns, with the real margins and a plain-language reason and fix.

## Step 3: shell and screens (`js/game.js`)

- Global state `S`. `render()` = `app.innerHTML = SCREENS[S.screen].html(); SCREENS[S.screen].after?.()`. `go(screen)` and `rerender()` keep the scroll position.
- One delegated click listener: `[data-act]` → `ACT[name](arg, el, ev)`, which also unlocks audio. Inputs use `data-input`.
- Screens: title → setup (difficulty, nickname) → map (Mission control) → briefing → goal (prime science goal: who uses the data, ★ parts that help) → hangar → review → minigames and events → explore → crisis → reentry → report → finale. Plus a handbook drawer, modal and toast.
- The mission run is a chain of step functions registered in `STEPS` and started with `runStep()`, so co-op can hand a step to another player.
- Report: score breakdown (science × fraction of data home × ADCS mult × duty, objectives × 100, piloting, data home × 50, budget left, prime goal +100), stars, hints for missed objectives, lessons, real missions like yours, and the leaderboard.
- Save the campaign, builds and settings to localStorage. Shareable design codes.

## Step 4: hangar (`js/builder.js`)

- Spacecraft drawn in HTML/CSS with typed mount points. Shelf by category. Pointer-event drag and drop that works with mouse and touch, plus tap to place. Matching slots light up while dragging.
- Live meters (mass, fuel, power, budget, data, time), each with a `?` explainer and a fix hint when amber or red. Update only the meters and ship while editing (`refreshHangar`) so drags aren't destroyed.
- Plan tab: rocket cards (fits / too heavy), orbit, ground stations, and "More settings" (trajectory, fuel, ops months) in a `<details>`.
- Paint tab: spacecraft name and colour, and a canvas mission patch (brush, eraser, stamps, fill, undo) with the name on the ring. The patch shows on the ship and the reports.
- Compare: save up to three designs and compare them (a trade study).

## Step 5: minigames (`js/minigames.js`)

Shared interface: `GAMES[kind] = {title, how, keys, init, step(s, dt) → result|null, draw, hud, verdict}`, a 3-2-1 countdown, rAF loop with dt capped at 0.05, on-screen touch buttons, a verdict overlay with a coach quip, retries from difficulty, and a `lesson(res)` line. The design must change how each one plays:

- **Launch**: follow the gravity-turn line and throttle down through Max-Q. A heavier ship is sluggish, and the ADCS sets agility. Beginners get auto-throttle through Max-Q. Combo for holding the line.
- **Cruise**: dodge debris and grab star fixes. Hits break real parts unless shields absorb them. Bigger solar wings mean a bigger target.
- **Orbit insertion**: hold to burn, release on the line. Precision decides how much fuel is used.
- **Landing and touch-and-go**: lander physics with local gravity and lander fuel.
- **Reentry**: hold the corridor, then time the parachute.
- **Power emergency** (turn-based): shed loads, use the fuel cell, protect unsent data.
- **Science scan** (a modal): three timed sweeps. Hits multiply that pass's points ×0.85–×1.3, and precision pointing widens the target.

## Step 6: beginner mode

The default difficulty. The coach shows the single next thing to fix, plus a checklist. **Auto-build** makes a simple design that passes review and meets the goal, without expert parts, leaving room for more stars. Fuel fills itself. Expert parts are hidden until asked for. A first-time spotlight tour of the hangar (positioned with rAF so it never goes off screen). Every briefing explains how missions work and names the critical resources. Three retries and wide tolerances.

## Step 7: look and feel

A dark navy space theme with a starfield canvas. Cartoon sticker cards with thick outlines and offset shadows. Rounded display fonts (Baloo 2, Lilita One, Bungee), Nunito for body text, IBM Plex Mono for numbers. Squishy buttons, confetti on wins, SVG crew portraits, planets with faces, a googly-eyed spacecraft. Colours as CSS custom properties.

## Step 8: sound and fun (`js/audio.js`, `js/fun.js`)

- Synthesized effects (click, place, deny, win, lose, countdown blips, rocket rumble). Procedural chiptune: calm at 92 bpm in menus, action at 132 bpm while flying. Separate sound and music toggles, saved.
- In `fun.js`, add these **only by wrapping** existing functions (`const fun_x = x; x = function (...a) { const r = fun_x.apply(this, a); ...; return r; }`), with file-prefixed names to avoid clashes:
  - S/A/B/C/D rank stamps after each piloting segment
  - 18 badges with a pop-up, unlocking 8 hats for the spacecraft
  - discoveries as flip cards with rarity, plus a collection count per world
  - spacecraft moods (happy, worried, panic, from the review) and a quip for each part placed
  - versus challenge links: mission, name, score, stars, cost, science and data packed as base64url in `?vs=`, saved until played, with a head-to-head table on the report

## Step 9: online co-op (`js/net.js`)

- One transport interface with two implementations: **Firebase Realtime Database** (anonymous auth with session persistence, `rooms/<5-letter code>/{players, state, live, patch}`, `onDisconnect` cleanup) and **LocalTransport** for `?local` testing (BroadcastChannel + localStorage heartbeat, so tabs act as players).
- Roles `lead, prop, sci, pwr` go to players in join order (role k → player k mod n). Each player can only change their own part categories. Only the Lead picks the goal and route. Everyone votes GO.
- Sync: wrap `render`, `refreshHangar` and `savePatch` to send a debounced (60 ms) JSON snapshot of the shared state. On receive, ignore your own echoes, set an `applying` flag, and copy the fields in.
- Turn hand-off: `runStep` puts `{id, role, step, args}` in the state, and the owner's device runs it. The pilot streams minigame state every 110 ms, and the others watch a live view.
- Public web config in `firebase-config.js`. Database rules allow access only for signed-in users, on 5-character room codes.

## Step 10: challenge resources

Map each resource from the challenge page to something visible:
- science goal first, and a review grouped into launch, space, ground and user segments (NASA "Design and Develop Science Missions")
- a phase bar with Concept Maturity Level labels, and a trade study panel (JPL CML, Goddard MDL)
- a concept-of-operations timeline with build-and-test time, and an SVG trajectory diagram (Mission Viz, GMAT)
- goals showing who uses the data, and "real missions like yours" (Webb Build It Yourself)
- a "Learn more" handbook section linking every resource

## Step 11: compliance

Apache-2.0 `LICENSE`. A README covering how to play, features, how the resources shaped the game, NASA data used, **Use of AI** (what the team decided; what the AI wrote: code, text, procedural audio; no AI images), a references and licenses table, and a NASA non-endorsement line. An `ai-assistance` meta tag and "About this game" in the handbook. No NASA logos or patches. Nickname only, no other personal data.

## How to work

- Build one step at a time. After each one, run the game in a browser with **sound and music muted**, check the console for errors, check mobile width, and run an auto-build check for every mission and difficulty (no review blocks, goal met).
- After anything that touches shared state, screens or actions, retest co-op with two `?local` tabs: shared edits, role locks, voting, hand-offs, watching, report.
- Remember that hidden tabs pause rAF. Click through event modals instead of closing them. Don't fake `gameEnd` without `gameBegin`.
- Commit each working step with a message saying what the player gets.
