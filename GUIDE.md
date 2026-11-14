
# Build guide (reference design: Last Signal from Ceruvia)

> This kit describes a finished game, "Last Signal from Ceruvia", so a new session can build a game like it from scratch. Everything below describes that reference game. When you build, write fresh code in this folder, following PROMPT.md. The names, files and functions here are a proven layout to follow, not files that already exist.

A browser game for the 2026 NASA Space Apps Challenge "Space Mission Design Game". The player gets five missions, from Earth orbit out to an icy moon called Ceruvia. For each one they pick a science goal, build a spacecraft by drag and drop, and pass a launch review. Then they fly arcade versions of launch, cruise, orbit insertion, landing and reentry, explore with science passes, survive a power emergency and get a report. Two to four players can do all of this together online.

- The reference game is live at https://saket-vanga.github.io/last-signal-from-ceruvia/ (play it to see the target; don't copy its code)
- Stack: plain HTML, CSS and JavaScript. No build step, no framework, no npm, no images, no audio files.

This file is the map. The details are in the other files in this folder:

| File | Read it when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Touching any code: file order, global state `S`, `SCREENS`, `ACT`, the render loop, wrapper chaining, saves |
| [ENGINEERING_MODEL.md](ENGINEERING_MODEL.md) | Changing `calc()`, budgets, parts, fuel, power, data, the launch review |
| [GAME_DESIGN.md](GAME_DESIGN.md) | Missions, minigames, beginner mode, the fun layer, how each challenge resource maps to a feature |
| [MULTIPLAYER.md](MULTIPLAYER.md) | Online co-op: Firebase, `?local`, roles, state sync, turn hand-offs, live watching |
| [TESTING.md](TESTING.md) | Before any playtest, solo or online, local or live |
| [COMPLIANCE.md](COMPLIANCE.md) | Before submitting, or when adding content, data, credits or third-party code |
| [DATA_REFERENCE.md](DATA_REFERENCE.md) | Starting numbers for parts, rockets, buses, difficulties and missions, so balancing starts from a version that works |
| [PROMPT.md](PROMPT.md) | Rebuilding a game like this from nothing, or briefing another agent on the whole project |

## Non-negotiables

1. **No build step.** Keep everything as classic `<script>` tags loaded in this order: `data → sim → audio → fx → builder → minigames → game → firebase-config → net → fun`. Every file shares one global scope. A later file can wrap something from an earlier file, but never the other way round.
2. **Data lives in `js/data.js`, maths in `js/sim.js` (no DOM), screens in `js/game.js`.** Balance a mission by editing data, not code.
3. **Wrap, don't fork.** Add features to `fun.js` (or a new file loaded after it) by wrapping existing functions: save the old one, reassign, call through. Wrapper variable names need a file prefix (`fun_render`, `fun_place`), because `net.js` already declares `_render`, `_refreshHangar` and `_savePatch` at top level, and a second `const _render` is a SyntaxError that kills the whole file.
4. **Every state change goes through `render()`, `rerender()` or `refreshHangar()`.** `net.js` wraps those to broadcast state to the crew. If you mutate `S` and redraw by hand, co-op players won't see the change.
5. **Beginner first.** The default difficulty is `rookie` (`simple: true`). Any new control needs a plain-language explanation, a sensible automatic default, and a place out of the way (`<details class="adv">`) when it's only for experts.
6. **Mute before you test.** Run `if (!SFX.muted) SFX.toggle(); if (SFX.musicOn) SFX.toggleMusic(); SFX.rumbleStop();` in every tab. `localStorage.clear()` turns sound back on.
7. **Compliance stays true.** Every new JS or CSS file starts with the AI-assistance header. Keep NASA logos and patches out of the game. Real-mission facts must be short and written in our own words. No personal data beyond a typed nickname. The license is Apache-2.0.

## Common tasks

