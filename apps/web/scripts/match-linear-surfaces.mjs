#!/usr/bin/env node

/**
 * match-linear-surfaces.mjs
 *
 * Deterministic test that:
 * 1. Generates a minimal HTML page that loads design-system.css dark-mode tokens
 * 2. Renders test divs with each surface token as background
 * 3. Uses Playwright to read computed RGB values (no auth needed)
 * 4. Compares against Linear reference colors from the screenshot
 * 5. If delta > tolerance, patches the CSS hex values and re-tests
 * 6. Loops until all surfaces pass or max iterations reached
 *
 * Usage:  node apps/web/scripts/match-linear-surfaces.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Reference colors from the Linear Notifications screenshot ──────────────
// Eyedropper-sampled from the uploaded Linear screenshot.
const LINEAR_REFERENCE = {
  base: {
    r: 17,
    g: 17,
    b: 17,
    token: '--color-bg-base',
    label: 'Sidebar / page bg (base)',
  },
  surface0: {
    r: 17,
    g: 17,
    b: 17,
    token: '--color-bg-surface-0',
    label: 'Surface-0 (same as base in Linear)',
  },
  surface1: {
    r: 25,
    g: 26,
    b: 28,
    token: '--color-bg-surface-1',
    label: 'Main content bg (surface-1)',
  },
  surface2: {
    r: 32,
    g: 33,
    b: 35,
    token: '--color-bg-surface-2',
    label: 'Card / elevated bg (surface-2)',
  },
  surface3: {
    r: 38,
    g: 40,
    b: 44,
    token: '--color-bg-surface-3',
    label: 'Modal / tooltip bg (surface-3)',
  },
};

const TOLERANCE = 6; // max per-channel delta
const MAX_ITERATIONS = 5;

const CSS_FILE = path.resolve(__dirname, '../styles/design-system.css');

// ── Helpers ────────────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function colorDelta(a, b) {
  return Math.max(
    Math.abs(a.r - b.r),
    Math.abs(a.g - b.g),
    Math.abs(a.b - b.b)
  );
}

function colorDeltaStr(a, b) {
  return `Δr=${a.r - b.r} Δg=${a.g - b.g} Δb=${a.b - b.b} (max=${colorDelta(a, b)})`;
}

/** Build a minimal HTML string that loads the CSS and renders test swatches */
function buildTestHtml() {
  const cssContent = fs.readFileSync(CSS_FILE, 'utf-8');
  const tokens = Object.values(LINEAR_REFERENCE).map(r => r.token);

  const swatches = tokens
    .map(
      t =>
        `<div id="${t}" style="width:100px;height:100px;background:var(${t})"></div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html class="dark" style="color-scheme:dark">
<head><style>${cssContent}</style></head>
<body style="margin:0;display:flex;gap:4px;padding:8px;background:#000">
${swatches}
</body>
</html>`;
}

/** Use Playwright to read computed background-color of each swatch */
async function sampleSwatches(page) {
  const tokens = Object.values(LINEAR_REFERENCE).map(r => r.token);
  return page.evaluate(tokenList => {
    const out = {};
    for (const token of tokenList) {
      const el = document.getElementById(token);
      if (!el) continue;
      const bg = window.getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) out[token] = { r: +m[1], g: +m[2], b: +m[3] };
    }
    return out;
  }, tokens);
}

/**
 * Patch a hex color in the DARK-MODE section of design-system.css.
 * Splits the file at `:root.dark {`, patches only in that block,
 * then reassembles.
 */
