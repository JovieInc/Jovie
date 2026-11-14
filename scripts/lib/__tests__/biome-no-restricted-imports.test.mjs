import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  biomeDiagnosticCategories,
  runBiomeOnRepoProbes,
} from '../biome-repo-probe.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function categoriesFor(name, text) {
  return biomeDiagnosticCategories(
    runBiomeOnRepoProbes(
      REPO_ROOT,
      [{ name, text }],
      ['check', '--reporter=json']
    )
  );
}

describe('Biome noRestrictedImports for simple-icons', () => {
  it('rejects a direct simple-icons import', () => {
    const cats = categoriesFor(
      'bad-icons.ts',
      "import { siSpotify } from 'simple-icons';\nexport const icon = siSpotify;\n"
    );
    expect(cats.join('\n')).toMatch(/lint\/style\/noRestrictedImports/);
  });

  it('accepts SocialIcon and lucide-react neighbors', () => {
    const cats = categoriesFor(
      'good-icons.ts',
      "import { Music } from 'lucide-react';\n" +
        "import { SocialIcon } from '@/components/atoms/SocialIcon';\n" +
        'export const Icon = Music;\n' +
        'export const Brand = SocialIcon;\n'
    );
    expect(cats.join('\n')).not.toMatch(/lint\/style\/noRestrictedImports/);
  });
});