### Add a part
1. Add an entry to `PARTS` in `js/data.js`: `slot` (`engine|antenna|top|bottom|side|bay|core`), `cat` (one of `CATS`), `name`, `short`, `mass`, `cost`, plus the stats its slot uses. Instruments need `power` and `data`, and power parts need `kw`, `watts` or `wh`. Add `unlock: <missionNum>` if it should appear later and `kind` if only one per ship is allowed (`computer|adcs|recorder`).
2. If `derive()` or `calc()` in `js/sim.js` need to read a new stat, add it there.
3. Add a style to `CAT_STYLE` and `FACES` in `js/fx.js` if it's a new category.
4. If it's an expert part, add its id to `ADVANCED` in `js/builder.js` so beginners don't see it until they choose "Show advanced parts too".
5. Add a line for it to `PART_QUIPS` in `js/fun.js`.
6. If it helps a science goal, add it to `GOAL_NEEDS[goal].parts` in `data.js` so the shelf shows ★ Goal.
7. Run Auto-build for every mission on rookie and engineer (see TESTING.md). Each must still pass review with no blocks and meet its goal.

### Add a mission
Copy a block in `MISSIONS` in `js/data.js`. Every field is used: `id, num, name, target, planet, au, comm, capFactor, budget, opsPerMonth, passMonths, ops, minigames, hazard, crisis, needReturn, window?, intro, outro, newParts, objectives[3], trajs, orbits, clues, sites, critical, sampleLab?, tagFinding?`. Each objective's `check(R)` reads the result summary built in `finalize()`. Then add `GOAL_NEEDS` entries for its objective ids, `REAL_MISSIONS` matches, a planet face in `FACES`, and `planetColors()` in `game.js`. Budgets went up $20M per mission when the ground segment cost was added, so balance against a ground network ($20M).

### Add a minigame
Add `GAMES.<kind> = { title, how, keys:[{k,l}], init(opts,w,h), step(s,dt) → result|null, draw(ctx,s,w,h), hud(s), verdict(res) → {good,title,text} }` in `js/minigames.js`. Call it with `startGame(kind, opts, onDone)` from a step function, and register the step in `STEPS` so co-op can hand it to the right player. Give it an owner in `GAME_ROLE`. Live spectating sends every non-function field of the state object, so keep it small and serializable. `rankOf()` in `fun.js` turns the result into an S–D stamp, so add a case there.

### Add a screen
`SCREENS.<name> = { html() → string, after?() }` in `game.js` (or `fun.js`). Navigate with `go('<name>')`. Add the name to the rerender list in `NET.gotPlayers` if co-op players should see it refresh when the crew changes.

### Add a button
Use `<button data-act="name" data-arg="x">` and `ACT.name = (arg, el, ev) => {...}`. One delegated click listener in `game.js` handles every button. Inputs use `data-input` with the `input` and `change` listeners at the bottom of `game.js`.

## How it was built (sequence)

This is the order the reference game was built in, and it's a good order to follow:
1. A one-file prototype, then a rebuild into a five-mission campaign with a typed-slot drag-and-drop hangar and canvas arcade minigames.
2. A visual identity: cosmic palette, rounded display fonts, squishy buttons, confetti and a starfield. Then a cartoon sticker style with outlined cards, crew portraits drawn in SVG, faces on planets and a googly-eyed spacecraft.
3. Mobile pass: taller game screens, touch buttons, and tap-to-place as well as drag.
4. Online co-op: one transport interface with two implementations (Firebase and a BroadcastChannel one for `?local`), roles shared out in join order, the whole game state broadcast as JSON, turn hand-offs, and live watching of whoever is piloting.
5. Beginner mode: the coach, Auto-build, auto fuel and fix-it hints.
6. The challenge resources: science goal first, four mission segments, ground stations, trade study, ConOps timeline and trajectory, real missions like yours, and Learn more links.
7. The fun layer (`fun.js`): chiptune, rank stamps, combos, badges, hats and discovery cards. Then a hangar tour, meter explainers, versus challenge links, a scan minigame and spacecraft moods.
8. Compliance: license, AI disclosure everywhere it's needed, references, and nickname prompts.

Each step was playtested in the browser pane before it was committed, and online play was retested after every feature that touched shared state.