function patchCssToken(tokenName, newHex) {
  const css = fs.readFileSync(CSS_FILE, 'utf-8');
  const esc = tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find the DARK-MODE occurrence: the token preceded by "Dark mode" comment
  // Strategy: find "Dark mode" comment near the surface block, then the token after it
  // We look for the specific line pattern in the dark mode surfaces section
  const marker = '/* Dark mode surfaces';
  const markerIdx = css.indexOf(marker);
  if (markerIdx === -1) {
    console.error(`  ⚠️  Could not find dark mode surfaces section`);
    return;
  }

  // Only search/replace after the marker
  const before = css.slice(0, markerIdx);
  let after = css.slice(markerIdx);

  const piRe = new RegExp(
    `(/\\*\\s*prettier-ignore\\s*\\*/\\s*${esc}:\\s*)#[0-9a-fA-F]{6}`
  );
  const replaced = after.replace(piRe, `$1${newHex}`);
  if (replaced !== after) {
    after = replaced;
  } else {
    after = after.replace(
      new RegExp(`(${esc}:\\s*)#[0-9a-fA-F]{6}`),
      `$1${newHex}`
    );
  }

  fs.writeFileSync(CSS_FILE, before + after, 'utf-8');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎨 Linear Surface Color Matcher');
  console.log('================================\n');

  console.log('Reference (from Linear screenshot):');
  for (const [, ref] of Object.entries(LINEAR_REFERENCE)) {
    console.log(
      `  ${ref.label.padEnd(42)} → ${rgbToHex(ref.r, ref.g, ref.b)}  rgb(${ref.r}, ${ref.g}, ${ref.b})`
    );
  }
  console.log(`\nTolerance: ±${TOLERANCE} per channel\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ colorScheme: 'dark' });

  let iteration = 0;
  let allPass = false;

  while (iteration < MAX_ITERATIONS && !allPass) {
    iteration++;
    console.log(
      `── Iteration ${iteration}/${MAX_ITERATIONS} ──────────────────────────────`
    );

    // Build fresh HTML with current CSS
    const html = buildTestHtml();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(200);

    // Sample
    const sampled = await sampleSwatches(page);
    await page.close();

    // Compare
    allPass = true;
    const patches = [];

    for (const [key, ref] of Object.entries(LINEAR_REFERENCE)) {
      const s = sampled[ref.token];
      if (!s) {
        console.log(`  ⚠️  ${ref.label}: not sampled`);
        continue;
      }

      const delta = colorDelta(ref, s);
      const pass = delta <= TOLERANCE;
      const jovieHex = rgbToHex(s.r, s.g, s.b);
      const refHex = rgbToHex(ref.r, ref.g, ref.b);

      if (pass) {
        console.log(
          `  ✅ ${ref.token.padEnd(22)} ${jovieHex} ≈ ${refHex}  ${colorDeltaStr(ref, s)}`
        );
      } else {
        console.log(
          `  ❌ ${ref.token.padEnd(22)} ${jovieHex} ≠ ${refHex}  ${colorDeltaStr(ref, s)}`
        );
        allPass = false;
        patches.push({ key, ref, sampled: s });
      }
    }

    if (allPass) {
      console.log('\n🎉 All surface colors match Linear within tolerance!');
      break;
    }

    // Patch
    console.log('\n  Patching design-system.css:');
    for (const { ref } of patches) {
      const newHex = rgbToHex(ref.r, ref.g, ref.b);
      console.log(`    ${ref.token} → ${newHex}`);
      patchCssToken(ref.token, newHex);
    }
    console.log();
  }

  if (!allPass && iteration >= MAX_ITERATIONS) {
    console.log(`\n❌ Failed to converge after ${MAX_ITERATIONS} iterations.`);
  }

  await browser.close();

  // Summary
  console.log('\n================================');
  console.log(
    allPass
      ? '✅ PASS — All surface tokens match Linear'
      : '❌ FAIL — Surface tokens do not match'
  );
  console.log('================================\n');

  // Print final token values for reference
  if (allPass) {
    console.log('Final dark-mode surface tokens in design-system.css:');
    const css = fs.readFileSync(CSS_FILE, 'utf-8');
    for (const [, ref] of Object.entries(LINEAR_REFERENCE)) {
      const m = css.match(
        new RegExp(
          `${ref.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(#[0-9a-fA-F]{6})`
        )
      );
      if (m) console.log(`  ${ref.token}: ${m[1]}`);
    }
    console.log();
  }

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
