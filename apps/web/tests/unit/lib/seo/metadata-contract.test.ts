import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import {
  collectSeoRatchetRegressions,
  collectSeoTagViolations,
  extractSeoTagPresence,
} from '@/lib/seo/metadata-contract';

const FULL_METADATA: Metadata = {
  title: 'Test Page',
  description: 'Test description',
  alternates: { canonical: 'https://jov.ie/test' },
  openGraph: {
    title: 'OG Title',
    description: 'OG description',
    url: 'https://jov.ie/test',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Twitter title',
  },
};

describe('metadata-contract', () => {
  it('extractSeoTagPresence marks all tags present on full metadata', () => {
    const presence = extractSeoTagPresence(FULL_METADATA);
    expect(presence).toEqual({
      title: true,
      description: true,
      canonical: true,
      openGraphTitle: true,
      openGraphDescription: true,
      openGraphUrl: true,
      openGraphType: true,
      twitterCard: true,
      twitterTitle: true,
    });
  });

  it('collectSeoTagViolations reports missing tags with remediation hints', () => {
    const presence = extractSeoTagPresence({ title: 'Only title' });
    const violations = collectSeoTagViolations(presence, 'test-route');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join('\n')).toMatch(/canonical/);
    expect(violations.join('\n')).toMatch(/alternates\.canonical/);
  });

  it('collectSeoRatchetRegressions detects baseline regressions only', () => {
    const baseline = extractSeoTagPresence(FULL_METADATA);
    const current = extractSeoTagPresence({
      ...FULL_METADATA,
      twitter: undefined,
    });
    const regressions = collectSeoRatchetRegressions(
      'test-route',
      baseline,
      current
    );
    expect(regressions).toHaveLength(2);
    expect(regressions.join('\n')).toMatch(/twitterCard/);
    expect(regressions.join('\n')).toMatch(/twitterTitle/);
  });
});
