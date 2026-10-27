// Renders a film from media/films/ to MP4, frame by frame, with UI sounds and a soft pad.
//
//   node media/render.mjs home                    # → media/out/home.mp4 (1920×1080, 30 fps)
//   node media/render.mjs home --stills 2,6,12    # → media/out/home-2.jpg … to check frames
//   node media/render.mjs home --vertical         # → media/out/home-vertical.mp4 (1080×1920 crop)
//
// Needs Playwright with Chromium (set PLAYWRIGHT_MODULE if it isn't installed here) and ffmpeg.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [name, ...rest] = process.argv.slice(2);
if (!name) throw new Error("Usage: node media/render.mjs <film> [--stills t1,t2] [--fps 30]");
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const FPS = Number(opt("--fps") ?? 30);
const out = path.join(here, "out");
fs.mkdirSync(out, { recursive: true });

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, "films", `${name}.html`)).href + "?capture");
await page.waitForFunction(() => window.Film?.ready);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.Film.duration);

const stills = opt("--stills");
if (stills) {
  for (const t of stills.split(",").map(Number)) {
    await page.evaluate((t) => window.Film.render(t), t);
    await page.screenshot({ path: path.join(out, `${name}-${t}.jpg`), type: "jpeg", quality: 85 });
  }
  console.log(`stills → ${out}`);
  await browser.close();
  process.exit(0);
}

// --- video: screenshots piped straight into ffmpeg ----------------------------------------
const silent = path.join(out, `${name}.silent.mp4`);
const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round(duration * FPS);
const started = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.Film.render(t), i / FPS);
  const jpg = await page.screenshot({ type: "jpeg", quality: 94 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 150 === 0) console.log(`${name}: frame ${i}/${frames} (${Math.round((Date.now() - started) / 1000)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
const cues = await page.evaluate(() => window.Film.cues());
const key = await page.evaluate(() => document.body.dataset.key || "A");
await browser.close();

// --- sound: soft UI cues on the on-screen events, over a quiet pad ------------------------------
const RATE = 44100, N = Math.ceil(duration * RATE);
const L = new Float32Array(N), R = new Float32Array(N);
const add = (t0, len, fn, pan = 0) => {
  const s0 = Math.floor(t0 * RATE);
  for (let i = 0; i < len * RATE && s0 + i < N; i++) { if (s0 + i < 0) continue; const v = fn(i / RATE); L[s0 + i] += v * (1 - pan); R[s0 + i] += v * (1 + pan); }
};
const tone = (f, decay, amp) => (t) => amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / decay) * Math.min(1, t / 0.004);
const SFX = {
  send: (t0) => add(t0, 0.2, (t) => 0.22 * Math.sin(2 * Math.PI * (900 * t + 3200 * t * t)) * Math.exp(-t / 0.045) * Math.min(1, t / 0.003), 0.25),
  recv: (t0) => { add(t0, 0.5, tone(1046.5, 0.09, 0.15), -0.2); add(t0 + 0.045, 0.5, tone(1568, 0.11, 0.12), -0.2); },
  notify: (t0) => [1318.5, 1661.2, 1975.5].forEach((f, i) => add(t0 + i * 0.075, 0.7, tone(f, 0.14, 0.11))),
  tick: (t0) => add(t0, 0.08, tone(2350, 0.014, 0.07)),
  pay: (t0) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => add(t0 + i * 0.06, 0.9, tone(f, 0.2, 0.1))),
};
for (const c of cues) if (c.t > 0.2 && SFX[c.kind]) SFX[c.kind](c.t);
// Pad: a soft major-ninth chord with slow swells, in the film's key.
const ROOT = { A: 110, C: 130.81, D: 146.83, F: 174.61, G: 98 }[key] ?? 110;
const chord = [1, 1.5, 2.5198, 3.3636, 4.4898].map((r) => ROOT * r);
for (let i = 0; i < N; i++) {
  const t = i / RATE, env = Math.min(1, t / 3) * Math.min(1, (duration - t) / 3);
  let v = 0;
  chord.forEach((f, k) => { const sw = 0.6 + 0.4 * Math.sin(2 * Math.PI * (0.07 + k * 0.013) * t + k); v += Math.sin(2 * Math.PI * f * t) * sw + 0.6 * Math.sin(2 * Math.PI * f * 1.003 * t) * sw; });
  const p = 0.016 * env * v;
  L[i] += p; R[i] += p;
}
const wav = Buffer.alloc(44 + N * 4);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { wav.writeInt16LE(Math.round(Math.tanh(L[i]) * 30000), 44 + i * 4); wav.writeInt16LE(Math.round(Math.tanh(R[i]) * 30000), 46 + i * 4); }
const wavPath = path.join(out, `${name}.wav`);
fs.writeFileSync(wavPath, wav);

const final = path.join(out, `${name}.mp4`);
await new Promise((resolve, reject) => {
  const mux = spawn("ffmpeg", ["-loglevel", "error", "-y", "-i", silent, "-i", wavPath, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final], { stdio: "inherit" });
  mux.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
});
fs.rmSync(silent);
fs.rmSync(wavPath);
console.log(`${final} (${duration}s, ${Math.round((Date.now() - started) / 1000)}s to render)`);
