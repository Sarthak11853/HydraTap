// Generates assets/sounds/water_drop.wav — a soft, two-drop "bloop" chime.
// Pure synthesis (no samples, no licences): rising sine chirps with exponential
// decay plus a short, gentle echo. Usage: node scripts/generate-sound.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const DURATION = 1.3;
const N = Math.floor(RATE * DURATION);
const buf = new Float32Array(N);

function drop(start, f0, f1, sweep, decay, gain) {
  let phase = 0;
  const s0 = Math.floor(start * RATE);
  for (let i = s0; i < N; i++) {
    const t = (i - s0) / RATE;
    const k = Math.min(1, t / sweep);
    const f = f0 + (f1 - f0) * (1 - Math.pow(1 - k, 3));
    phase += (2 * Math.PI * f) / RATE;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-t / decay);
    if (env < 1e-4 && t > 0.05) break;
    buf[i] += gain * env * (Math.sin(phase) + 0.18 * Math.sin(2 * phase));
  }
}

drop(0.0, 520, 1350, 0.055, 0.09, 0.75);
drop(0.19, 680, 1700, 0.045, 0.075, 0.5);
drop(0.42, 820, 1950, 0.04, 0.06, 0.22);

// Gentle echo for a watery, spacious feel.
for (const [delay, g] of [[0.11, 0.28], [0.23, 0.14]]) {
  const d = Math.floor(delay * RATE);
  for (let i = N - 1; i >= d; i--) buf[i] += g * buf[i - d];
}

let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const scale = (0.8 / peak) * 32767;

const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const fade = i > N - RATE * 0.15 ? (N - i) / (RATE * 0.15) : 1;
  data.writeInt16LE(Math.round(buf[i] * scale * fade), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds', 'water_drop.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`wrote ${out} (${((44 + data.length) / 1024).toFixed(0)} KB)`);
