/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* Sound. This is a silent stand-in with the final interface; real synthesized sound arrives in build step 8. */
const SFX = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  let muted = get('ceruvia-muted') === '1';
  let musicOn = get('ceruvia-music') !== '0';
  const noop = () => {};
  return {
    get muted() { return muted; },
    get musicOn() { return musicOn; },
    toggle() { muted = !muted; set('ceruvia-muted', muted ? '1' : '0'); return muted; },
    toggleMusic() { musicOn = !musicOn; set('ceruvia-music', musicOn ? '1' : '0'); return musicOn; },
    unlock: noop, music: noop, rumbleStart: noop, rumbleStop: noop,
    click: noop, place: noop, deny: noop, win: noop, lose: noop, blip: noop, stage: noop
  };
})();
