// ============================================================
// sounds.js: tiny synthesized sound-effects engine.
// Uses the browser's built-in Web Audio API to generate simple
// tones in real time. No audio files are needed, so there is
// nothing to download, nothing that can 404, and no licensing.
// ============================================================

let ctx = null;
let muted = false;

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  // Browsers only allow audio after a tap or click. This unlocks it.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Plays one tone. freq in Hz, start and duration in seconds.
function tone(freq, start, duration, type = 'sine', gainPeak = 0.18) {
  if (muted) return;
  const c = getContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.05);
}

export const SoundFX = {
  setMuted(value) { muted = value; },
  isMuted() { return muted; },

  click() { tone(700, 0, 0.06, 'square', 0.08); },
  correct() {
    // bright ascending chime
    tone(523.25, 0, 0.15, 'sine');
    tone(659.25, 0.1, 0.15, 'sine');
    tone(783.99, 0.2, 0.28, 'sine');
  },
  wrong() {
    // low descending buzz
    tone(220, 0, 0.18, 'sawtooth', 0.14);
    tone(160, 0.14, 0.28, 'sawtooth', 0.14);
  },
  timerUrgent() { tone(1046.5, 0, 0.08, 'square', 0.1); },
  lifeline() {
    tone(392, 0, 0.12, 'triangle', 0.14);
    tone(523.25, 0.1, 0.12, 'triangle', 0.14);
    tone(659.25, 0.2, 0.22, 'triangle', 0.14);
  },
  turnChange() {
    tone(440, 0, 0.1, 'triangle', 0.12);
    tone(554.37, 0.09, 0.16, 'triangle', 0.12);
  },
  fanfare() {
    // short victory fanfare for the leaderboard screen
    const notes = [523.25, 523.25, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, i * 0.14, 0.3, 'triangle', 0.15));
  },
  applause() {
    // soft "clap" made from rapid random short tones
    for (let i = 0; i < 18; i++) {
      tone(150 + Math.random() * 400, Math.random() * 0.9, 0.05, 'square', 0.05);
    }
  },
};
