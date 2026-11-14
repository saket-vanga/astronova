# Online co-op (`js/net.js`)

Two to four players build **one** spacecraft together and fly it. There's no game server. The whole game state is a JSON string in one shared document, and every client renders from it.

## Transports

Both classes share one interface: `init() → uid`, `open(code, name, create)`, `onPlayers/onState/onLive/onPatch(cb)`, `setState/setLive/setPatch(str)`, `rename(name)`, `leave()`.

- **FirebaseTransport**: loads Firebase compat SDK 10.12.2 from gstatic on demand, signs in anonymously with SESSION persistence (each tab is its own player), and uses `rooms/<CODE>/{players, created, state, live, patch}`. `onDisconnect().remove()` cleans up a player who leaves. Room codes are 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L). Errors are friendly: no such room, code taken, room full (4).
- **LocalTransport** (`?local` in the URL): a uid in `sessionStorage`, presence in `localStorage` with a 6-second heartbeat, and messages over `BroadcastChannel('ceruvia-<code>')`. Tabs in one browser act as separate players. `push` must check `if (this.closed) return;`, because posting to a closed channel throws.

Firebase setup (the user does this in their browser; you guide them):

1. Go to https://console.firebase.google.com and create a project (Google Analytics isn't needed).
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Build → Realtime Database → Create database** (any location, start in **locked mode**). Open the **Rules** tab, paste these rules and press **Publish**:

   ```json
   {
     "rules": {
       "rooms": {
         "$code": {
           ".read": "auth != null",
           ".write": "auth != null && $code.matches(/^[A-Z0-9]{5}$/)"
         }
       }
     }
   }
   ```

4. **Project settings (gear icon) → General → Your apps → Web (`</>`)**: register an app (no hosting needed) and copy the `firebaseConfig` object.
5. Paste it into `js/firebase-config.js` as `window.FIREBASE_CONFIG = { ... };`. Online play stays off (only `?local` works) until this file has a config.

The web config values are designed to be public. The rules are what protect the database. Put these same steps in the game's README.

## Roles

`ROLE_ORDER = ['lead', 'prop', 'sci', 'pwr']`. Players are sorted by join time, and role `k` goes to player `k % n`. With two players, each holds two roles.

- `canAct(role)`: true in solo play, or when this player holds that role. Use it to disable controls and in `ACT` guards.
- `waitFor(role)`: "Waiting for <name> (<role>)" text.
- Part categories map to roles through `CAT_ROLE` (Science → sci; Power, Comms, Avionics → pwr; Propulsion, Landing & return → prop). The Lead owns the route, orbit, ground stations, mission choice and the science goal.
- Everyone votes GO in the review (`S.ready[uid]`). Launch only happens when everyone has voted.

## State sync

- `NET.snapshot()` packs `screen, missionId, dlg, build, plan, paint, shipName, run (missions replaced by id), selSite, lastPass, ready, campaign, difficulty, retriesLeft, builds, game (who's piloting), turn, notice`.
- `NET.share()` sends `{by, at, rev, d}` 60 ms after the last change (debounced). It runs automatically because `render` and `refreshHangar` are wrapped at the bottom of net.js. The patch image goes separately with `setPatch`, because it's large.
- `NET.gotState(str)`: ignores its own echoes, sets `applying = true` so the wrapped render doesn't send it straight back, copies the fields into `S`, keeps the local `run` while this player is mid-minigame, and shows `notice` as a toast. A player who isn't piloting sees `screen: 'game'` as `watch`.
- `notify(text)` sets `S.notice`, which shows as a toast on the other devices.

## Turn hand-offs

`runStep(name, ...args)`: if another player owns the step, it sets `S.turn = {id, role, step, args}`, calls `share()` and shows "Handing the controls to …". When the owner receives a state containing a turn it hasn't done yet, it marks the turn done and runs `STEPS[turn.step](...args)` on its own device. The minigame, the events and `onDone` all run there, and the result reaches everyone through the normal state sync.

## Live watching

While piloting, `gameBegin`'s loop calls `NET.sendLive(kind, state, w, h)` at most every 110 ms. It sends every non-function field except big background arrays. Watchers draw a simplified view in `drawWatch()` on the `watch` screen.

## Gotchas found the hard way

- Capture values like `S.selSite` before any async UI (the scan modal), because an incoming state can change `S` while the modal is open.
- Add new screens that should refresh when someone joins or leaves to the list in `gotPlayers`.
- `share()` must check `if (!this.on || !this.t) return;` inside the timeout, because the player may have left during the 60 ms.
- Anything stored only on one device (badges, hats, dex, music) is per player on purpose. Don't put it in the snapshot.
- The leader-only actions (`setGoal`) check `canAct('lead')` in the ACT as well as disabling the button.
