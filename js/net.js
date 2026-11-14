/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Online co-op. Two to four players build ONE spacecraft and fly it together.
   There is no game server: the whole shared game state is a JSON string in one room document,
   and every client renders from it. Two transports share one interface:
     init() -> uid, open(code, name, create), onPlayers/onState/onLive/onPatch(cb),
     setState/setLive/setPatch(str), rename(name), leave()
   - FirebaseTransport: Firebase Realtime Database + anonymous sign-in (needs js/firebase-config.js).
   - LocalTransport (?local in the URL): BroadcastChannel + localStorage, so tabs in one browser act as players. */

const NET_LOCAL = new URLSearchParams(location.search).has('local');
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const ROOM_MAX = 4;

// ---------- local transport (tabs in one browser) ----------
class LocalTransport {
  constructor() { this.cbs = { players() {}, state() {}, live() {}, patch() {} }; this.closed = false; this.lastPlayers = ''; }
  async init() {
    let id = null;
    try { id = sessionStorage.getItem('ceruvia-uid'); if (!id) { id = 'L' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('ceruvia-uid', id); } }
    catch (e) { id = 'L' + Math.random().toString(36).slice(2, 10); }
    this.uid = id; return id;
  }
  key(sfx) { return 'ceruvia-room-' + this.code + (sfx ? '-' + sfx : ''); }
  readRoom() { try { return JSON.parse(localStorage.getItem(this.key()) || 'null'); } catch (e) { return null; } }
  writeRoom(r) { try { localStorage.setItem(this.key(), JSON.stringify(r)); } catch (e) { /* storage full or blocked */ } }
  livePlayers(r) {
    const now = Date.now();
    return Object.entries((r && r.players) || {}).filter(([, p]) => now - p.seen < 15000).map(([uid, p]) => ({ uid, name: p.name, joined: p.joined }));
  }
  async open(code, name, create) {
    this.code = code; this.name = name;
    const r = this.readRoom(), live = this.livePlayers(r);
    if (create && live.length) throw new Error('That room code is already in use. Please try again.');
    if (!create && !live.length) throw new Error('No room with that code. Check the letters and try again.');
    if (!create && live.length >= ROOM_MAX && !live.some(p => p.uid === this.uid)) throw new Error('That room is full (4 players).');
    const room = create ? { created: Date.now(), players: {} } : r;
    room.players = Object.fromEntries(live.map(p => [p.uid, Object.assign({ seen: Date.now() }, room.players[p.uid])]));
    const prev = room.players[this.uid];
    room.players[this.uid] = { name, joined: prev ? prev.joined : Date.now(), seen: Date.now() };
    this.writeRoom(room);
    if (create) { try { localStorage.removeItem(this.key('state')); localStorage.removeItem(this.key('patch')); } catch (e) { /* ignore */ } }
    this.ch = new BroadcastChannel('ceruvia-' + code);
    this.ch.onmessage = e => this.onMsg(e.data);
    this.beat = setInterval(() => this.heartbeat(), 2000);
    this.onStorage = e => { if (e.key === this.key()) this.checkPlayers(); };
    addEventListener('storage', this.onStorage);
    this.push({ type: 'players' });
    setTimeout(() => {
      this.checkPlayers();
      let st = null, pt = null;
      try { st = localStorage.getItem(this.key('state')); pt = localStorage.getItem(this.key('patch')); } catch (e) { /* ignore */ }
      if (st) this.cbs.state(st);
      if (pt) this.cbs.patch(pt);
    }, 0);
  }
  heartbeat() {
    if (this.closed) return;
    const r = this.readRoom() || { created: Date.now(), players: {} };
    r.players = r.players || {};
    const me = r.players[this.uid] || { name: this.name, joined: Date.now() };
    me.seen = Date.now(); me.name = this.name; r.players[this.uid] = me;
    this.writeRoom(r); this.checkPlayers();
  }
  checkPlayers() {
    if (this.closed) return;
    const list = this.livePlayers(this.readRoom()).sort((a, b) => a.joined - b.joined), sig = JSON.stringify(list);
    if (sig !== this.lastPlayers) { this.lastPlayers = sig; this.cbs.players(list); }
  }
  onMsg(m) {
    if (this.closed || !m) return;
    if (m.type === 'players') this.checkPlayers();
    else if (m.type === 'state') this.cbs.state(m.data);
    else if (m.type === 'live') this.cbs.live(m.data);
    else if (m.type === 'patch') this.cbs.patch(m.data);
  }
  push(m) { if (this.closed) return; try { this.ch.postMessage(m); } catch (e) { /* channel closed */ } }
  onPlayers(cb) { this.cbs.players = cb; } onState(cb) { this.cbs.state = cb; } onLive(cb) { this.cbs.live = cb; } onPatch(cb) { this.cbs.patch = cb; }
  setState(s) { try { localStorage.setItem(this.key('state'), s); } catch (e) { /* ignore */ } this.push({ type: 'state', data: s }); }
  setLive(s) { this.push({ type: 'live', data: s }); }
  setPatch(s) { try { localStorage.setItem(this.key('patch'), s); } catch (e) { /* ignore */ } this.push({ type: 'patch', data: s }); }
  rename(n) { this.name = n; this.heartbeat(); this.push({ type: 'players' }); }
  leave() {
    if (this.closed) return;
    const r = this.readRoom();
    if (r && r.players) { delete r.players[this.uid]; this.writeRoom(r); }
    this.push({ type: 'players' });
    this.closed = true;
    clearInterval(this.beat); removeEventListener('storage', this.onStorage);
    try { this.ch.close(); } catch (e) { /* ignore */ }
  }
}

