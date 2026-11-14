# Architecture

## Files and load order

`index.html` loads these as classic scripts, in this order. They all share one global scope, so a later file can use or wrap anything an earlier file declared.

| # | File | Lines | What it owns |
|---|---|---|---|
| 1 | `js/data.js` | ~590 | All content and tuning: `DIFF`, `CREW`, `ROLES`, `ROLE_ORDER`, `GAME_ROLE`, `BUSES`, `PARTS`, `UNIQUE_KINDS`, `CATS`, `LAUNCHERS`, constants (`RTG_DECAY`, `HEATER_W`, `STRUCT_FRAC`, `TANK_FRAC`), `PATCH_COLORS`, `PAINTS`, `MISSIONS`, `EVENTS` + `damage()`, `GROUND`, `GOAL_NEEDS`, `REAL_MISSIONS`, `RESOURCES`, `PHASES`, `EXPLAIN`, `HANDBOOK` |
| 2 | `js/sim.js` | ~230 | Pure engineering maths, no DOM: `emptyBuild`, `resizeBuild`, `allParts`, `derive`, `solarAt`, `rtgAt`, `fuelRequired`, `missionBudget`, `calc`, `autoFuel`, `goalParts`, `goalStatus`, `SEGMENTS`, `SEG_OF`, `review`/`reviewItems`, formatters `fmtKg fmtW fmtM fmtPct fmtMb fmtGb` |
| 3 | `js/audio.js` | ~125 | `SFX` (an IIFE module): Web Audio `tone()` and `noise()`, named effects (`click`, `place`, `win`, `lose`, `blip`, `stage`, `rumbleStart`/`rumbleStop`...), mute state in `localStorage['ceruvia-muted']`, and the procedural music scheduler (`music(mode)`, `musicOn`, `toggleMusic`, `localStorage['ceruvia-music']`) |
| 4 | `js/fx.js` | ~140 | `FX` (background starfield on `#bgSpace`, confetti on `#fxLayer`), `CAT_STYLE` (part colours and icons), `FACES` (SVG crew portraits, planet faces, spacecraft eyes), `QUIPS` + `quip()` |
| 5 | `js/builder.js` | ~550 | The hangar: slot labels, `isUnlocked`, `meter`/`dashMeters`, `canPlace`/`place`/`autoPlace`, `slotHtml`/`shipHtml`/`shelfHtml`/`planHtml`/`paintHtml`/`hangarHtml`, `refreshHangar`, pointer drag-and-drop (`DRAG`), patch drawing on canvas (`PATCH`, `initPatch`, `stamp`, `savePatch`), beginner helpers (`isSimple`, `ADVANCED`, `hideAdv`, `syncFuel`, `recommendBuild`, `coachSteps`, `coachHtml`), `goalChip`, `phaseBar`, `tradesHtml` |
| 6 | `js/minigames.js` | ~640 | Keyboard and touch input (`KEYS`, `K`), `GAMES.launch/dodge/insertion/landing/tag/reentry`, `drawShipSide`, `startGame`, `SCREENS_GAME`, `gameBegin` (countdown + rAF loop), `gameEnd` (verdict overlay, retry) |
| 7 | `js/game.js` | ~1140 | Global state `S`, helpers (`$`, `esc`, `clone`, `css`), save and load, `C()` (calc for the current state), role helpers (`ownerOf`, `canAct`, `waitFor`), `STEPS` + `runStep`, `render`/`rerender`/`go`, modal, toast, handbook, every `SCREENS.*` except game/online/lobby/watch, the mission run (`startRun`, `doLaunch`, `eventChain`, `doCruise`, `doInsertion`, `arrive`, `doPass`, `doLanding`, crisis, `doReentry`, `finalize`), report, finale, design codes, `ACT`, global listeners, and the first `render()` |
| 8 | `js/firebase-config.js` | 13 | `window.FIREBASE_CONFIG` (public web config; database rules protect the data) |
| 9 | `js/net.js` | ~360 | `FirebaseTransport`, `LocalTransport`, `NET`, `packRun`/`unpackRun`, live watch drawing, `SCREENS.online/lobby/watch`, net `ACT`s, and the wrappers that broadcast on `render`, `refreshHangar` and `savePatch` |
| 10 | `js/fun.js` | ~410 | Badges, hats, ranks, discovery cards, music switching, the hangar tour, versus challenges, the scan minigame, spacecraft moods. It's all done by wrapping earlier functions |

`style.css` (~1090 lines) is a single sheet. Later features add blocks at the end with a comment header (`/* ---------- fun layer ---------- */` and so on). Colours are CSS custom properties on `:root`. Read them in JS with `css('--name')`.

## The state object `S`

Defined at the top of `game.js`. Fields you'll meet:

- Flow: `screen`, `mode` (`'solo'|'online'`), `players` (`[{name, uid?}]`), `difficulty` (key of `DIFF`), `dlg` (briefing dialog index), `hangarTab` (`'build'|'plan'|'paint'`), `showAdv`
- Campaign: `campaign = { done: {m1: {score, stars, ...}}, unlocked }`, `mission` (a `MISSIONS` entry, stored by reference), `builds` (one saved build per mission)
- Design: `build` (`{bus, slots:{engine:[id], antenna:[id], top:[id], bottom:[id], side:[...], bay:[...], core:[...]}}`), `plan` (`{lv, traj, orbit, fuel, manualFuel, opsMonths, ground, goal}`), `paint`, `shipName`, `patch` (data URL), `brush`, `trades` (per mission, up to three saved designs)
- Run: `run` (everything from launch to report: `c` = calc snapshot, `d`, `log`, `scores`, `entries`, `found`, `passesLeft`, `crisis`, `result`...), `game` (the current minigame `{kind, opts, onDone, state, phase, result}`), `retriesLeft`, `selSite`, `lastPass`, `anim` (rAF id), `ready` (GO votes)
- Co-op: `turn`, `notice`, `watch`, `myName`, `joinCode`
- Fun: `vs` (accepted versus challenge)

