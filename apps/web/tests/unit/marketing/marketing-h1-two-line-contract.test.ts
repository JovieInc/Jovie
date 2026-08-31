import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(webRoot, '../..');

describe('marketing H1 two-visual-line contract', () => {
  it('covers both public shells and every shared marketing hero owner', () => {
    const globals = readFileSync(path.join(webRoot, 'app/globals.css'), 'utf8');
    const posterHero = readFileSync(
      path.join(webRoot, 'components/marketing/MarketingPosterHero.tsx'),
      'utf8'
    );
    const marketingHero = readFileSync(
      path.join(webRoot, 'components/marketing/MarketingHero.tsx'),
      'utf8'
    );
    const appPlaywrightConfig = readFileSync(
      path.join(webRoot, 'playwright.config.ts'),
      'utf8'
    );
    const ciWorkflow = readFileSync(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      'utf8'
    );

    expect(globals).toMatch(
      /\.marketing-h1-max-two-lines,[\s\S]*?:where\(\.home-viewport, \.system-b-marketing\) :where\(h1:not\(\.sr-only\)\)[\s\S]*?overflow: hidden;[\s\S]*?-webkit-line-clamp: 2;/
    );
    expect(globals).not.toContain(
      ':where(.home-viewport, .system-b-marketing) h1:not(.sr-only)'
    );
    expect(posterHero.match(/marketing-h1-max-two-lines/g)).toHaveLength(1);
    expect(marketingHero.match(/marketing-h1-max-two-lines/g)).toHaveLength(2);
    expect(posterHero).not.toContain('aria-label=');
    expect(appPlaywrightConfig).toContain("'**/storybook-*.spec.ts'");
    expect(ciWorkflow).toContain('tests/e2e/storybook-marketing-h1.spec.ts');
  });
});
