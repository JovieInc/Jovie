import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath =
  'components/marketing/artist-notifications/ArtistNotificationsHero.tsx';

const gradientPattern = ['linear', 'gradient|radial', 'gradient'].join('-');

const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  new RegExp(gradientPattern),
  /\b(?:bg|border|text|ring|shadow)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb|top|left|inset|translate)-\[/,
] as const;

describe('artist notifications hero System B source contract', () => {
  it('keeps fixed hero visuals on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

    for (const pattern of forbiddenVisualPatterns) {
      expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
    }
  });
});
