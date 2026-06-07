import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const homeComponentsRoot = path.resolve(
  __dirname,
  '../../../components/features/home'
);

const removedLegacyActionFiles = [
  'ArtistSearch.tsx',
  'FeatureFlaggedArtistSearch.tsx',
  'WaitlistLink.tsx',
] as const;

const forbiddenDeadActionPatterns = [
  /from-purple-600\s+to-pink-600/,
  /hover:from-purple-700\s+hover:to-pink-700/,
  /bg-blue-600\s+hover:bg-blue-700\s+dark:bg-purple-600\s+dark:hover:bg-purple-700/,
  /function\s+(?:ArtistSearch|FeatureFlaggedArtistSearch|WaitlistLink)\b/,
  /from\s+['"]\.\/(?:ArtistSearch|FeatureFlaggedArtistSearch|WaitlistLink)['"]/,
] as const;

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir).map(entry => path.join(dir, entry));

  return entries.flatMap(entry => {
    if (statSync(entry).isDirectory()) return collectSourceFiles(entry);
    return /\.(ts|tsx|css)$/.test(entry) ? [entry] : [];
  });
}

describe('dead homepage action cleanup', () => {
  it('does not keep orphaned pre-System-B home CTA components around', () => {
    for (const file of removedLegacyActionFiles) {
      expect(existsSync(path.join(homeComponentsRoot, file)), file).toBe(false);
    }
  });

  it('keeps dead accent-filled central action recipes out of home features', () => {
    const sources = collectSourceFiles(homeComponentsRoot)
      .map(file => readFileSync(file, 'utf8'))
      .join('\n');

    for (const pattern of forbiddenDeadActionPatterns) {
      expect(sources, `home features leaked ${pattern}`).not.toMatch(pattern);
    }
  });
});
