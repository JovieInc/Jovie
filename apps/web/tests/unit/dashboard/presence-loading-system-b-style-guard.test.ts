import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const sourcePath = 'app/app/(shell)/dashboard/presence/loading.tsx';

const forbiddenLocalChromePatterns = [
  /--linear-/,
  /color-mix\(/,
  /\b(?:bg|border|shadow)-\[/,
  /\b(?:bg|border)-\(--/,
  /\btransition-all\b/,
  /\b(?:translate|scale)-/,
] as const;

describe('presence loading skeleton System B source contract', () => {
  it('keeps skeleton chrome on named System B primitives', () => {
    const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

    for (const pattern of forbiddenLocalChromePatterns) {
      expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'bg-base',
      'border-subtle',
      'bg-surface-0',
      'animate-pulse',
      'h-full',
      'min-h-0',
      'overflow-hidden',
    ]) {
      expect(source).toContain(className);
    }

    expect(source).toContain("data-testid='presence-loading-skeleton'");
    expect(source).toContain("const CARD_KEYS = ['a', 'b', 'c'] as const");
  });
});
