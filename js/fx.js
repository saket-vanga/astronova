/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Visual effects, part styles, faces and quips. A plain first version; the full look arrives in build step 7. */
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const FX = { start() {}, confetti() {} };

const CAT_STYLE = {
  'Science':          { color: '#5ee6c8', icon: '🔬' },
  'Power':            { color: '#ffd166', icon: '⚡' },
  'Comms':            { color: '#7cc4ff', icon: '📡' },
  'Avionics':         { color: '#a78bfa', icon: '🧠' },
  'Propulsion':       { color: '#ff9f5a', icon: '🔥' },
  'Landing & return': { color: '#ff8fb8', icon: '🪂' }
};

const FACES = {
  planet: { earth: '🌍', moon: '🌕', asteroid: '🪨', mars: '🔴', ceruvia: '🧊' },
  crew: { vega: '👩🏽‍✈️', hale: '👩🏿‍🔬', ollie: '🧑🏻‍🚀' }
};

const QUIPS = {
  good: ['Textbook!', 'Smooth as a fresh battery.', 'I barely had to cover my eyes.', 'That is going in the training videos.'],
  ok: ['Not pretty, but it counts.', 'We will call that "character building".', 'Close enough for space.'],
  bad: ['Ouch. Every expert has a crash or two.', 'Well, now we know what not to do.', 'The spacecraft forgives you. Mostly.']
};
function quip(kind) { const a = QUIPS[kind] || QUIPS.ok; return a[Math.floor(Math.random() * a.length)]; }
