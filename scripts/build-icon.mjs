#!/usr/bin/env node
// Render Free Workout Timer app icon set from inline SVGs to PNG.
//
// Outputs (1024x1024):
//   assets/icon.png           — iOS App Store + iOS home screen. RGB, no alpha.
//   assets/adaptive-icon.png  — Android adaptive foreground. RGBA, transparent.
//   assets/splash-icon.png    — splash screen glyph. RGBA, transparent.
//
// Design: paper canvas (#FAFAF7), persimmon (#B85040) outlined stopwatch
// — round face, crown on top, single hand at ~2 o'clock, four cardinal
// ticks. The glyph reads as "timer" on its own. No corner badges; iOS's
// squircle mask clips them and small render sizes turn extras into noise.
//
// Run from FWT repo root:
//   npm install --no-save sharp
//   node scripts/build-icon.mjs
//
// `sharp` is intentionally NOT a devDependency of this project — it's a
// native-module SVG renderer that has no place in the React Native app's
// install graph. Adding it pulled prebuilt libvips binaries into every EAS
// Build install, which broke iOS production builds. Install it ad-hoc here
// when regenerating icons; uninstall after if you want to keep node_modules
// clean.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(repoRoot, 'assets');

const PAPER = '#FAFAF7';
const PERSIMMON = '#B85040';
const SIZE = 1024;

// Stopwatch geometry. cy is chosen so the glyph's full ink bounding box —
// from the crown button's top edge down to the outer edge of the circle's
// stroke — is vertically centered in the 1024 canvas with equal top and
// bottom padding. Top of glyph = cy - r - stemH - btnH; bottom = cy + r +
// stroke/2; setting those equidistant from the canvas edges gives cy = 551
// (125px clear above and below). Do not re-bias this down — uneven padding
// reads as a mistake at small home-screen sizes (canonical: app icons are
// centered with equal top/bottom padding).
const cx = 512;
const cy = 551;
const r = 320;
const stroke = 56;

const stemW = 40;
const stemH = 50;
const stemX = cx - stemW / 2;
const stemY = cy - r - stemH;

const btnW = 140;
const btnH = 56;
const btnX = cx - btnW / 2;
const btnY = stemY - btnH;

// Hand at ~2 o'clock — suggests "running" without committing to a clock time.
const angleRad = (60 * Math.PI) / 180;
const handLen = r * 0.68;
const handX = cx + Math.sin(angleRad) * handLen;
const handY = cy - Math.cos(angleRad) * handLen;

const tickInset = stroke / 2 + 24;
const tickLen = 36;
const tickW = 22;

function stopwatchGroup() {
  return `
    <rect x="${btnX}" y="${btnY}" width="${btnW}" height="${btnH}" rx="20" fill="${PERSIMMON}"/>
    <rect x="${stemX}" y="${stemY}" width="${stemW}" height="${stemH}" fill="${PERSIMMON}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${PERSIMMON}" stroke-width="${stroke}"/>
    <line x1="${cx}" y1="${cy - r + tickInset}" x2="${cx}" y2="${cy - r + tickInset + tickLen}" stroke="${PERSIMMON}" stroke-width="${tickW}" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy + r - tickInset}" x2="${cx}" y2="${cy + r - tickInset - tickLen}" stroke="${PERSIMMON}" stroke-width="${tickW}" stroke-linecap="round"/>
    <line x1="${cx - r + tickInset}" y1="${cy}" x2="${cx - r + tickInset + tickLen}" y2="${cy}" stroke="${PERSIMMON}" stroke-width="${tickW}" stroke-linecap="round"/>
    <line x1="${cx + r - tickInset}" y1="${cy}" x2="${cx + r - tickInset - tickLen}" y2="${cy}" stroke="${PERSIMMON}" stroke-width="${tickW}" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${handX}" y2="${handY}" stroke="${PERSIMMON}" stroke-width="38" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="32" fill="${PERSIMMON}"/>`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="${PAPER}"/>
    ${stopwatchGroup()}
  </svg>`;
}

// Android adaptive foreground: transparent canvas, glyph scaled into the
// central 66% safe area so circle/squircle masks don't crop it.
function adaptiveSvg() {
  const scale = 0.66;
  const tx = ((1 - scale) * SIZE) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <g transform="translate(${tx} ${tx}) scale(${scale})">
      ${stopwatchGroup()}
    </g>
  </svg>`;
}

// Splash glyph: ~40% of canvas, transparent bg so it sits against the paper
// splash background defined in app.json.
function splashSvg() {
  const scale = 0.4;
  const tx = ((1 - scale) * SIZE) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <g transform="translate(${tx} ${tx}) scale(${scale})">
      ${stopwatchGroup()}
    </g>
  </svg>`;
}

async function build() {
  fs.mkdirSync(assetsDir, { recursive: true });

  const iconPng = path.join(assetsDir, 'icon.png');
  const adaptivePng = path.join(assetsDir, 'adaptive-icon.png');
  const splashPng = path.join(assetsDir, 'splash-icon.png');

  console.log('Rendering icon.png (iOS, no alpha)...');
  await sharp(Buffer.from(iconSvg()))
    .flatten({ background: PAPER })
    .png({ compressionLevel: 9 })
    .toFile(iconPng);
  console.log(`  ${path.relative(repoRoot, iconPng)}`);

  console.log('Rendering adaptive-icon.png (Android foreground, transparent)...');
  await sharp(Buffer.from(adaptiveSvg()))
    .png({ compressionLevel: 9 })
    .toFile(adaptivePng);
  console.log(`  ${path.relative(repoRoot, adaptivePng)}`);

  console.log('Rendering splash-icon.png (transparent)...');
  await sharp(Buffer.from(splashSvg()))
    .png({ compressionLevel: 9 })
    .toFile(splashPng);
  console.log(`  ${path.relative(repoRoot, splashPng)}`);

  console.log('\nDone.');
}

build();
