import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileMockup } from './ProfileMockup';
import { HOMEPAGE_PROFILE_PREVIEW_CATALOG } from './tim-white-catalog';

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: string }) => (
    <img alt={props.alt ?? ''} src={props.src ?? ''} />
  ),
}));

const DAY_MS = 86_400_000;

describe('ProfileMockup', () => {
  it('lists the real catalog with its artwork, not invented titles or blank tiles', () => {
    render(<ProfileMockup name='Tim White' handle='tim' />);

    const list = screen.getByRole('list', { name: 'Releases' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(HOMEPAGE_PROFILE_PREVIEW_CATALOG.length);
    HOMEPAGE_PROFILE_PREVIEW_CATALOG.forEach((release, index) => {
      const row = rows[index] as HTMLElement;
      expect(row).toHaveTextContent(release.title);
      const art = within(row).getByRole('img', { name: release.title });
      expect(art.getAttribute('src')).toBe(release.artworkUrl);
    });
    for (const stale of ['Signals', 'Where It Goes', 'Fading Light']) {
      expect(screen.queryByText(stale)).not.toBeInTheDocument();
    }
  });

  it('dates every release relative to now, newest first and never in the future', () => {
    const now = Date.now();
    const dates = HOMEPAGE_PROFILE_PREVIEW_CATALOG.map(release =>
      Date.parse(release.releaseDate)
    );
    for (const date of dates) {
      expect(date).toBeLessThan(now);
      // Recent catalog: within the last year, so the card never goes stale.
      expect(now - date).toBeLessThan(366 * DAY_MS);
    }
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it('is not cropped on phones', () => {
    const css = readFileSync(
      resolve(
        import.meta.dirname,
        '../../marketing/artist-profile/ArtistProfileLandingPage.css'
      ),
      'utf8'
    );
    const stageRules = css
      .split('}')
      .filter(rule => /system-b-launch-profile-stage\)\s*\{/.test(rule));
    expect(stageRules.length).toBeGreaterThan(0);
    for (const rule of stageRules) {
      expect(rule).not.toMatch(/max-height|overflow:\s*hidden/);
    }
  });

  it('renders server-formatted date labels verbatim so hydration never re-dates them', () => {
    // CI froze the client clock (page.clock) and React #418 fired when the
    // card recomputed dates on the client. Routes pass labels from the server.
    render(
      <ProfileMockup
        name='Tim White'
        releases={[
          {
            title: 'The Deep End',
            releaseType: 'Single',
            artworkUrl: '/img/releases/the-deep-end.jpg',
            dateLabel: 'Jan 2000',
          },
        ]}
      />
    );
    expect(screen.getByText(/Single · Jan 2000/)).toBeInTheDocument();
    const launch = readFileSync(
      resolve(import.meta.dirname, '../../../app/(marketing)/launch/page.tsx'),
      'utf8'
    );
    expect(launch).toContain('releases={PROFILE_RELEASES}');
  });
});