// ---------- Firebase transport (real online play) ----------
class FirebaseTransport {
  constructor() { this.cbs = { players() {}, state() {}, live() {}, patch() {} }; this.refs = []; }
  loadSdk() {
    if (window.firebase && firebase.database) return Promise.resolve();
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    return ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js'].reduce((p, f) => p.then(() => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = base + f; s.onload = res;
      s.onerror = () => rej(new Error('Could not reach the online service. Check your internet connection.'));
      document.head.appendChild(s);
    })), Promise.resolve());
  }
  async init() {
    await this.loadSdk();
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);   // each tab is its own player
    const user = auth.currentUser || (await auth.signInAnonymously()).user;
    this.uid = user.uid; this.db = firebase.database();
    return this.uid;
  }
  async open(code, name, create) {
    this.code = code; this.room = this.db.ref('rooms/' + code);
    const v = (await this.room.once('value')).val(), players = v && v.players ? Object.keys(v.players) : [];
    if (create && players.length) throw new Error('That room code is already in use. Please try again.');
    if (!create && !players.length) throw new Error('No room with that code. Check the letters and try again.');
    if (!create && players.length >= ROOM_MAX && !players.includes(this.uid)) throw new Error('That room is full (4 players).');
    if (create) await this.room.set({ created: firebase.database.ServerValue.TIMESTAMP });
    this.me = this.room.child('players/' + this.uid);
    await this.me.set({ name, joined: firebase.database.ServerValue.TIMESTAMP });
    this.me.onDisconnect().remove();
    const on = (path, fn) => { const r = this.room.child(path); r.on('value', s => fn(s.val())); this.refs.push(r); };
    on('players', pv => this.cbs.players(Object.entries(pv || {}).map(([uid, p]) => ({ uid, name: p.name, joined: p.joined || 0 })).sort((a, b) => a.joined - b.joined)));
    on('state', sv => { if (sv) this.cbs.state(sv); });
    on('live', lv => { if (lv) this.cbs.live(lv); });
    on('patch', pv => { if (pv) this.cbs.patch(pv); });
  }
  onPlayers(cb) { this.cbs.players = cb; } onState(cb) { this.cbs.state = cb; } onLive(cb) { this.cbs.live = cb; } onPatch(cb) { this.cbs.patch = cb; }
  setState(s) { if (this.room) this.room.child('state').set(s); }
  setLive(s) { if (this.room) this.room.child('live').set(s); }
  setPatch(s) { if (this.room) this.room.child('patch').set(s); }
  rename(n) { if (this.me) this.me.child('name').set(n); }
  leave() {
    this.refs.forEach(r => r.off()); this.refs = [];
    if (this.me) { this.me.onDisconnect().cancel(); this.me.remove(); this.me = null; }
  }
}

