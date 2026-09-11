import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function runBiome(file) {
  return spawnSync(
    'pnpm',
    ['exec', 'biome', 'check', '--reporter=json', file],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );
}

function categories(result) {
  const raw = `${result.stdout ?? ''}`;
  const start = raw.indexOf('{');
  if (start < 0) return [];
  const report = JSON.parse(raw.slice(start));
  return (report.diagnostics ?? []).map(item => item.category);
}

describe('Biome noRestrictedImports for simple-icons', () => {
  it('rejects a direct simple-icons import', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biome-simple-icons-red-'));
    try {
      const file = join(dir, 'bad-icons.ts');
      writeFileSync(
        file,
        "import { siSpotify } from 'simple-icons';\nexport const icon = siSpotify;\n"
      );
      const cats = categories(runBiome(file));
      expect(cats.join('\n')).toMatch(/lint\/style\/noRestrictedImports/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts SocialIcon and lucide-react neighbors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biome-simple-icons-ok-'));
    try {
      const file = join(dir, 'good-icons.ts');
      writeFileSync(
        file,
        "import { Music } from 'lucide-react';\n" +
          "import { SocialIcon } from '@/components/atoms/SocialIcon';\n" +
          'export const Icon = Music;\n' +
          'export const Brand = SocialIcon;\n'
      );
      const cats = categories(runBiome(file));
      expect(cats.join('\n')).not.toMatch(/lint\/style\/noRestrictedImports/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
