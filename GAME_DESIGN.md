# Game design

## The brief we designed against

The 2026 Space Apps "Space Mission Design Game" challenge asks for a game where players design a science mission: choose objectives, build a spacecraft from parts with real trade-offs (mass, power, cost, data), pick a launch vehicle and trajectory, and see the results. It should teach how real missions are planned, work for beginners, and have no single correct answer. The team's own story ideas: a fading signal from an icy moon; design, launch and explore; survive a power shortage; bring something home.

Design pillars:
1. **Science first.** Every mission starts with a prime science goal, and the goal drives the parts.
2. **Every choice shows up in play.** Mass makes the launch sluggish. Big solar wings are bigger debris targets. A precision pointing system widens the scan target. A weak antenna loses data. A small battery dies in the crisis.
3. **Explain everything in plain words.** Reports say why things happened and what to try next.
4. **No single right spacecraft.** Several designs pass, and the scoring rewards different strengths.
5. **Fun first for beginners.** Generous defaults, automatic helpers, retries and bright feedback.

## Campaign

| # | id | Mission | Target | Teaches | Minigames |
|---|---|---|---|---|---|
| 1 | m1 | Shakedown | Earth orbit | Mass, power, budget; tilted vs sun-synchronous orbits | launch |
| 2 | m2 | Quiet Side | The Moon | Radio noise, lunar far side, landing | launch, dodge, insertion, landing |
| 3 | m3 | Pebble Run | Asteroid 2031 QX | Sample return, ion vs chemical, reentry | launch, dodge, insertion, tag, reentry |
| 4 | m4 | Red Shadow | Mars | Solar vs RTG, dust storms, aerobraking, buried ice | launch, dodge, insertion, landing + power crisis |
| 5 | m5 | Last Signal | Ceruvia (9.5 AU) | Everything: 90× weaker sunlight, 7.5-year deadline, trip home | all + crisis |

- Three objectives per mission, one star each. You need one star to unlock the next mission, and each star adds $30M to later budgets.
- New parts unlock as the story goes on (`part.unlock`, `mission.newParts`).
- Crew: Director Vega (mission director), Dr. Imani Hale (chief scientist) and Ollie Park (flight dynamics; the coach and the voice of the quips). The dialog is in `mission.intro` and `outro` as `[who, line]`.
- `mission.critical` lists the two resources that matter most on that mission, shown on the briefing.

## Screen flow

`title → setup (difficulty, nickname) → map (Mission control) → briefing (dialog, objectives, how every mission works, critical resources) → goal (pick prime science goal; only the Lead can in co-op) → hangar (Build / Plan / Paint tabs, Compare) → review (ConOps timeline, trajectory, requirements, items by segment, GO vote) → game (minigames) ⇄ events → explore (map of sites, science passes with the scan minigame, landing / tag) → crisis (mission 4–5) → game reentry (when there's a return) → report → map … → finale`. Online adds `online → lobby` and `watch`.

The phase bar (`phaseBar`, `.mphases`) shows Science goal → Design → Review → Fly → Report with JPL Concept Maturity Level labels.

## Difficulty (`DIFF`)

| key | label | budget× | events | retries | tolerance | simple |
|---|---|---|---|---|---|---|
| rookie (default) | Beginner | 1.5 | 1 | 3 | 1.7 | ✓ |
| cadet | Cadet | 1.3 | 1 | 2 | 1.4 | |
| engineer | Engineer | 1.0 | 2 | 1 | 1.0 | |
| director | Flight Director | 0.85 | 3 | 0 | 0.75 | |
| sandbox | Sandbox | ∞ | 0 | 9 | 1.4 | (all missions open) |

`tolerance` widens every minigame's success band. `simple` turns on beginner mode.

## Hangar

- Three bus sizes (small, medium, large) set how many side mounts, bays and internal slots there are, plus the bus's own mass and cost.
- Typed mount points: engine, antenna, top (capsule), bottom (lander), side (solar, RTG), bay (instruments, sampler), core (battery, computer, ADCS, recorder, shield). `canPlace` enforces the slot type, unlocks and one-per-kind.
- Drag with pointer events (works with mouse and touch), or tap a part to auto-place it. Slots light up while you drag.
- Live meters for mass, fuel, power, budget, data and time, each with a `?` (an `EXPLAIN` entry) and a fix hint when it's amber or red.
- Plan tab: rocket cards ("✓ fits / ✗ too heavy"), orbit, ground stations, and a "More settings" box for trajectory, fuel and ops months.
- Paint tab: spacecraft name, paint colour, and a canvas patch with brush, eraser, stamps, fill and undo. The name is printed round the ring.
- Compare: save up to three designs and see them side by side (a trade study).
- Share codes: export or import a design as text.

## Beginner mode (the default)

- Ollie the coach (`coachSteps`/`coachHtml`) shows the single next thing to fix, plus a checklist: parts, science, fits the rocket, budget, power.
- **Auto-build** (`recommendBuild`): after a confirm, builds a simple design that passes the review and meets the goal but leaves room to earn more stars. It never uses ADVANCED parts on rookie.
- Auto fuel (`syncFuel`) unless the player touches the slider.
- ADVANCED parts are hidden until the player clicks "Show advanced parts too".
- Hangar tour: six spotlight steps the first time (`TOUR` in fun.js; replay with "Show me around"). It uses a rAF loop that follows the target's position and puts the tip at the top or bottom of the viewport so it never goes off screen.
- Auto-throttle through Max-Q on the launch (`assist`), with an "AUTO-THROTTLE ON" HUD label.
- Each briefing has a "How every mission works" card and the mission's critical resources.