// ---------- NET: sharing the game ----------
const NET = {
  on: false, t: null, code: '', applying: false, rev: 0, timer: 0, lastLive: 0, lastNotice: null, turnsDone: new Set(), busy: false,
  available() { return NET_LOCAL || !!window.FIREBASE_CONFIG; },
  makeCode() { let c = ''; for (let i = 0; i < 5; i++) c += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]; return c; },
  async start(create, code) {
    if (this.busy) return;
    const name = (S.myName || '').trim();
    if (!name) { S.netError = 'Type a nickname first.'; rerender(); return; }
    this.busy = true; S.netError = ''; S.netBusy = true; rerender();
    try {
      const t = NET_LOCAL ? new LocalTransport() : new FirebaseTransport();
      S.uid = await t.init();
      t.onPlayers(list => this.gotPlayers(list));
      t.onState(str => this.gotState(str));
      t.onLive(str => this.gotLive(str));
      t.onPatch(str => this.gotPatch(str));
      let tries = create ? 4 : 1;
      while (tries--) {
        const c = create ? this.makeCode() : code;
        try { await t.open(c, name, create); this.code = c; break; }
        catch (e) { if (!create || !tries || !/in use/.test(e.message)) throw e; }
      }
      this.t = t; this.on = true;
      S.mode = 'online'; S.joinCode = this.code; S.players = [{ uid: S.uid, name, joined: Date.now() }];
      S.netBusy = false; this.busy = false;
      if (create) { S.screen = 'lobby'; render(); this.share(); }
      else { if (S.screen === 'online') go('lobby'); }
    } catch (e) {
      this.busy = false; S.netBusy = false;
      S.netError = e && e.message ? e.message : 'Could not connect.';
      if (this.t) { try { this.t.leave(); } catch (err) { /* ignore */ } }
      this.t = null; this.on = false; S.mode = 'solo';
      rerender();
    }
  },
  leave() {
    if (this.t) { try { this.t.leave(); } catch (e) { /* ignore */ } }
    this.t = null; this.on = false; this.code = ''; this.turnsDone.clear();
    S.mode = 'solo'; S.players = []; S.turn = null; S.notice = null; S.ready = {}; S.watch = null; S.watchGame = null;
    S.run = null; S.game = null; S.mission = null;
    S.campaign = { done: {}, unlocked: 1 }; S.builds = {};
    loadCampaign();   // back to this player's own solo progress
  },
  // The shared part of the state. Things kept only on one device (badges, hats, dex, music) are left out on purpose.
  snapshot() {
    const watching = S.screen === 'watch';
    const game = S.game ? { kind: S.game.kind, phase: S.game.phase, by: S.uid, result: S.game.result, opts: S.game.opts } : watching ? S.watchGame : null;
    return { screen: watching ? 'game' : S.screen, missionId: S.mission ? S.mission.id : null, dlg: S.dlg, build: S.build, plan: S.plan,
      paint: S.paint, shipName: S.shipName, run: S.run, selSite: S.selSite, lastPass: S.lastPass, ready: S.ready,
      campaign: S.campaign, difficulty: S.difficulty, retriesLeft: S.retriesLeft, builds: S.builds, game, turn: S.turn, notice: S.notice };
  },
  share() {
    if (!this.on || !this.t) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.on || !this.t) return;       // the player may have left during the wait
      this.rev++;
      this.t.setState(JSON.stringify({ by: S.uid, at: Date.now(), rev: this.rev, d: this.snapshot() }));
    }, 60);
  },
  notify(text) { if (!this.on) return; S.notice = { id: S.uid + ':' + Date.now(), text }; this.share(); },
  gotState(str) {
    let msg; try { msg = JSON.parse(str); } catch (e) { return; }
    if (!msg || !msg.d || msg.by === S.uid) return;          // ignore our own echoes
    const d = msg.d, piloting = !!S.game;                   // S.game exists only on the device flying a minigame
    this.applying = true;
    try {
      S.mission = MISSIONS.find(m => m.id === d.missionId) || null;
      S.dlg = d.dlg || 0; S.build = d.build; S.plan = d.plan; S.paint = d.paint || 'white'; S.shipName = d.shipName || '';
      S.selSite = d.selSite; S.lastPass = d.lastPass; S.ready = d.ready || {};
      if (d.campaign) S.campaign = d.campaign;
      if (DIFF[d.difficulty]) S.difficulty = d.difficulty;
      S.retriesLeft = d.retriesLeft; S.builds = d.builds || {}; S.turn = d.turn || null;
      if (!piloting) {
        S.run = d.run;
        if (S.run && S.run.c && S.run.c.budget == null) { S.run.c.budget = Infinity; S.run.c.budgetLeft = Infinity; }   // JSON has no Infinity
      }
      let screen = d.screen;
      const oldPhase = S.watchGame && S.watchGame.phase;
      if (screen === 'game' && !piloting) { S.watchGame = d.game; screen = 'watch'; }
      if (piloting) renderTopbar();                     // never redraw a minigame that is being flown here
      else if (screen === 'hangar' && S.screen === 'hangar') refreshHangar(S.hangarTab !== 'build');
      else if (screen !== S.screen) { stopAnim(); S.screen = screen; render(); window.scrollTo({ top: 0 }); }
      else if (screen === 'watch') { if ((S.watchGame && S.watchGame.phase) !== oldPhase) { stopAnim(); render(); } else renderTopbar(); }
      else rerender();
    } finally { this.applying = false; }
    if (d.notice && d.notice.id !== this.lastNotice) { this.lastNotice = d.notice.id; if (!d.notice.id.startsWith(S.uid + ':')) toast(d.notice.text); }
    // A turn handed to us: run that step on this device.
    const t = d.turn;
    if (t && !this.turnsDone.has(t.id) && STEPS[t.step] && canAct(t.role)) {
      this.turnsDone.add(t.id);
      S.turn = null;
      setTimeout(() => { toast('Your turn: ' + (GAMES[STEP_GAME[t.step]] ? GAMES[STEP_GAME[t.step]].title : t.step) + '!'); STEPS[t.step](...(t.args || [])); }, 0);
    }
  },
  gotPlayers(list) {
    const before = JSON.stringify(S.players.map(p => p.uid));
    S.players = list.length ? list : [{ uid: S.uid, name: S.myName, joined: Date.now() }];
    if (JSON.stringify(S.players.map(p => p.uid)) !== before) {
      if (['online', 'lobby', 'map', 'setup', 'briefing', 'goal', 'hangar', 'review', 'explore', 'crisis', 'report', 'transit'].includes(S.screen)) {
        this.applying = true; try { S.screen === 'hangar' ? refreshHangar(true) : rerender(); } finally { this.applying = false; }
      } else renderTopbar();
    }
  },
  // While piloting, stream the minigame state to the watchers (at most every 110 ms).
  sendLive(kind, state, w, h) {
    if (!this.on || !this.t) return;
    const now = performance.now();
    if (now - this.lastLive < 110) return;
    this.lastLive = now;
    this.t.setLive(JSON.stringify({ by: S.uid, kind, w, h, s: state }, (k, v) => k === 'stars' || k === 'clouds' ? undefined : v));
  },
  gotLive(str) {
    let msg; try { msg = JSON.parse(str); } catch (e) { return; }
    if (!msg || msg.by === S.uid) return;
    S.watch = msg;
  },
  gotPatch(str) {
    if (!str || str === S.patch) return;
    S.patch = str;
    if (S.screen === 'hangar' && S.hangarTab === 'build') { this.applying = true; try { refreshHangar(); } finally { this.applying = false; } }
  }
};
const STEP_GAME = { doLaunch: 'launch', doCruise: 'dodge', doInsertion: 'insertion', doLanding: 'landing', doTag: 'tag', doReentry: 'reentry' };
addEventListener('pagehide', () => { if (NET.on) NET.leave(); });

