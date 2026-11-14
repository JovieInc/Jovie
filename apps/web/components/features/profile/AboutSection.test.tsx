import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import { AboutSection } from './AboutSection';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

describe('AboutSection', () => {
  it('renders selected credits and booking/contact entries when provided', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        creditSegments={[
          {
            type: 'text',
            text: "Tim White's credited collaborators include ",
          },
          {
            type: 'artist',
            text: 'Guest Vocalist',
            href: '/guestvocalist',
          },
          { type: 'text', text: ' on "' },
          {
            type: 'release',
            text: 'Neon Circuit',
            href: '/timwhite/neon-circuit',
          },
          { type: 'text', text: '".' },
        ]}
        contacts={[bookingContact]}
      />
    );

    const credits = screen.getByTestId('profile-about-credits');
    expect(credits).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Guest Vocalist' })
    ).toHaveAttribute('href', '/guestvocalist');
    expect(screen.getByRole('link', { name: 'Neon Circuit' })).toHaveAttribute(
      'href',
      '/timwhite/neon-circuit'
    );

    const contacts = screen.getByTestId('profile-about-contacts');
    expect(contacts).toBeVisible();
    expect(screen.getByRole('link', { name: /Booking/ })).toHaveAttribute(
      'href',
      '/timwhite?mode=contact'
    );
  });

  it('omits credits and contact blocks on sparse profiles', () => {
    render(<AboutSection artist={PROFILE_STORY_ARTIST} contacts={[]} />);

    expect(screen.queryByTestId('profile-about-credits')).toBeNull();
    expect(screen.queryByTestId('profile-about-contacts')).toBeNull();
  });

  it('renders one row per contact role and wraps credits for prose links', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        creditSegments={[{ type: 'text', text: 'Credits.' }]}
        contacts={[
          { ...bookingContact, id: 'brand-1', roleLabel: 'Brand partnerships' },
          {
            ...bookingContact,
            id: 'brand-2',
            roleLabel: 'Brand partnerships',
            companyLabel: 'Maverick',
          },
        ]}
      />
    );

    expect(
      screen.getAllByRole('link', { name: /Brand partnerships/ })
    ).toHaveLength(1);
    expect(screen.getByText('Maverick')).toBeVisible();
    expect(screen.getByTestId('profile-about-credits')).toHaveClass(
      'profile-about-credits'
    );
  });

  it('skips contacts with no reachable channel', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        contacts={[{ ...bookingContact, channels: [] }]}
      />
    );

    expect(screen.queryByTestId('profile-about-contacts')).toBeNull();
  });
});

describe('AboutSection text contrast contract (JOV-8873)', () => {
  it('raises muted copy to white/50', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const webRoot = process.cwd().endsWith('/apps/web')
      ? process.cwd()
      : resolve(process.cwd(), 'apps/web');
    const source = readFileSync(
      resolve(webRoot, 'components/features/profile/AboutSection.tsx'),
      'utf8'
    );
    expect(source).toContain('text-sm font-book text-white/50');
    expect(source).not.toContain('text-white/40');
  });

  it('styles credit mentions with the prose link treatment', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const webRoot = process.cwd().endsWith('/apps/web')
      ? process.cwd()
      : resolve(process.cwd(), 'apps/web');
    const css = readFileSync(
      resolve(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    expect(css).toMatch(
      /\.profile-about-credits \.profile-entity-mention \{\s*color: var\(--color-text-tooltip\);/
    );
  });
});
