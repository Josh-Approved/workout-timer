#!/usr/bin/env node
// Render Free Workout Timer app icon set from inline SVGs to PNG.
//
// Outputs (1024x1024):
//   assets/icon.png           — iOS App Store + iOS home screen. RGB, no alpha.
//   assets/adaptive-icon.png  — Android adaptive foreground. RGBA, transparent canvas.
//   assets/splash-icon.png    — splash screen glyph. RGBA, transparent canvas.
//
// Design: paper canvas (#FAFAF7), three persimmon (#B85040) horizontal bars
// stacked center, green (#1F8A4C) approval check in bottom-right corner.
// No outer border on the rendered icon — iOS applies its own mask.
//
// Run from FWT repo root:  node scripts/build-icon.mjs

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(repoRoot, 'assets');

const PAPER = '#FAFAF7';
const PERSIMMON = '#B85040';
const APPROVAL_GREEN = '#1F8A4C';
const SIZE = 1024;

// Glyph: three stacked horizontal bars, varied widths, rounded ends.
// Coordinates inside a 1024 canvas, centered.
function glyphSvg() {
  const barH = 96;
  const gap = 56;
  const totalH = barH * 3 + gap * 2;
  const startY = (SIZE - totalH) / 2;
  // Widths chosen to evoke an interval rhythm: long / short / longest.
  const bars = [
    { w: 560, y: startY },
    { w: 380, y: startY + barH + gap },
    { w: 640, y: startY + (barH + gap) * 2 },
  ];
  return bars
    .map(({ w, y }) => {
      const x = (SIZE - w) / 2;
      return `<rect x="${x}" y="${y}" width="${w}" height="${barH}" rx="${barH / 2}" ry="${barH / 2}" fill="${PERSIMMON}"/>`;
    })
    .join('\n      ');
}

function approvalCornerSvg() {
  // Green rounded-square tile in bottom-right with paper checkmark.
  const tile = 160;
  const margin = 56;
  const x = SIZE - tile - margin;
  const y = SIZE - tile - margin;
  // Check polyline coordinates within a 24-unit grid, scaled to tile.
  const s = tile / 24;
  const tx = (n) => x + n * s;
  const ty = (n) => y + n * s;
  return `
      <rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="36" ry="36" fill="${APPROVAL_GREEN}"/>
      <polyline points="${tx(6)},${ty(12.5)} ${tx(10.5)},${ty(17)} ${tx(18)},${ty(8.5)}"
        fill="none" stroke="${PAPER}" stroke-width="${2.6 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="${PAPER}"/>
    ${glyphSvg()}
    ${approvalCornerSvg()}
  </svg>`;
}

function adaptiveSvg() {
  // Android adaptive foreground: transparent canvas, glyph sized inside the
  // central 66% safe area so circle/squircle masks don't crop it.
  // No corner check — the corner would get cropped on circular masks.
  // Scale glyph down: 384/1024 of the canvas → fits comfortably in the safe area.
  const safe = 0.66;
  const scale = safe; // glyph already centered, just shrink the visible content
  const tx = (1 - scale) * SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <g transform="translate(${tx} ${tx}) scale(${scale})">
      ${glyphSvg()}
    </g>
  </svg>`;
}

function splashSvg() {
  // Splash: glyph only, transparent bg. Scaled to ~40% of canvas so it sits
  // comfortably with `resizeMode: contain` against the paper splash bg.
  const scale = 0.4;
  const tx = (1 - scale) * SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <g transform="translate(${tx} ${tx}) scale(${scale})">
      ${glyphSvg()}
    </g>
  </svg>`;
}

// Wrap an SVG in a minimal HTML doc for headless Chrome screenshot.
function wrapHtml(svg, bg) {
  const bgCss = bg || 'transparent';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;background:${bgCss};}
    svg{display:block;width:${SIZE}px;height:${SIZE}px;}
  </style></head><body>${svg}</body></html>`;
}

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found. Set CHROME_PATH.');
}

function renderHtmlToPng(html, outPath, { transparent }) {
  const tmpHtml = path.join(os.tmpdir(), `fwt-icon-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--force-device-scale-factor=1',
    `--window-size=${SIZE},${SIZE}`,
    `--screenshot=${outPath}`,
    '--virtual-time-budget=2000',
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push(pathToFileURL(tmpHtml).href);
  const result = spawnSync(findChrome(), args, { stdio: 'pipe' });
  fs.rmSync(tmpHtml, { force: true });
  if (result.status !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`Chrome failed (${result.status}): ${result.stderr?.toString() || ''}`);
  }
}

// Strip alpha from an RGBA PNG → RGB PNG (App Store requirement).
// Composite over the paper bg first to flatten any anti-aliased edges, then
// write with colorType=2 (RGB, no alpha channel).
function stripAlpha(pngPath, bgHex) {
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  // Parse #RRGGBB
  const br = parseInt(bgHex.slice(1, 3), 16);
  const bg = parseInt(bgHex.slice(3, 5), 16);
  const bb = parseInt(bgHex.slice(5, 7), 16);
  // Composite RGBA over bg into a fresh RGBA buffer with alpha=255.
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    png.data[i]     = Math.round(png.data[i]     * a + br * (1 - a));
    png.data[i + 1] = Math.round(png.data[i + 1] * a + bg * (1 - a));
    png.data[i + 2] = Math.round(png.data[i + 2] * a + bb * (1 - a));
    png.data[i + 3] = 255;
  }
  // pngjs writes colorType=2 by stripping the alpha bytes from RGBA input.
  fs.writeFileSync(pngPath, PNG.sync.write(png, { colorType: 2, inputColorType: 6, inputHasAlpha: true }));
}

function build() {
  fs.mkdirSync(assetsDir, { recursive: true });

  const iconPng = path.join(assetsDir, 'icon.png');
  const adaptivePng = path.join(assetsDir, 'adaptive-icon.png');
  const splashPng = path.join(assetsDir, 'splash-icon.png');

  console.log('Rendering icon.png (iOS, no alpha)...');
  renderHtmlToPng(wrapHtml(iconSvg(), PAPER), iconPng, { transparent: false });
  stripAlpha(iconPng, PAPER);
  console.log(`  ${path.relative(repoRoot, iconPng)}`);

  console.log('Rendering adaptive-icon.png (Android foreground, transparent)...');
  renderHtmlToPng(wrapHtml(adaptiveSvg(), null), adaptivePng, { transparent: true });
  console.log(`  ${path.relative(repoRoot, adaptivePng)}`);

  console.log('Rendering splash-icon.png (transparent)...');
  renderHtmlToPng(wrapHtml(splashSvg(), null), splashPng, { transparent: true });
  console.log(`  ${path.relative(repoRoot, splashPng)}`);

  console.log('\nDone.');
}

build();