// ---------- wrappers that broadcast every change ----------
const _render = render;
render = function (...a) { const r = _render.apply(this, a); if (NET.on && !NET.applying) NET.share(); return r; };
const _refreshHangar = refreshHangar;
refreshHangar = function (...a) { const r = _refreshHangar.apply(this, a); if (NET.on && !NET.applying) NET.share(); return r; };
const _savePatch = savePatch;
savePatch = function (...a) { const r = _savePatch.apply(this, a); if (NET.on && !NET.applying && S.patch && NET.t) NET.t.setPatch(S.patch); return r; };
// Co-op progress lives in the room, so it never overwrites a player's own solo save.
const net_saveCampaign = saveCampaign;
saveCampaign = function (...a) { if (NET.on) return; return net_saveCampaign.apply(this, a); };
// Short notes so the crew knows what happened on someone else's device.
const net_eventOutcome = eventOutcome;
eventOutcome = function (ev, res, ...rest) { const r = net_eventOutcome.call(this, ev, res, ...rest); NET.notify(`${ev.icon} ${ev.title}: ${res.good ? 'handled' : 'trouble'}. ${res.text}`); return r; };
const net_gameEnd = gameEnd;
gameEnd = function (...a) {
  const g = S.game, r = net_gameEnd.apply(this, a);
  if (g && g.result) NET.notify(`${S.myName || 'Pilot'} finished the ${GAMES[g.kind].title.toLowerCase()}: ${g.result.score}/100.`);
  return r;
};
const net_doPass = doPass;
doPass = function (...a) {
  const before = S.run ? S.run.finds.length : 0, r = net_doPass.apply(this, a);
  const found = S.run ? S.run.finds.slice(before) : [];
  if (found.length) NET.notify('🔭 New discoveries: ' + found.map(f => f.title).join(', ') + '.');
  return r;
};
const net_startRun = startRun;
startRun = function (...a) { S.ready = {}; return net_startRun.apply(this, a); };

