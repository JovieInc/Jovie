import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = 'app/(marketing)/changelog/page.tsx';
const SIGNUP = 'app/(marketing)/changelog/ChangelogEmailSignup.tsx';
const ARCHIVE = 'components/marketing/changelog/CustomerChangelogArchive.tsx';
const EDITORIAL_CSS = 'app/(marketing)/changelog/changelog-editorial.css';
const DAY_ROW_CSS = 'app/(marketing)/changelog/changelog-day-row.css';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('customer changelog IA contract', () => {
  it('keeps /changelog on customer outcomes instead of the release log', () => {
    const page = readWebSource(PAGE);
    const signup = readWebSource(SIGNUP);
    const archive = [
      readWebSource(ARCHIVE),
      readWebSource('components/marketing/changelog/ChangelogDayRow.tsx'),
    ].join('\n');

    expect(page).toContain(
      "title: documentTitle('Changelog: product updates and new features')"
    );
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain('marketing-type-display');
    // Customer words only: no pipeline vocabulary, no stale invitation CTA.
    expect(page).not.toContain('What shipped.');
    expect(page).not.toContain('source-backed');
    expect(page).not.toContain('deploy');
    expect(page).not.toContain('Request an Invite');
    expect(page).not.toContain('request-invite');
    expect(page).toContain('<MarketingFooterCta />');
    expect(page).not.toContain(
      'Follow our journey building the future of music'
    );
    expect(page).toContain('CustomerChangelogArchive');
    expect(page).not.toContain('ChangelogTimeline');

    expect(signup).toContain('Get updates');
    expect(signup).not.toContain('Stay in the loop');
    expect(signup).not.toContain('changelog-reveal-button');
    expect(signup).toContain('InlineSubscribe');

    expect(archive).toContain('Load earlier updates');
    expect(archive).not.toContain('Show 5');
    expect(archive).not.toContain('Showing');
    expect(archive).not.toContain('Technical details');
    expect(archive).toContain('Fixes and polish');
    // One entry, told once: no placeholder label or second card repeating
    // the announcement; real media only via the projected media contract.
    expect(archive).not.toContain('Product update');
    expect(archive).not.toContain('changelog-entry__card');
    expect(archive).not.toContain('changelog-entry-media--');
    expect(archive).toContain('entry.media');
    expect(archive).not.toContain('gradient');

    const editorialCss = [
      readWebSource(EDITORIAL_CSS),
      readWebSource(DAY_ROW_CSS),
    ].join('\n');
    // Day rows: a sticky date rail beside one reading column, pinned under
    // the fixed marketing header.
    expect(editorialCss).toMatch(
      /\.changelog-day\s*\{[^}]*grid-template-columns: minmax\(10\.5rem, 1fr\) minmax\(0, 45rem\) minmax\(\s*0,\s*1fr\s*\);/
    );
    expect(editorialCss).toMatch(
      /\.changelog-day__rail\s*\{\s*position: sticky;\s*top: calc\(var\(--public-shell-header-offset\) \+ var\(--space-6\)\);/
    );
    // Token discipline: no raw colour values in the changelog stylesheet.
    expect(editorialCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('does not wire deploy-time customer email from the public page', () => {
    const page = readWebSource(PAGE);
    const signup = readWebSource(SIGNUP);

    expect(page).not.toContain('changelog:send');
    expect(page).not.toContain('send-changelog-email');
    expect(signup).toContain('/api/changelog/subscribe');
    expect(signup).not.toContain('changelog:send');
  });
});
