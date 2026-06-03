import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath = 'app/(marketing)/download/page.tsx';

const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white)-(?:[0-9]|\[|\/)/,
] as const;

describe('download page System B source contract', () => {
  it('keeps download page visuals on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

    for (const pattern of forbiddenVisualPatterns) {
      expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
    }
  });
});