// Lead-only choices are checked in the ACT as well as disabling the button.
const net_pickMission = ACT.pickMission;
ACT.pickMission = function (...a) { if (NET.on && !canAct('lead')) { toast(waitFor('lead') + ' to choose the mission.'); return; } return net_pickMission.apply(this, a); };
const net_setDiff = ACT.setDiff;
ACT.setDiff = function (...a) { if (NET.on && !canAct('lead')) { toast(waitFor('lead') + ' to set the difficulty.'); return; } return net_setDiff.apply(this, a); };

// ---------- GO vote in the review ----------
function allReady() { return S.players.length > 0 && S.players.every(p => S.ready[p.uid]); }
const net_launch = ACT.launch;
ACT.launch = function (...a) { if (!NET.on) return net_launch.apply(this, a); ACT.vote(); };
ACT.vote = () => {
  const c = C();
  if (review(S.build, S.plan, S.mission, c).some(i => i.level === 'block')) { SFX.deny(); toast('Fix the red items first.'); return; }
  S.ready = Object.assign({}, S.ready, { [S.uid]: !S.ready[S.uid] });
  if (allReady()) { NET.notify('Everyone voted GO. Launching!'); startRun(); }
  else rerender();
};
const net_reviewHtml = SCREENS.review.html;
SCREENS.review.html = function (...a) {
  const h = net_reviewHtml.apply(this, a);
  if (!NET.on) return h;
  const blocks = review(S.build, S.plan, S.mission, C()).some(i => i.level === 'block'), mine = !!S.ready[S.uid];
  const votes = `<div class="card vote"><h3>🗳️ Launch vote</h3><p class="small muted">Real flight directors poll every team before launch: "GO" or "NO GO". Everyone must vote GO.</p>
    <ul class="votes">${S.players.map(p => `<li class="${S.ready[p.uid] ? 'go' : ''}">${S.ready[p.uid] ? '✅' : '⏳'} ${esc(p.name)}${p.uid === S.uid ? ' (you)' : ''} <span class="small muted">${rolesOf(p.uid).map(r => ROLES[r].icon).join('')}</span></li>`).join('')}</ul>
    <div class="row end"><button class="btn ${mine ? 'ghost' : 'primary'} big" data-act="vote"${blocks ? ' disabled' : ''}>${mine ? 'Change to NO GO' : '✅ Vote GO'}</button></div></div>`;
  return h.replace(/<button class="btn primary big" data-act="launch"[^>]*>🚀 Launch!<\/button>/, '').replace('<div class="row between wrap"><button class="btn ghost" data-act="toHangar">', votes + '<div class="row between wrap"><button class="btn ghost" data-act="toHangar">');
};

