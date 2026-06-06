import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../../..');
const alertGrowthLandingSourcePath =
  'components/features/alerts/AlertGrowthLanding.tsx';

const forbiddenActionPatterns = [
  /bg-accent/,
  /text-on-accent/,
  /text-accent-foreground/,
  /border-accent/,
  /--linear-accent/,
  /\bbg-(?:blue|purple|violet|indigo)-\d/,
] as const;

describe('AlertGrowthLanding System B source contract', () => {
  it('keeps public alerts capture actions neutral instead of accent-filled', () => {
    const source = readFileSync(
      resolve(appRoot, alertGrowthLandingSourcePath),
      'utf8'
    );

    for (const pattern of forbiddenActionPatterns) {
      expect(
        source,
        `${alertGrowthLandingSourcePath} leaked ${pattern}`
      ).not.toMatch(pattern);
    }

    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain('hover:bg-btn-primary-hover');
  });

  it('keeps channel selection on neutral surfaces', () => {
    const source = readFileSync(
      resolve(appRoot, alertGrowthLandingSourcePath),
      'utf8'
    );

    expect(source).toContain('border-default bg-surface-1');
    expect(source).toContain('border-subtle bg-surface-0');
  });
});
