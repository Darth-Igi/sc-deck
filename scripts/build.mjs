#!/usr/bin/env node
// Production build for SC Deck.
//
//   node scripts/build.mjs [options]
//
// Pipeline: clean -> unit tests -> vite build (renderer) -> electron-builder
// (main process + Electron runtime + koffi prebuild). The result is a
// standalone Windows app in release/ that no longer needs node/npm.
//
// Options:
//   --portable    only the standalone .exe (no installer)
//   --installer   only the NSIS setup
//   --dir         only release/win-unpacked (fast, for smoke tests)
//   --skip-tests  skip the unit tests
//   --skip-clean  keep dist/ and release/ from the previous run
//   --help
//
// Without a target option both targets from electron-builder.yml are built.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);

if (has("--help") || has("-h")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => l.startsWith("//"))
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n"));
  process.exit(0);
}

// Unit tests only - the Python UI tests need a display and are not part of
// the build pipeline (npm run test:ui runs those).
const UNIT_TESTS = [
  "test/configValidation.test.js",
  "test/gamelog.test.js",
  "test/gameEvents.test.mjs",
  "test/scancode.test.js",
];

let step = 0;
const started = Date.now();

function heading(title) {
  step += 1;
  console.log(`\n\x1b[36m[${step}] ${title}\x1b[0m`);
}

function fail(message, err) {
  console.error(`\n\x1b[31mBuild failed: ${message}\x1b[0m`);
  if (err?.message) console.error(err.message);
  process.exit(1);
}

function humanSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---- 1. Clean -------------------------------------------------------------
// Stale renderer assets would otherwise be packaged alongside the fresh ones,
// and electron-builder happily reuses an old release/ directory.
if (!has("--skip-clean")) {
  heading("Cleaning dist/ and release/");
  for (const dir of ["dist", "release"]) {
    const target = path.join(root, dir);
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`    removed ${dir}/`);
    } catch (err) {
      // A running app or an open Explorer window locks files on Windows.
      fail(`could not delete ${dir}/ - is the app still running?`, err);
    }
  }
}

// ---- 2. Tests -------------------------------------------------------------
if (!has("--skip-tests")) {
  heading("Running unit tests");
  for (const file of UNIT_TESTS) {
    try {
      execFileSync(process.execPath, [file], { cwd: root, stdio: "inherit" });
    } catch (err) {
      fail(`${file} failed`, err);
    }
  }
}

// ---- 3. Renderer ----------------------------------------------------------
heading("Building the renderer (Vite)");
try {
  const { build: viteBuild } = await import("vite");
  await viteBuild({ configFile: path.join(root, "vite.config.js"), logLevel: "info" });
} catch (err) {
  fail("vite build failed", err);
}

const indexHtml = path.join(root, "dist", "index.html");
if (!fs.existsSync(indexHtml)) fail("dist/index.html was not produced");

// ---- 4. Package -----------------------------------------------------------
// Target selection maps onto the win.target list in electron-builder.yml.
const targets = [];
if (has("--portable")) targets.push("portable");
if (has("--installer")) targets.push("nsis");
if (has("--dir")) targets.push("dir");

heading(`Packaging with electron-builder (${targets.join(" + ") || "all targets"})`);
let artifacts = [];
try {
  const { build: ebBuild, Platform, Arch } = await import("electron-builder");
  artifacts = await ebBuild({
    // Windows-only app (SendInput/user32.dll), so the target is fixed.
    targets: Platform.WINDOWS.createTarget(targets.length ? targets : null, Arch.x64),
  });
} catch (err) {
  fail("electron-builder failed", err);
}

// ---- 5. Verify ------------------------------------------------------------
// The one packaging mistake that survives every smoke test on the build
// machine: koffi ending up inside app.asar, where its .node cannot be loaded.
// The app then starts fine and only fails on the first key press.
heading("Verifying the package");
const unpackedRoot = path.join(root, "release", "win-unpacked");
if (fs.existsSync(unpackedRoot)) {
  const koffiNode = path.join(
    unpackedRoot,
    "resources/app.asar.unpacked/node_modules/koffi/build/koffi/win32_x64/koffi.node"
  );
  if (fs.existsSync(koffiNode)) {
    console.log("    koffi.node is unpacked - key dispatch will work");
  } else {
    fail(
      "koffi.node is missing from app.asar.unpacked - check asarUnpack in " +
        "electron-builder.yml (the app would start but send no keys)"
    );
  }
} else {
  console.log("    skipped (no win-unpacked directory for this target)");
}

// ---- Summary --------------------------------------------------------------
const files = artifacts
  .filter((f) => /\.(exe|msi|zip|blockmap)$/i.test(f) && !f.endsWith(".blockmap"))
  .map((f) => ({ file: f, size: fs.statSync(f).size }));

console.log(`\n\x1b[32mBuild finished in ${((Date.now() - started) / 1000).toFixed(1)}s\x1b[0m`);
console.log(`    version ${pkg.version}`);
for (const { file, size } of files) {
  console.log(`    ${path.relative(root, file)}  (${humanSize(size)})`);
}
if (fs.existsSync(unpackedRoot)) {
  console.log(`    ${path.relative(root, path.join(unpackedRoot, "SC Deck.exe"))}  (unpacked)`);
}
console.log(
  "\nThe portable .exe runs without installation; the config is created on " +
    "first launch at %APPDATA%\\sc-deck\\config.json."
);
