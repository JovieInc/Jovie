/**
 * Capture product screens for the presentation gate: a clean frame (no dev
 * chrome, dark, reduced motion, synthetic persona) plus its geometry snapshot.
 *
 *   node scripts/design-present/capture.mjs --manifest <manifest.json> \
 *     --base http://localhost:3000 --label after
 *
 * Writes <set>/<label>/<id>.png and <id>.geometry.json next to the manifest.
 * Start the dev server with NEXT_DISABLE_TOOLBAR=1 and the test-auth bypass.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPresentGeometry } from './collect.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function captureScreens({ manifestPath, base, label, only }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const outDir = join(dirname(manifestPath), label);
  mkdirSync(outDir, { recursive: true });
  const requireFromWeb = createRequire(
    join(HERE, '../../apps/web/package.json')
  );
  const { chromium } = requireFromWeb('@playwright/test');
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const screen of manifest.screens) {
      if (only && !only.includes(screen.id)) continue;
      const viewport = screen.viewport ??
        manifest.viewport ?? { width: 1440, height: 900 };
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: 'dark',
        reducedMotion: 'reduce',
      });
      const persona = screen.persona ?? manifest.persona;
      if (persona) {
        const res = await context.request.post(
          `${base}/api/dev/test-auth/session`,
          {
            data: { persona },
            timeout: 240_000,
          }
        );
        if (!res.ok())
          throw new Error(`test-auth ${persona}: HTTP ${res.status()}`);
      }
      const page = await context.newPage();
      await page.goto(`${base}${screen.route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      });
      await page
        .waitForLoadState('networkidle', { timeout: 90_000 })
        .catch(() => {});
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(1500);
      const geometry = await page.evaluate(
        collectPresentGeometry,
        manifest.collect ?? {}
      );
      const png = join(outDir, `${screen.id}.png`);
      await page.screenshot({ path: png });
      writeFileSync(
        join(outDir, `${screen.id}.geometry.json`),
        `${JSON.stringify(geometry, null, 2)}\n`
      );
      results.push({ id: screen.id, png, geometry });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const args = process.argv.slice(2);
  const manifestPath = resolve(flag(args, '--manifest') ?? '');
  const results = await captureScreens({
    manifestPath,
    base: flag(args, '--base') ?? 'http://localhost:3000',
    label: flag(args, '--label') ?? 'after',
    only: flag(args, '--only')?.split(','),
  });
  for (const r of results) console.log(`captured ${r.id} -> ${r.png}`);
}