## Minigames (`GAMES` in minigames.js)

Every game follows the same interface: `init`, `step(dt) → result|null`, `draw`, `hud`, `verdict`, plus `how` text and `keys`. There's a 3-2-1 countdown, the loop runs with dt capped at 0.05, and a verdict overlay offers a retry while `retriesLeft > 0`.

- **launch** (Propulsion): follow the gravity-turn line (`ideal(alt) = 90 × √(alt/160)`) and throttle down through Max-Q (8–22 km). `heavy` (from mass margin) makes it sluggish, and `agility` comes from the ADCS part. Holding the line builds a combo ("On the line! ×N").
- **dodge** cruise (Lead): dodge debris and collect star fixes. Hits break real parts (`damage()`) unless shields absorb them. Wider solar wings (`span`) make a bigger target.
- **insertion** (Propulsion): hold to burn and release on the line. Precision affects how much fuel is used.
- **landing** (Science): lander physics with each world's gravity and the lander's fuel. Outcomes are pad, off-pad and crash.
- **tag** (Science): touch-and-go version of the landing that grabs an asteroid sample.
- **reentry** (Lead): hold the corridor between burning up and skipping out, then time the parachute.
- **scan** (fun.js, not in GAMES; Science): a modal with three sweeps. Press SCAN while the line is in the green zone. Zone width = `0.16 × tolerance × (precision ADCS ? 1.35 : 1)`, clamped to 0.08–0.34. Hits map to `SCAN_MULT = [0.85, 1, 1.15, 1.3]` on that pass's finds. "Auto scan" gives ×1.
- **crisis** (Power): turn-based load shedding over 8 turns. Toggle heaters, recorder, ADCS and transmitter, use the fuel cell, and try to keep findings safe while the battery holds.
- **events** between steps (`EVENTS`): solar storm, wheel failure, leak, DSN outage, budget review, debris warning, asteroid detour (a choice). Each is resolved by design choices such as a rad-hard computer, a spare wheel or extra fuel.

`rankOf(kind, result)` gives each run an S/A/B/C/D stamp ("Superstar!" through "Oof").

## Exploration and science

Each mission has `sites` with discoveries per instrument (`{id, tag, pts, title, why}`) and `clues` (categories). `doPass(site, 'orbit')` uses one pass, rolls finds for the instruments on board, and adds data entries to the recorder. Finds only count in proportion to how much of their data reaches Earth (`findingFrac`). Landing and tag open surface finds. `popFinds()` shows them as flip cards with a rarity (common under 20 pts, rare from 20, epic from 35), and the per-world collection is saved in `ceruvia-dex`.

## Report

Score breakdown, stars, objectives with hints when one is missed (`OBJ_HINTS`), lessons from the log, `analysis()`, "Real missions like yours" (`REAL_MISSIONS` match functions tick the ones the design resembles), the badges earned this mission, the head-to-head table when you're playing a versus challenge, and the leaderboard.

## Fun layer (`fun.js`)

- Music: a procedural chiptune with a C–Am–F–G progression. Calm at 92 bpm in menus and the hangar, action at 132 bpm while flying. `render()` is wrapped to pick the mode, and there's a ♪ toggle in the top bar.
- 18 badges (`BADGES`), shown as a queued pop-up with confetti. They unlock 8 hats (`HATS`, at 1/3/5/8/11/14/18 badges) that appear on the spacecraft.
- Rank stamps, launch combos and discovery cards.
- Versus challenges: `VS.encode` turns `{m, n, s, st, c, sci, d}` into base64url in `?vs=`. The challenge is saved to `ceruvia-vs` and the URL cleaned with `history.replaceState`. Accept / Later / dismiss, and a banner on the title screen and Mission control until it's played.
- Spacecraft moods: `shipMood()` returns happy, worried or panic from the current review, and the eyes and colour change. `PART_QUIPS` and `shipSay()` give a speech bubble when a part is placed.

## How the challenge resources map to features

| Resource | Feature |
|---|---|
| NASA, Design and Develop Science Missions | Science goal first; review grouped into launch, space, ground and user segments; ground station choice |
| JPL Concept Maturity Levels, Goddard Mission Design Lab | Phase bar with CML labels; Compare (trade study) |
| NASA Mission Viz, GMAT, 2023 "Visualize a Space Mission" | ConOps timeline (`conopsHtml`) and trajectory diagram (`trajSvg`) in the review |
| NASA Webb "Build It Yourself" | Each goal shows who uses the data and the ★ Goal parts; "Real missions like yours" |
| CubeSat 101, CSA Digital Games | "Learn more" in the handbook (`RESOURCES`) |

## Voice and text

- Short sentences, plain words, explain jargon the first time it appears ("Max-Q, the point of peak air pressure").
- Ollie is cheerful and a bit cheeky. Reports are encouraging and specific.
- English only (a Space Apps requirement).
