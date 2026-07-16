// Offline validation of the MFCC+DTW voice matcher: perturb each template
// (speed, gain, noise) and check it is still identified among candidates.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { mfcc, dtw, findSpeech } from "./dsp.mjs";

const REPO = process.env.HOME + "/Documents/github/zhuyin-vanilla";

// ── minimal RIFF/PCM16 WAV parser ──────────────────────────────────────────────
function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("not RIFF: " + path);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error("unsupported wav: " + path);
  const n = Math.floor(data.length / 2 / fmt.channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * fmt.channels) / 32768; // ch 0
  return { samples: out, rate: fmt.rate };
}

function resample(data, from, to) {
  if (from === to) return data;
  const outLen = Math.floor((data.length * to) / from);
  const out = new Float32Array(outLen);
  const step = from / to;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step, i0 = Math.floor(pos), frac = pos - i0;
    out[i] = data[i0] + (data[Math.min(i0 + 1, data.length - 1)] - data[i0]) * frac;
  }
  return out;
}

// ── load all templates ─────────────────────────────────────────────────────────
const ids = [];
const raw16k = new Map();
for (const dir of ["audio", "audio/templates"]) {
  for (const f of readdirSync(`${REPO}/${dir}`)) {
    if (!f.endsWith(".wav")) continue;
    const id = f.replace(/\.wav$/, "").normalize("NFC");
    if (raw16k.has(id)) continue;
    const { samples, rate } = readWav(`${REPO}/${dir}/${f}`);
    raw16k.set(id, resample(samples, rate, 16000));
    ids.push(id);
  }
}
console.log(`loaded ${ids.length} templates`);

const templates = new Map();
for (const id of ids) {
  let d = raw16k.get(id);
  const seg = findSpeech(d, { minMs: 60, hangMs: 150 });
  if (seg) d = d.subarray(seg[0], Math.min(seg[1], d.length));
  templates.set(id, mfcc(d));
}

// ── perturbations simulating a live utterance ──────────────────────────────────
function perturb(data, { speed = 1, gain = 1, noise = 0 }) {
  let d = resample(data, 16000 * speed, 16000);
  const out = new Float32Array(d.length);
  let rms = 0;
  for (const v of d) rms += v * v;
  rms = Math.sqrt(rms / d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i] * gain + (Math.random() * 2 - 1) * rms * noise;
  return out;
}

function match(samples, candidateIds) {
  const seg = findSpeech(samples, { minMs: 80, hangMs: 200 });
  const trimmed = seg ? samples.subarray(seg[0], Math.min(seg[1], samples.length)) : samples;
  const frames = mfcc(trimmed);
  if (frames.length < 5) return [];
  return candidateIds
    .filter(id => templates.has(id))
    .map(id => ({ id, d: dtw(frames, templates.get(id)) }))
    .sort((a, b) => a.d - b.d);
}

// level candidate sets (mirrors levels.js)
const LEVEL_SETS = [
  ["b","p","m","f"], ["d","t","n","l"], ["g","k","h"], ["j","q","x"],
  ["zh","ch","sh","r","z","c","s"],
  ["a","o","e","ê"], ["ai","ei","ao","ou"], ["an","en","ang","eng","er"], ["i","u","ü"],
  ["ia","io","ie","ian","in","iang","ing","iou"],
  ["ua","uo","uai","uei","uan","uen","uang","ueng"],
  ["yue","yuan","yun","yung"],
  ["ba","ma","da","tu","gou","hua","mi","shu"],
  ["jia","qiu","xing","zhu","chuan","shui","niao","mao"],
];

const PERTURBS = [
  { speed: 1.0, gain: 1.0, noise: 0.02 },
  { speed: 0.9, gain: 0.6, noise: 0.05 },
  { speed: 1.1, gain: 1.4, noise: 0.05 },
  { speed: 1.2, gain: 0.5, noise: 0.10 },
];

let ok = 0, okMargin = 0, total = 0;
const fails = [];
for (const set of LEVEL_SETS) {
  for (const id of set) {
    if (!raw16k.has(id)) { console.log("missing:", id); continue; }
    for (const p of PERTURBS) {
      const scores = match(perturb(raw16k.get(id), p), set);
      if (!scores.length) { fails.push(`${id} (no frames)`); total++; continue; }
      total++;
      const ts = scores.find(s => s.id === id);
      if (scores[0].id === id) { ok++; okMargin++; }
      else if (ts && ts.d <= scores[0].d * 1.10) { okMargin++; fails.push(`${id}: margin-hit behind ${scores[0].id}`); }
      else fails.push(`${id}: lost to ${scores[0].id} (${ts?.d.toFixed(2)} vs ${scores[0].d.toFixed(2)}) [spd=${p.speed},g=${p.gain},n=${p.noise}]`);
    }
  }
}
console.log(`\nrank-1: ${ok}/${total} (${(100*ok/total).toFixed(1)}%)`);
console.log(`with 10% margin rule: ${okMargin}/${total} (${(100*okMargin/total).toFixed(1)}%)`);
if (fails.length) console.log("\nmisses:\n" + fails.slice(0, 25).join("\n"));