// ---------- screens: online, lobby, watch ----------
function rolesOf(uid) { return ROLE_ORDER.filter(r => { const o = ownerOf(r); return o && o.uid === uid; }); }
SCREENS.online = {
  html() {
    if (!NET.available()) return `<div class="narrow"><div class="card"><div class="eyebrow">Co-op</div><h2>👥 Play together</h2>
      <p>Online play is not switched on for this copy of the game yet. Whoever runs it needs to add their own free Firebase project (see "Online co-op setup" in the README).</p>
      <p>You can still try co-op on one computer: open <a href="?local">this page with ?local</a> in two browser tabs. Each tab is a player.</p>
      <div class="row end"><button class="btn ghost" data-act="home">← Back</button></div></div></div>`;
    return `<div class="narrow"><div class="card"><div class="eyebrow">Co-op${NET_LOCAL ? ' · local test mode' : ''}</div><h2>👥 Play together</h2>
      <p>Two to four players build one spacecraft and fly it together. Each player gets a role: Mission Lead, Propulsion, Science, and Power &amp; Comms.</p>
      <label class="field"><span>Nickname</span><input type="text" maxlength="16" value="${esc(S.myName)}" data-input="myName" placeholder="e.g. Comet Kid" autocomplete="off" spellcheck="false">
        <span class="small muted">Your crew sees this. Please don't use your real name.</span></label>
      ${S.netError ? `<p class="neterr">⚠️ ${esc(S.netError)}</p>` : ''}
      <div class="online-grid">
        <div><h3>Start a new room</h3><p class="small muted">You get a 5-letter code to share.</p><button class="btn primary big" data-act="netCreate"${S.netBusy ? ' disabled' : ''}>${S.netBusy ? 'Connecting…' : 'Create room'}</button></div>
        <div><h3>Join a room</h3><div class="row gap"><input type="text" class="codein" maxlength="5" value="${esc(S.joinCode || '')}" data-input="joinCode" placeholder="ABCDE" aria-label="Room code" autocomplete="off" spellcheck="false">
          <button class="btn ghost" data-act="netJoin"${S.netBusy ? ' disabled' : ''}>Join</button></div></div>
      </div>
      ${NET_LOCAL ? '<p class="small muted">Local test mode: open this same address in another tab to add a player.</p>' : '<p class="small muted">No account needed. Only your nickname is shared, and the room disappears when everyone leaves.</p>'}
      <div class="row end"><button class="btn ghost" data-act="home">← Back</button></div></div></div>`;
  }
};
SCREENS.lobby = {
  html() {
    const rows = S.players.map((p, i) => `<li><b>${esc(p.name)}</b>${p.uid === S.uid ? ' <span class="pill">you</span>' : ''}${i === 0 ? ' <span class="pill">host</span>' : ''}
      <span class="roles">${rolesOf(p.uid).map(r => `<span class="role-tag r-${r}">${ROLES[r].icon} ${ROLES[r].name}</span>`).join('')}</span></li>`).join('');
    return `<div class="narrow"><div class="card lobby"><div class="eyebrow">Room code</div><div class="roomcode mono">${esc(NET.code)}</div>
      <p class="small muted">${NET_LOCAL ? 'Open this address in another tab and join with this code.' : 'Tell your crew to choose "Play together" and enter this code.'}</p>
      <h3>👩‍🚀 Crew (${S.players.length}/${ROOM_MAX})</h3><ul class="crew">${rows}</ul>
      <div class="rolehelp">${ROLE_ORDER.map(r => `<p class="small"><span class="role-tag r-${r}">${ROLES[r].icon} ${ROLES[r].name}</span> ${esc(ROLES[r].desc)}</p>`).join('')}</div>
      <p class="small muted">Roles go round in join order. With fewer than four players, some of you hold two roles.</p>
      <div class="row between wrap"><button class="btn ghost" data-act="netLeave">Leave room</button><button class="btn primary big" data-act="netStart">To Mission control →</button></div></div></div>`;
  }
};
const WATCH_CACHE = {};
SCREENS.watch = {
  html() {
    const g = S.watchGame, G = g && GAMES[g.kind];
    if (!g || !G) return `<div class="card game-card"><h2>📺 Watching</h2><p>Waiting for the pilot…</p></div>`;
    const pilot = S.players.find(p => p.uid === g.by);
    const head = `<div class="eyebrow">Live · ${esc(pilot ? pilot.name : 'A crewmate')} is flying</div><h2>${G.icon} ${G.title}</h2>`;
    if (g.phase === 'done' && g.result) { const v = G.verdict(g.result); return `<div class="card game-card">${head}<div class="verdict ${v.good}"><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p><p class="mono">Score ${g.result.score}/100</p></div><p class="small muted">Waiting for the crew to carry on…</p></div>`; }
    return `<div class="game-wrap">${head}<div class="ghud" id="ghud">Waiting for the first picture…</div><div class="gcanvas"><canvas id="gcv" aria-label="Live view"></canvas></div>
      <p class="small muted center">You are watching live. ${esc(ROLES[G.role].name)} has the controls.</p></div>`;
  },
  after() {
    const cv = document.getElementById('gcv'); if (!cv) return;
    const w = Math.floor(cv.parentElement.clientWidth), h = Math.floor(w < 600 ? clamp(innerHeight - 330, 300, w * 1.3) : clamp(w * 0.58, 320, innerHeight - 260));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'), hud = document.getElementById('ghud');
    const frame = () => {
      if (S.screen !== 'watch') return;
      const L = S.watch;
      if (L && GAMES[L.kind] && GAMES[L.kind].draw) {
        const G = GAMES[L.kind], s = L.s;
        if (!WATCH_CACHE[L.kind]) WATCH_CACHE[L.kind] = G.init(s.o || {}, L.w, L.h);
        if (!s.stars) s.stars = WATCH_CACHE[L.kind].stars;
        if (!s.clouds && WATCH_CACHE[L.kind].clouds) s.clouds = WATCH_CACHE[L.kind].clouds;
        try {
          ctx.setTransform(dpr * w / L.w, 0, 0, dpr * h / L.h, 0, 0);
          G.draw(ctx, s, L.w, L.h);
          hud.innerHTML = G.hud(s);
        } catch (e) { /* a partial frame; the next one will do */ }
      }
      S.anim = requestAnimationFrame(frame);
    };
    S.anim = requestAnimationFrame(frame);
  }
};

