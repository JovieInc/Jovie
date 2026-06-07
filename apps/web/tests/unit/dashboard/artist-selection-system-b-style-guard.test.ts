import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const sourcePath =
  'components/features/dashboard/organisms/artist-selection-form/ArtistSelectionForm.tsx';
const sourceFile = resolve(appRoot, sourcePath);

const forbiddenDecorativeAccentPatterns = [
  /Gradient orbs/i,
  /\bbg-gradient-to-r\b/,
  /\bfrom-purple-500\b/,
  /\bto-blue-500\b/,
  /\bfrom-blue-500\b/,
  /\bto-cyan-500\b/,
  /\bblur-3xl\b/,
] as const;

describe('ArtistSelectionForm System B source contract', () => {
  it('does not use decorative accent orbs behind the central artist action', () => {
    const source = readFileSync(sourceFile, 'utf8');

    for (const pattern of forbiddenDecorativeAccentPatterns) {
      expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
    }

    expect(source).toContain('absolute inset-0 grid-bg dark:grid-bg-dark');
    expect(source).toContain("variant='primary'");
    expect(source).toContain("variant='secondary'");
  });
});
