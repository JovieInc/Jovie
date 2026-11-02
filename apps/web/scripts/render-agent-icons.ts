#!/usr/bin/env tsx
/** Renders the 48, 64, 512 and 1024 px listing icons into the gitignored output dir. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIconSource, renderIcons } from '@/lib/agent-distribution/icons';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const source = await loadIconSource(resolve(WEB, '../..'));
  if (!source) throw new Error('Canonical mark or design tokens not found');
  const out = join(WEB, '.agent-distribution-out/icons');
  for (const icon of await renderIcons(source, out))
    process.stdout.write(
      `${icon.file} ${icon.width}x${icon.height} ${icon.sha256}\n`
    );
  return 0;
}

main().then(
  code => process.exit(code),
  error => {
    console.error(String(error));
    process.exit(2);
  }
);