// ---------- actions, inputs and entry points ----------
ACT.toOnline = () => { S.netError = ''; go('online'); };
ACT.netCreate = () => NET.start(true);
ACT.netJoin = () => { const c = (S.joinCode || '').toUpperCase(); if (c.length !== 5) { S.netError = 'Room codes have 5 letters.'; rerender(); return; } NET.start(false, c); };
ACT.netLeave = () => { NET.leave(); go('title'); toast('You left the room.'); };
ACT.netStart = () => go('map');
ACT.copyRoom = () => { if (navigator.clipboard) navigator.clipboard.writeText(NET.code).then(() => toast('Code copied!'), () => {}); };
INPUT.joinCode = (v, el) => { S.joinCode = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); if (el.value !== S.joinCode) el.value = S.joinCode; };
const net_myName = INPUT.myName;
INPUT.myName = function (v, el, done) { net_myName.apply(this, arguments); if (NET.on && done && NET.t) NET.t.rename(S.myName); };

const net_titleHtml = SCREENS.title.html;
SCREENS.title.html = function (...a) {
  const h = net_titleHtml.apply(this, a);
  return h.replace('<button class="btn ghost" data-act="openHandbook">How to play</button>',
    `${NET.on ? `<button class="btn primary" data-act="netStart">Back to the crew (${esc(NET.code)})</button>` : '<button class="btn ghost" data-act="toOnline">👥 Play together</button>'}<button class="btn ghost" data-act="openHandbook">How to play</button>`);
};
const net_renderTopbar = renderTopbar;
renderTopbar = function (...a) {
  const r = net_renderTopbar.apply(this, a);
  if (NET.on) {
    const tb = document.getElementById('topbar'), grow = tb && tb.querySelector('.grow');
    if (grow) grow.insertAdjacentHTML('afterend', `<span class="roomchip" title="Room ${esc(NET.code)}: ${S.players.length} players">👥 <b class="mono">${esc(NET.code)}</b> <span class="rl">${rolesOf(S.uid).map(x => ROLES[x].icon).join('')}</span></span>
      <button class="btn small ghost" data-act="netLeave" aria-label="Leave the room"><span class="lbl">Leave</span><span class="ico" aria-hidden="true">🚪</span></button>`);
  }
  return r;
};

// Opening the game with ?local goes straight to co-op.
if (NET_LOCAL && S.screen === 'title') { S.screen = 'online'; }
