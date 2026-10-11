import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Marketing headline line-clamp guard (JOV-6906).
 *
 * A hero or section heading must never truncate its value proposition.
 * `line-clamp-*` on an <h1>/<h2> inside the marketing surface clips real
 * copy: it cut "Automatically." off the /artist-notifications hero and
 * "Questions" off the shared FaqSection heading.
 *
 * Why a ratchet and not zero-tolerance: pre-existing h1/h2 clamps are
 * grandfathered in HEADLINE_CLAMP_BASELINE (file -> count). The baseline
 * may only shrink — new clamped headings fail CI, removals pass. When you
 * remove one, lower its count here in the same PR.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/marketing → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');

const SCAN_DIRS = ['components/marketing', join('app', '(marketing)')] as const;

const HEADLINE_TAG = /<h[12][\s\S]*?>/g;
const CLAMP = /\bline-clamp-\d/;

const HEADLINE_CLAMP_BASELINE: Readonly<Record<string, number>> = {
  'components/marketing/CliLandingPage.tsx': 3,
  'components/marketing/MarketingBentoSection.tsx': 1,
  'components/marketing/MarketingHero.tsx': 1,
  'components/marketing/MarketingPosterHero.tsx': 1,
  'components/marketing/MarketingSectionIntro.tsx': 1,
  'components/marketing/NumberedSection.tsx': 1,
  'components/marketing/artist-profile/ArtistProfileModeSwitcher.tsx': 1,
  'components/marketing/artist-profile/ArtistProfileMonetizationSection.tsx': 1,
  'components/marketing/artist-profile/ArtistProfileOpinionatedSection.tsx': 1,
  'components/marketing/artist-profile/ArtistProfileOutcomeDuo.tsx': 1,
  'components/marketing/changelog/ChangelogTimeline.tsx': 1,
  'components/marketing/engineering/EngineeringPublication.tsx': 3,
  'components/marketing/friday-rhythm-section.tsx': 1,
  'components/marketing/go-live-in-sixty-section.tsx': 1,
  'components/marketing/homepage-v2/HomepageV2Ctas.tsx': 1,
  'components/marketing/homepage-v2/HomepageV2Route.tsx': 2,
  [join('app', '(marketing)', 'ai', 'page.tsx')]: 7,
  [join('app', '(marketing)', 'alternatives', '[slug]', 'page.tsx')]: 4,
  [join('app', '(marketing)', 'alternatives', 'page.tsx')]: 2,
  [join('app', '(marketing)', 'api-versioning', 'page.tsx')]: 4,
  [join('app', '(marketing)', 'blog', 'BlogFeed.tsx')]: 2,
  [join('app', '(marketing)', 'blog', 'components', 'BlogAuthorCard.tsx')]: 1,
  [join('app', '(marketing)', 'blog', 'components', 'BlogRelatedPosts.tsx')]: 1,
  [join('app', '(marketing)', 'changelog', 'ChangelogEmailSignup.tsx')]: 1,
  [join('app', '(marketing)', 'changelog', '[version]', 'page.tsx')]: 2,
  [join('app', '(marketing)', 'changelog', 'page.tsx')]: 1,
  [join('app', '(marketing)', 'compare', 'page.tsx')]: 2,
  [join('app', '(marketing)', 'developers', 'page.tsx')]: 5,
  [join('app', '(marketing)', 'download', 'page.tsx')]: 1,
  [join('app', '(marketing)', 'instant-merch', 'InstantMerchLanding.tsx')]: 3,
  [join('app', '(marketing)', 'launch', 'page.tsx')]: 1,
  [join('app', '(marketing)', 'not-found.tsx')]: 1,
  [join('app', '(marketing)', 'product', 'ProductLanding.tsx')]: 1,
  [join('app', '(marketing)', 'renders', '[state]', 'page.tsx')]: 1,
  [join('app', '(marketing)', 'renders', 'page.tsx')]: 2,
  [join('app', '(marketing)', 'smart-links', 'SmartLinksLanding.tsx')]: 4,
  [join('app', '(marketing)', 'support', 'SupportContent.tsx')]: 2,
  [join(
    'app',
    '(marketing)',
    'youtube-thumbnails',
    'YoutubeThumbnailsLanding.tsx'
  )]: 4,
};

function collectClampedHeadlineCounts(): Map<string, number> {
  const counts = new Map<string, number>();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const filePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
      } else if (
        entry.name.endsWith('.tsx') &&
        !entry.name.includes('.test.')
      ) {
        const source = readFileSync(filePath, 'utf8');
        const clamped = source
          .match(HEADLINE_TAG)
          ?.filter(tag => CLAMP.test(tag)).length;
        if (clamped) {
          counts.set(relative(WEB_ROOT, filePath), clamped);
        }
      }
    }
  };

  for (const scanDir of SCAN_DIRS) {
    walk(join(WEB_ROOT, scanDir));
  }
  return counts;
}

describe('marketing headline line-clamp guard', () => {
  it('flags line-clamp-* on h1/h2 tags (deliberate-red fixture)', () => {
    expect(
      `<h2 className='system-b-marketing-section-heading line-clamp-2'>`.match(
        HEADLINE_TAG
      )?.[0]
    ).toMatch(CLAMP);
    expect(
      `<h1 className={cn('hero-title', 'line-clamp-3')}>`.match(
        HEADLINE_TAG
      )?.[0]
    ).toMatch(CLAMP);
    expect(
      `<h1 className='system-b-artist-notifications-hero-title'>`.match(
        HEADLINE_TAG
      )?.[0]
    ).not.toMatch(CLAMP);
    expect(
      `<p className='line-clamp-2'>`.match(HEADLINE_TAG)?.[0]
    ).toBeUndefined();
  });

  it('keeps repaired shared owners free of clamped headings', () => {
    const counts = collectClampedHeadlineCounts();
    expect(counts.has('components/marketing/FaqSection.tsx')).toBe(false);
    expect(
      counts.has(
        'components/marketing/artist-profile/ArtistProfileSectionHeader.tsx'
      )
    ).toBe(false);
    expect(
      counts.has(
        'components/marketing/artist-notifications/ArtistNotificationsHero.tsx'
      )
    ).toBe(false);
  });

  it('does not add new clamped h1/h2 beyond the shrink-only baseline', () => {
    const counts = collectClampedHeadlineCounts();
    const violations: string[] = [];

    for (const [file, count] of counts) {
      const baseline = HEADLINE_CLAMP_BASELINE[file] ?? 0;
      if (count > baseline) {
        violations.push(
          `${file}: ${count} clamped heading(s) > baseline ${baseline}`
        );
      }
    }
    for (const file of Object.keys(HEADLINE_CLAMP_BASELINE)) {
      if (!counts.has(file)) {
        violations.push(
          `${file}: baseline entry is stale — the clamp was removed, lower the baseline`
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
