import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = 'components/shell/ShellDropdown.tsx';

const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|font|text|ring|shadow)-\[/,
  /\b(?:h|w|max-h|max-w|min-h|min-w|rounded|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white)-(?:[0-9]|\[|\/)/,
] as const;

describe('ShellDropdown System B source contract', () => {
  it('keeps dropdown chrome on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), SOURCE_PATH), 'utf8');

    for (const pattern of forbiddenVisualPatterns) {
      expect(source, `${SOURCE_PATH} matched ${pattern}`).not.toMatch(pattern);
    }
  });
});
