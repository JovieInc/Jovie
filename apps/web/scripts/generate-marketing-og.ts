import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regenerates the static marketing OG cards. Filesystem work (fontconfig
 * setup, card writes) stays in this script: apps/web/lib is runtime app code
 * scanned by JOV-INV-031, which rejects sync I/O there (JOV-7864).
 *
 *   pnpm exec tsx scripts/generate-marketing-og.ts
 */

async function main(): Promise<void> {
  const outputDir = join(process.cwd(), 'public/og');
  const fontDir = join(process.cwd(), 'public/fonts');
  const fontConfigPath = join('/tmp', 'jovie-marketing-og-fonts.conf');
  writeFileSync(
    fontConfigPath,
    `<?xml version="1.0"?>
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>/tmp/jovie-marketing-og-fontconfig</cachedir>
</fontconfig>
`
  );
  process.env.FONTCONFIG_FILE ??= fontConfigPath;

  const { MARKETING_OG_CARDS } = await import('@/data/marketingOgCards');
  const { renderMarketingOgPng } = await import('@/lib/og/marketing-og-card');

  mkdirSync(outputDir, { recursive: true });
  for (const card of MARKETING_OG_CARDS) {
    writeFileSync(join(outputDir, card.file), await renderMarketingOgPng(card));
  }
  console.log(`wrote marketing OG cards to ${outputDir}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
