/* Lightweight, file-free button sounds. Tones are synthesized with WebAudio
   so there are no audio assets to ship and it works offline. All output is a
   short, quiet blip so taps feel responsive without being annoying. Honors a
   per-device on/off preference and the iOS gesture-unlock requirement. */

let ctx = null;
let enabled = true;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
}

export function setSfxEnabled(value) { enabled = !!value; }
export function isSfxEnabled() { return enabled; }

/* Resume the context inside a user gesture (iOS/Safari requirement). */
export function unlockSfx() {
  const c = getCtx();
  if (c && c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
}

function blip({ freq = 400, freq2, dur = 0.045, type = 'triangle', gain = 0.05 } = {}) {
  const c = getCtx();
  if (!c || !enabled) return;
  if (c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + dur + 0.03);
}

/* Generic tap — every button. */
export function tapSound() { blip({ freq: 360, dur: 0.038, type: 'triangle', gain: 0.045 }); }
/* Primary / CTA — a touch richer and higher. */
export function primarySound() { blip({ freq: 520, freq2: 720, dur: 0.08, type: 'sine', gain: 0.06 }); }
/* Making a pick — a confident upward pop. */
export function pickSound() { blip({ freq: 600, freq2: 900, dur: 0.075, type: 'triangle', gain: 0.07 }); }
