# Mission game build kit

This folder is a **build kit**. It holds no game code yet. Your job is to build, **from scratch in this folder**, a browser game like "Last Signal from Ceruvia": a NASA Space Apps "Space Mission Design Game" where players pick a science goal, build a spacecraft from parts with real trade-offs, pass a launch review, fly arcade versions of each flight phase, do science, and get a report. It has a beginner mode, a fun layer and optional online co-op.

## Read these first, in this order

1. `PROMPT.md`: the full brief and the 11 build steps. **This is the spec.**
2. `GUIDE.md`: the rules that keep the game working, and how to add parts, missions, minigames, screens and buttons.
3. `ARCHITECTURE.md`: the file layout, script order, global state, render loop, actions and the wrapper pattern.
4. `ENGINEERING_MODEL.md`: every formula (mass, rocket equation, power, data, cost, review, scoring).
5. `GAME_DESIGN.md`: the campaign, difficulty, hangar, minigames, beginner mode, fun layer, and how the challenge resources map to features.
6. `DATA_REFERENCE.md`: tuned starting numbers for parts, rockets, buses, difficulties and all five missions.
7. `MULTIPLAYER.md` (step 9), `TESTING.md` (every step), `COMPLIANCE.md` (before finishing).

These docs describe a finished reference game. The names, files and functions in them are a layout to follow, not files that exist here. Write all code fresh.

## How to work

- Start in plan mode. Show the user a plan for all 11 steps and wait for approval.
- Build **one step at a time**. After each step:
  1. Run it in the browser preview, with sound and music muted, before you play anything.
  2. Check the console for errors and check a 375px-wide phone view.
  3. From step 2 on, run the auto-build check in `TESTING.md` (no review blocks, goal met, for every mission and difficulty).
  4. Commit with a message saying what the player gets.
  5. Tell the user what's done and ask before starting the next step.
- Plain HTML, CSS and JavaScript, no build step, no frameworks, no image or audio files (see "Hard constraints" in `PROMPT.md`).
- Put the AI-assistance header from `PROMPT.md` at the top of every JS and CSS file. Keep `COMPLIANCE.md` true as you go.
- If the user asks for a different story, setting or names, keep the structure and change the content in `data.js`.
- For online co-op, build and test `?local` mode first. Real online play needs the user's own Firebase project: walk them through it with the steps in `MULTIPLAYER.md` and `COMPLIANCE.md`, and never make up config values.
- Ask before creating a GitHub repo, pushing, or turning on GitHub Pages.
