/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Flight phases. This is a stand-in with the final interface (startGame / gameBegin / gameEnd):
   each phase is "flown" by an autopilot whose result depends on the design and difficulty.
   The real arcade minigames replace it in build step 5. */

const GAMES = {
  launch:    { title: 'Launch', icon: '🚀', how: 'Follow the gravity-turn line and ease off the throttle through Max-Q, the point of peak air pressure.' },
  dodge:     { title: 'Cruise', icon: '☄️', how: 'Dodge debris on the way and collect star fixes for navigation.' },
  insertion: { title: 'Orbit insertion', icon: '🎯', how: 'Burn the engine to brake, and stop exactly on the line.' },
  landing:   { title: 'Landing', icon: '🛬', how: 'Bring the lander down gently on the pad.' },
  tag:       { title: 'Touch-and-go', icon: '🦾', how: 'Touch the surface for three seconds, grab a sample and back away.' },
  reentry:   { title: 'Reentry', icon: '🔥', how: 'Hold the capsule in the corridor between burning up and skipping off, then open the parachute.' }
};

function startGame(kind, opts, onDone) {
  S.game = { kind, opts: opts || {}, onDone, state: null, phase: 'intro', result: null };
  go('game');
}
function gameBegin() {
  if (!S.game) return;
  S.game.state = { t: 0 };
  S.game.phase = 'play';
  gameEnd(autopilot(S.game.kind, S.game.opts));
}

// Autopilot: a better design and an easier difficulty give better odds.
function autopilot(kind, o) {
  const skill = Math.min(1, 0.45 + 0.25 * (o.tol || 1) + 0.15 * (o.agility || 1) - 0.4 * Math.max(0, o.heavy || 0)) * (0.7 + Math.random() * 0.3);
  const score = Math.round(Math.max(5, Math.min(100, skill * 100)));
  switch (kind) {
    case 'launch': return { score, ok: true, acc: skill, overloads: skill > 0.6 ? 0 : 1 };
    case 'dodge': {
      const hits = Math.max(0, Math.round((1 - skill) * 5 * (o.span || 1) * (o.hazard || 0)));
      return { score, ok: true, hits, fixes: Math.round(skill * 6) };
    }
    case 'insertion': return { score, ok: true, err: Math.round((1 - skill) * 30) / 100 };
    case 'landing': { const outcome = skill > 0.55 ? 'pad' : skill > 0.35 ? 'off' : 'crash'; return { score: outcome === 'crash' ? 0 : score, ok: outcome !== 'crash', outcome }; }
    case 'tag': { const ok = skill > 0.4; return { score: ok ? score : 0, ok }; }
    case 'reentry': { const ok = skill > 0.35; return { score: ok ? score : 0, ok }; }
  }
  return { score, ok: true };
}

function gameVerdict(kind, r) {
  const g = r.ok && r.score >= 70 ? 'good' : r.ok ? 'ok' : 'bad';
  const text = {
    launch: `You followed the line with ${Math.round(r.acc * 100)}% accuracy${r.overloads ? ' and overloaded the rocket once at Max-Q' : ''}.`,
    dodge: `${r.hits ? r.hits + ' debris hit' + (r.hits > 1 ? 's' : '') : 'No debris hits'} and ${r.fixes} star fixes collected.`,
    insertion: r.err < 0.08 ? 'Right on the line. Almost no fuel wasted.' : `You missed the line by ${Math.round(r.err * 100)}%, which cost extra fuel.`,
    landing: { pad: 'Down safely on the pad.', off: 'Down safely, but off the pad.', crash: 'The lander hit too hard and broke.' }[r.outcome],
    tag: r.ok ? 'Touch, grab, back away. Sample collected!' : 'The arm missed. No sample this time.',
    reentry: r.ok ? 'The heat shield held and the parachute opened. The capsule is down!' : 'The capsule came in at the wrong angle and was lost.'
  }[kind] || '';
  return { good: g, title: { good: 'Great flying!', ok: 'Made it', bad: 'Ouch' }[g], text };
}

function gameEnd(result) {
  if (!S.game) return;
  S.game.result = result;
  S.game.phase = 'done';
  stopAnim();
  rerender();
}

const SCREENS_GAME = {
  html() {
    const g = S.game;
    if (!g) return '<p>No flight in progress.</p>';
    const G = GAMES[g.kind];
    let body;
    if (g.phase !== 'done') {
      body = `<p>${G.how}</p><p class="small muted">The real arcade version of this phase arrives in a later build step. For now the autopilot flies it, using your design and difficulty.</p>
        <button class="btn primary big" data-act="gameGo">Fly it ▶</button>`;
    } else {
      const v = gameVerdict(g.kind, g.result), canRetry = g.result.score < 70 && S.retriesLeft > 0 && g.opts.retry;
      body = `<div class="verdict ${v.good}"><h3>${v.title}</h3><p>${v.text}</p><p class="mono">Score ${g.result.score}/100</p>
        <p class="small muted">Ollie: “${quip(v.good)}”</p>${g.opts.lesson ? `<p class="small">${esc(g.opts.lesson(g.result))}</p>` : ''}</div>
        <div class="row gap wrap">${canRetry ? `<button class="btn ghost" data-act="gameRetry">Retry (${S.retriesLeft} left)</button>` : ''}
        <button class="btn primary" data-act="gameDone">Continue →</button></div>`;
    }
    return `<div class="card game-card"><div class="eyebrow">Mission ${S.mission.num} · ${esc(S.mission.name)}</div><h2>${G.icon} ${G.title}</h2>${body}</div>`;
  }
};
