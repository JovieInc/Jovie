import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-9625: a synthetic-tagged smartlink click (canary passage token, scope
 * smartlink_click) must be excluded from every user-facing analytics
 * aggregate and count. The exclusion predicate is `is_bot = false`, which the
 * capture path guarantees for synthetic clicks via classifySyntheticClick
 * (lib/synthetic/smartlink-click.ts). This contract test pins that predicate
 * in every user-facing click_events aggregate so the synthetic path cannot
 * silently start counting.
 */

const WEB_ROOT = join(__dirname, '..', '..', '..');

function readWeb(relative: string): string {
  return readFileSync(join(WEB_ROOT, relative), 'utf8');
}

/** User-facing click analytics surfaces that aggregate click_events. */
const USER_FACING_CLICK_AGGREGATES = [
  'lib/db/queries/analytics.ts',
  'lib/analytics/metrics.ts',
  'lib/services/insights/data-aggregator.ts',
  'lib/metrics/artist-revenue-cohorts.ts',
  'app/app/(shell)/dashboard/actions/link-clicks.ts',
  'app/api/dashboard/releases/[releaseId]/analytics/route.ts',
] as const;

describe('synthetic smartlink click exclusion contract', () => {
  it.each(USER_FACING_CLICK_AGGREGATES)(
    '%s excludes bot-classified clicks from user-facing aggregates',
    relative => {
      const source = readWeb(relative);
      expect(source, `${relative} must aggregate click_events`).toMatch(
        /click[_ ]?events/i
      );
      expect(
        source,
        `${relative} must filter on the is_bot exclusion predicate`
      ).toMatch(/is_?bot[^\n]{0,60}false/i);
    }
  );

  it('the capture path tags passage-granted clicks synthetic and bots them', () => {
    const source = readWeb('app/api/track/route.ts');
    expect(source).toContain('resolveSyntheticPassageToken(');
    expect(source).toContain("'smartlink_click'");
    expect(source).toContain('classifySyntheticClick(');
    expect(source).toContain('metadata.synthetic = SYNTHETIC_CLICK_TAG');
    expect(source).toContain('isBot: clickClassification.isBot');
    expect(
      source,
      'synthetic clicks must not write daily profile views'
    ).toContain('!clickClassification.isBot');
  });

  it('synthetic clicks never inflate the public social link click counter', () => {
    const source = readWeb('app/api/track/route.ts');
    expect(
      source,
      'the socialLinks.clicks increment must stay gated off synthetic clicks'
    ).toContain(
      "linkType === 'social' && linkId && !clickClassification.synthetic"
    );
  });

  it('the certification spec proves the tag end to end', () => {
    const source = readWeb('tests/e2e/prod-cert-start-chat.spec.ts');
    expect(source).toContain("scp: 'smartlink_click'");
    expect(source).toContain('[PASSAGE_TOKEN_HEADER]: clickToken');
    expect(source).toContain("metadata ->> 'synthetic'");
    expect(source).toContain("synthetic !== 'prodcert'");
  });
});
