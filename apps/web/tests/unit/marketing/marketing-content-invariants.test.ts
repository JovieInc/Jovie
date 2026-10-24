import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(file), 'utf8');

describe('marketing demo integrity regressions', () => {
  it('accounts for every click in the provider breakdown', () => {
    const source = read('lib/marketing/LinkAnalyticsSurface.tsx');
    const total = Number(source.match(/totalClicks:\s*(\d+)/)?.[1]);
    const providers = [...source.matchAll(/\bclicks:\s*(\d+)/g)].reduce(
      (sum, match) => sum + Number(match[1]),
      0
    );
    expect(providers).toBe(total);
  });

  it('does not define numeric demo metrics inline in marketing components', () => {
    expect(read('lib/marketing/LinkAnalyticsSurface.tsx')).not.toMatch(
      /\b(?:totalClicks|last7DaysClicks|clicks):\s*\d+/
    );
  });

  it('uses the canonical profile rather than a hand-built profile lookalike', () => {
    const source = read('components/features/home/ProfileMockup.tsx');
    expect(source).toMatch(/import[\s\S]*?ProfileCompactSurface/);
    expect(source).toMatch(/<ProfileCompactSurface\b/);
  });
});
