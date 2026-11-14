# Testing

There are no unit tests. Testing means driving the real game in a browser and checking state with JavaScript. Every feature in the reference game was checked this way before it was committed.

## Start it

- Create `.claude/launch.json` with a config that runs `python3 -m http.server 8766` in this folder, then use `preview_start` in the desktop app. Or run `python3 -m http.server 8766` yourself.
- Open `http://localhost:8766/`. Add `?local` for co-op with tabs in the same browser.
- Once it's on GitHub Pages, test the live URL too (give it about a minute after a push, and hard reload).

## Mute first, every tab, every origin

```js
if (!SFX.muted) SFX.toggle(); if (SFX.musicOn) SFX.toggleMusic(); SFX.rumbleStop();
```

`localStorage.clear()` turns sound back on. Re-run that line afterwards, or set `localStorage['ceruvia-muted']='1'` and `localStorage['ceruvia-music']='0'` before reloading. Localhost and github.io keep separate storage.

## Fresh start without stale files

```js
localStorage.clear(); localStorage.setItem('ceruvia-muted','1'); localStorage.setItem('ceruvia-music','0');
await Promise.all(['js/fun.js','js/game.js','style.css'].map(f => fetch(f, {cache:'reload'})));
location.reload();
```

## Useful console snippets

Jump straight to a mission's hangar:
```js
S.difficulty = 'rookie'; prepareMission(MISSIONS[2]); S.plan.goal = S.mission.objectives[0].id; go('hangar');
```

Auto-build check across every mission and difficulty (should print no blocks and goal ✓):
```js
for (const dk of ['rookie','engineer']) for (const m of MISSIONS) {
  S.difficulty = dk; prepareMission(m);
  for (const o of m.objectives) { S.plan.goal = o.id; const r = recommendBuild(m);
    if (!r) { console.log(dk, m.id, o.id, 'NO DESIGN FITS'); continue; }
    S.build = r.build; S.plan = { ...r.plan, goal: o.id, ground: r.plan.ground || 'network' }; const c = C();
    const blocks = review(S.build, S.plan, m, c).filter(i => i.level === 'block').map(i => i.title);
    const adv = dk === 'rookie' && allParts(S.build).some(id => ADVANCED.includes(id));
    console.log(dk, m.id, o.id, blocks.length ? blocks : 'ok', goalStatus(S.build, S.plan, m, o.id).ok ? 'goal✓' : 'goal✗', adv ? 'ADV!' : ''); }
}
```

Finish a minigame instantly with a given result (after `gameBegin()` so the state exists):
```js
gameEnd({ acc: 0.95, overloads: 0 });  // launch; check GAMES[kind].verdict for each game's fields
```

## Things that will fool you

- **Hidden tabs pause `requestAnimationFrame`.** Minigames and the tour stop running when the pane or tab is in the background. Bring the tab to the front, or drive the clock by hand (for example by overriding `performance.now` for the scan game).
- **Screenshots right after `location.reload()` can show the old page.** Wait, then read the page again.
- **Faking `gameEnd` without `gameBegin`** leaves `S.game.state` null, and later code fails. Start the game first.
- **Event modals:** click their buttons (`modalNext` or the choice buttons). Closing the modal some other way drops the chain callback, and the mission stalls.
- **Mobile:** use `resize_window` with the mobile preset (375×812) and check for horizontal scroll: `document.documentElement.scrollWidth > innerWidth`.

## Co-op test recipe (`?local`)

1. Tab A: `http://localhost:8766/?local` → Play online → nickname → Create. Note the code.
2. Tab B: same URL → nickname → Join with the code. Mute both.
3. Check roles in the lobby. A starts the game. Choose a mission: only the Lead can set the goal.
4. Place a part in each tab. The other tab should update, and role locks should block parts outside your categories.
5. Both vote GO, then launch. The Propulsion player's tab flies the launch and the other shows `watch`.
6. Carry on through explore (scan passes sync), crisis, report, badges.
7. Leave from one tab. The other sees the crew shrink and roles get shared out again.

On the live site, repeat steps 1–5 with two tabs on the live GitHub Pages URL (without `?local`) to check Firebase.

## Before committing

- No console errors on the title, hangar, review, a minigame, explore and report (`read_console_messages` with `onlyErrors`).
- The auto-build check passes.
- Mobile width works with no horizontal scroll.
- Co-op still syncs, if you touched `S`, render, ACTs or screens.
