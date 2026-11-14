/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */

/* All sound is synthesized with the Web Audio API: no audio files.
   SFX.muted silences effects; SFX.musicOn controls the procedural chiptune. Both are saved. */
const SFX = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  let muted = get('ceruvia-muted') === '1';
  let musicOn = get('ceruvia-music') !== '0';
  let ctx = null, master = null, fxBus = null, musicBus = null, noiseBuf = null, rumbleNode = null;
  let mode = null, timer = 0, step = 0, nextTime = 0;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    fxBus = ctx.createGain(); fxBus.gain.value = muted ? 0 : 0.55; fxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (mode && musicOn) startMusic();
  }
  // One note: an oscillator with a quick attack and exponential decay. `slide` glides the pitch.
  function tone(freq, dur, type, vol, when, slide, bus) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || fxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, cutoff, when, bus, kind) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = kind || 'lowpass'; f.frequency.value = cutoff || 2000;
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || fxBus); s.start(t); s.stop(t + dur + 0.02);
  }

  // ---------- procedural chiptune: C – Am – F – G ----------
  const N = n => 440 * Math.pow(2, (n - 69) / 12);          // MIDI note to Hz
  const CHORDS = [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]];
  const MELODY = [[72, 0, 76, 0, 79, 0, 76, 74], [72, 0, 69, 0, 72, 74, 76, 0], [77, 0, 76, 0, 72, 0, 69, 0], [71, 0, 74, 0, 79, 77, 74, 0]];
  const STYLE = { calm: { bpm: 92, drums: false, melody: 0.5 }, action: { bpm: 132, drums: true, melody: 1 } };
  function scheduleStep(i, t) {
    const st = STYLE[mode], bar = Math.floor(i / 16) % 4, s = i % 16, ch = CHORDS[bar], sixteenth = 60 / st.bpm / 4, when = t - ctx.currentTime;
    if (s % 4 === 0) tone(N(ch[0] - 12), sixteenth * (st.drums ? 3 : 7), 'triangle', 0.5, when, null, musicBus);   // bass
    if (s % 2 === 0) tone(N(ch[(s / 2) % 4] + 12), sixteenth * 1.6, 'square', 0.07, when, null, musicBus);       // arpeggio
    const mel = MELODY[bar][s / 2];
    if (s % 2 === 0 && mel && (st.melody === 1 || (Math.floor(i / 64) % 2 === 1))) tone(N(mel), sixteenth * 2.6, 'square', 0.09 * st.melody + 0.03, when, null, musicBus);
    if (st.drums) {
      if (s % 8 === 0) tone(150, 0.16, 'sine', 0.8, when, 45, musicBus);                       // kick
      if (s % 8 === 4) noise(0.12, 0.35, 3000, when, musicBus, 'bandpass');                    // snare
      if (s % 2 === 0) noise(0.04, 0.12, 8000, when, musicBus, 'highpass');                    // hi-hat
    }
  }
  function tick() {
    if (!ctx || !mode) return;
    const sixteenth = 60 / STYLE[mode].bpm / 4;
    while (nextTime < ctx.currentTime + 0.15) { scheduleStep(step, nextTime); step++; nextTime += sixteenth; }
  }
  function startMusic() {
    if (!ctx || timer) return;
    nextTime = ctx.currentTime + 0.05; step = 0;
    musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(0.22, ctx.currentTime, 0.2);
    timer = setInterval(tick, 30);
  }
  function stopMusic() {
    if (timer) { clearInterval(timer); timer = 0; }
    if (ctx) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
  }

  return {
    get muted() { return muted; },
    get musicOn() { return musicOn; },
    get mode() { return mode; },
    get playing() { return !!timer; },
    unlock,
    toggle() { muted = !muted; set('ceruvia-muted', muted ? '1' : '0'); if (fxBus) fxBus.gain.value = muted ? 0 : 0.55; if (muted) this.rumbleStop(); return muted; },
    toggleMusic() { musicOn = !musicOn; set('ceruvia-music', musicOn ? '1' : '0'); if (!musicOn) stopMusic(); else if (mode) startMusic(); return musicOn; },
    // mode: 'calm', 'action' or null. Switching style keeps the beat going.
    music(m) {
      if (!musicOn) m = null;
      if (m === mode) return;
      mode = m;
      if (!m) { stopMusic(); return; }
      if (ctx && !timer) startMusic();
    },
    click() { tone(880, 0.04, 'square', 0.08); },
    place() { tone(523, 0.07, 'square', 0.14); tone(784, 0.1, 'square', 0.14, 0.06); },
    deny() { tone(180, 0.18, 'sawtooth', 0.12, 0, 120); },
    blip() { tone(1046, 0.06, 'square', 0.1); },
    stage() { noise(0.35, 0.25, 1200); tone(220, 0.3, 'sawtooth', 0.08, 0, 660); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.14, i * 0.09)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, i * 0.12)); },
    badge() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'square', 0.12, i * 0.07)); tone(2093, 0.4, 'triangle', 0.1, 0.3); },
    flip() { tone(660, 0.05, 'triangle', 0.12, 0, 990); },
    rumbleStart() {
      if (!ctx || muted || rumbleNode) return;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 160; g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.4);
      s.connect(f); f.connect(g); g.connect(fxBus); s.start();
      rumbleNode = { s, g };
    },
    rumbleStop() {
      if (!rumbleNode || !ctx) return;
      const { s, g } = rumbleNode; rumbleNode = null;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); s.stop(ctx.currentTime + 0.6);
    }
  };
})();
