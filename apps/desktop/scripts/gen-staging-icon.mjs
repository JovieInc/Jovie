#!/usr/bin/env node
/**
 * Staging dogfood reuses the production desktop icon under staging filenames.
 * Keep this copy local to apps/desktop so brand-asset regeneration stays
 * production-only (coverage + single-source), while packaging still finds
 * assets/icon-staging.{png,icns}.
 */
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = path.resolve(fileURLToPath(import.meta.url), '../../assets');

const required = [['icon.png', 'icon-staging.png']];
const optional = [['icon.icns', 'icon-staging.icns']];

for (const [srcName, destName] of required) {
  const src = path.join(assetsDir, srcName);
  const dest = path.join(assetsDir, destName);
  if (!existsSync(src)) {
    throw new Error(
      `Missing ${src}; run \`pnpm --filter @jovie/desktop run prepare:assets\` first`
    );
  }
  copyFileSync(src, dest);
}

for (const [srcName, destName] of optional) {
  const src = path.join(assetsDir, srcName);
  const dest = path.join(assetsDir, destName);
  // .icns is produced by iconutil on macOS only; Linux CI / local Linux skips.
  if (!existsSync(src)) continue;
  copyFileSync(src, dest);
}
