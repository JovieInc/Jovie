import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LINK_ANALYTICS_DEMO,
  LINK_ANALYTICS_DEMO_DAYS,
} from '@/data/marketing/link-analytics-demo';

const read = (file: string) => readFileSync(resolve(file), 'utf8');

describe('marketing demo integrity regressions', () => {
  it('accounts for every click in the provider breakdown', () => {
    const providers = LINK_ANALYTICS_DEMO.providerClicks.reduce(
      (sum, provider) => sum + provider.clicks,
      0
    );
    expect(providers).toBe(LINK_ANALYTICS_DEMO.totalClicks);
    expect(
      LINK_ANALYTICS_DEMO_DAYS.reduce((sum, day) => sum + day.clicks, 0)
    ).toBe(LINK_ANALYTICS_DEMO.totalClicks);
    expect(
      LINK_ANALYTICS_DEMO_DAYS.slice(-7).reduce(
        (sum, day) => sum + day.clicks,
        0
      )
    ).toBe(LINK_ANALYTICS_DEMO.last7DaysClicks);
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
