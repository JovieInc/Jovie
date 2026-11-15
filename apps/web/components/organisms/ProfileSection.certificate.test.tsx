import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ProfileSection } from './ProfileSection';

const artist = {
  id: 'artist-1',
  handle: 'jordanlee',
  name: 'Jordan Lee',
  tagline: 'Producer and DJ making late-night house records.',
  is_verified: false,
  owner_user_id: 'user-1',
  spotify_id: '',
  published: true,
  is_featured: false,
  created_at: '2026-01-01T00:00:00.000Z',
  marketing_opt_out: false,
} satisfies Artist;

describe('ProfileSection certificate', () => {
  it('renders the artist and caller actions axe-clean', async () => {
    const onListen = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ProfileSection artist={artist}>
        <button type='button' onClick={onListen}>
          Listen Now
        </button>
      </ProfileSection>
    );

    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Producer and DJ making late-night house records.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Listen Now' }));
    expect(onListen).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('prefers the caller subtitle over the tagline', async () => {
    const { container } = render(
      <ProfileSection artist={artist} subtitle='Live at the Hollywood Bowl' />
    );

    expect(screen.getByText('Live at the Hollywood Bowl')).toBeInTheDocument();
    expect(
      screen.queryByText('Producer and DJ making late-night house records.')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with no photo or tagline', async () => {
    const { container } = render(
      <ProfileSection artist={{ ...artist, tagline: undefined }} />
    );

    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ProfileSection artist={{ ...artist, name: 'ليلى حداد' }} />
      </div>
    );

    expect(screen.getAllByText('ليلى حداد').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
