#!/usr/bin/env node
/**
 * FiCo pitch motion renderer.
 *
 *   node pitch/render.mjs                 # full 1200-frame render -> pitch/out/fico-pitch.mp4
 *   node pitch/render.mjs --stills 1,4.8  # single frames -> pitch/out/stills/
 *
 * Deterministic: every frame is produced by window.renderFrame(ms) in
 * pitch/motion.html, captured with the headless Chromium shell that ships
 * with Playwright, then encoded with ffmpeg.
 */
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(HERE, "motion.html");
const OUT = path.join(HERE, "out");
const FRAMES = path.join(OUT, "frames");

const FPS = 30;
const DURATION = 40;
const W = 1920;
const H = 1080;

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    path.join(os.homedir(), ".hermes/hermes-agent/node_modules/playwright"),
    path.join(os.homedir(), ".codeman/app/node_modules/playwright"),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require(c);
    } catch {}
  }
  try {
    return require("playwright");
  } catch {}
  throw new Error("playwright not found — set PLAYWRIGHT_MODULE=/path/to/playwright");
}

function findChromium() {
  if (process.env.CHROMIUM_EXECUTABLE) return process.env.CHROMIUM_EXECUTABLE;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (existsSync(cache)) {
    const { readdirSync } = require("node:fs");
    const dirs = readdirSync(cache)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();
    for (const d of dirs) {
      const p = path.join(
        cache,
        d,
        "chrome-headless-shell-mac-arm64/chrome-headless-shell"
      );
      if (existsSync(p)) return p;
    }
  }
  return undefined; // let playwright resolve its own
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))
    );
  });
}

async function main() {
  const args = process.argv.slice(2);
  const stillsArg = args.find((a) => a.startsWith("--stills"));
  const startArg = args.find((a) => a.startsWith("--from="));
  const toArg = args.find((a) => a.startsWith("--to="));

  await mkdir(OUT, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(HTML).href + "?t=0&hint=0");
  await page.waitForFunction(() => typeof window.renderFrame === "function");
  await page.evaluate(() => document.fonts.ready);

  if (stillsArg) {
    const times = stillsArg.includes("=")
      ? stillsArg.split("=")[1]
      : args[args.indexOf(stillsArg) + 1];
    const dir = path.join(OUT, "stills");
    await mkdir(dir, { recursive: true });
    for (const s of String(times).split(",")) {
      const ms = Math.round(Number(s) * 1000);
      await page.evaluate((m) => window.renderFrame(m), ms);
      const file = path.join(dir, `t${(ms / 1000).toFixed(2).padStart(5, "0")}.png`);
      await page.screenshot({ path: file });
      console.log("still", file);
    }
    await browser.close();
    return;
  }

  const from = startArg ? Math.round(Number(startArg.split("=")[1]) * FPS) : 0;
  const to = toArg ? Math.round(Number(toArg.split("=")[1]) * FPS) : DURATION * FPS;
  const total = to - from;

  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });

  const t0 = Date.now();
  for (let f = from; f < to; f++) {
    const ms = (f / FPS) * 1000;
    await page.evaluate((m) => window.renderFrame(m), ms);
    await page.screenshot({
      path: path.join(FRAMES, `f${String(f).padStart(5, "0")}.png`),
    });
    const done = f - from + 1;
    if (done % 30 === 0 || done === total) {
      const el = (Date.now() - t0) / 1000;
      const eta = (el / done) * (total - done);
      process.stdout.write(
        `\rframe ${done}/${total}  ${(done / el).toFixed(1)} fps  eta ${eta.toFixed(0)}s   `
      );
    }
  }
  process.stdout.write("\n");
  await browser.close();

  const mp4 = path.join(OUT, "fico-pitch.mp4");
  await run("ffmpeg", [
    "-y",
    "-framerate", String(FPS),
    "-start_number", String(from),
    "-i", path.join(FRAMES, "f%05d.png"),
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "16",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-r", String(FPS),
    mp4,
  ]);
  console.log("video", mp4);

  // poster frame for the pitch deck
  const poster = path.join(OUT, "poster.png");
  await run("ffmpeg", ["-y", "-i", mp4, "-ss", "36.2", "-frames:v", "1", poster]);
  console.log("poster", poster);

  await writeFile(
    path.join(OUT, "render.json"),
    JSON.stringify({ fps: FPS, duration: DURATION, width: W, height: H, frames: total }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