`saveCampaign()` writes a subset to `localStorage['ceruvia-save-v2']`. Other keys: `ceruvia-board-v2` (leaderboard), `ceruvia-muted`, `ceruvia-music`, `ceruvia-myname`, `ceruvia-badges`, `ceruvia-hat`, `ceruvia-dex`, `ceruvia-tour`, `ceruvia-vs`. Wrap every storage access in try/catch, because private mode can throw.

## Rendering

```js
function render() {
  const fn = SCREENS[S.screen];
  renderTopbar();
  app.innerHTML = fn.html();
  app.dataset.screen = S.screen;
  if (fn.after) fn.after();
}
function go(screen) { stopAnim(); S.screen = screen; render(); window.scrollTo({ top: 0 }); }
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
```

- `html()` returns a string. Escape anything a player typed with `esc()`.
- `after()` does work that needs the DOM: canvases, `initPatch`, drawing the map, starting the tour.
- In the hangar, `refreshHangar(full)` swaps only the meters, the coach and the ship, so a drag in progress isn't destroyed. `full` rebuilds the shelf too.
- `C()` = `calc(S.build, S.plan, S.mission, S.difficulty, bonusBudget())`. It's cheap, so call it whenever you need numbers.

## Actions

```html
<button class="btn primary" data-act="launch">Launch</button>
<button data-act="setGoal" data-arg="climate">...</button>
```

One delegated `click` listener calls `ACT[name](arg, el, event)` and unlocks audio on the first gesture. Text and range inputs use `data-input="key"`, handled by the shared `input` and `change` listeners. `net.js` and `fun.js` add more listeners with their own keys. Never use inline `onclick`.

## Mission run as steps

The flight is a chain of step functions: `doLaunch → eventChain → doCruise → doInsertion → arrive → explore (doPass / doLanding) → crisis? → doReentry? → finalize → report`. Steps are registered in `STEPS` and started with `runStep(name, ...args)`. In solo play `runStep` just calls the function. Online it checks which role owns that step (a small map inside `runStep`: `doLaunch`/`doInsertion` → prop, `doCruise`/`doReentry` → lead, `doLanding` → sci; keep it in step with `GAME_ROLE` in data.js). If it's another player's, it puts `S.turn = {id, role, step, args}` in the shared state, and the owner's device runs it (see MULTIPLAYER.md).

Each piloting step calls `startGame(kind, opts, onDone)`. `opts` carries the effects of the design: `heavy` (mass margin), `agility` (ADCS part), `tol` (difficulty tolerance), `shield`, `assist`, `retry`, `lesson(res)`, `onHit`. `onDone(result)` stores the score in `S.run.scores[kind]`, logs a lesson and moves to the next step.

## The wrapper pattern (how fun.js and net.js extend the game)

```js
const fun_render = render;
render = function () { fun_render(); /* music mode, banner, etc. */ };

const fun_reportHtml = SCREENS.report.html;
SCREENS.report.html = function (...a) { const h = fun_reportHtml.apply(this, a); return h + extraHtml(); };
```

Rules:
- `render`, `refreshHangar`, `savePatch`, `gameEnd`, `place`, `popFinds`, `shipHtml`, `paintHtml` and `isUnlockedMission` are top-level `function` declarations, so they can be reassigned. Callers inside earlier files look them up by name when they run, so they pick up the wrapper.
- Prefix the saved original's name with the file (`fun_`, `net` uses `_`). The same `const` name declared twice in shared global scope is a SyntaxError, and that error stops the whole file from running.
- A function can be wrapped more than once. `shipHtml` is wrapped for hats (`fun_shipHtml`) and again for moods (`fun_shipHtml2`).
- `ACT` entries and `SCREENS.*.html` / `.after` are object properties, so wrapping them is just a reassignment.
- Wrap with `...a` and `.apply(this, a)` so you don't break arguments you didn't know about.

## UI building blocks (CSS classes worth reusing)

`btn primary|ghost|small|big`, `row gap center end wrap`, `card`, `eyebrow`, `h2`/`h3`, `muted`, `small`, `mono`, `pill`, `role-tag r-lead|r-prop|r-sci|r-pwr`, `meter` (with `.ok|.warn|.bad`), `modal` (+ `wide`, `scan`), `toast`, `drawer` (handbook), `details.adv` (advanced settings), `mphases` (phase bar; the class isn't `.phases` because that name was already taken by older CSS), `vs-banner`/`vs-wrap`, `badgePop`.

Visual style: dark navy space background with a starfield canvas. Display fonts are Baloo 2, Lilita One and Bungee; body text is Nunito; numbers use IBM Plex Mono. Cards look like stickers, with thick outlines and offset shadows. Buttons squish when pressed. Everything is drawn in CSS, inline SVG or canvas, plus system emoji.

Mobile: everything has to work at 375px wide. Minigames show on-screen buttons (`.touch .tbtn` with `data-key`). Parts can be tapped to place as well as dragged. Avoid horizontal scrolling. Respect `prefers-reduced-motion` with the `reduceMotion` const.
