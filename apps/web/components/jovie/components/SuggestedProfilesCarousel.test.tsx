/**
 * Covers the JOV-6774 DS-drift conversion of the profile-ready card's
 * Dismiss control onto the canonical IconButton: accessible name and click
 * behavior must stay intact.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { SuggestedProfilesCarousel } from './SuggestedProfilesCarousel';

const profileReadySuggestion: ProfileSuggestion = {
  id: 'profile-ready-1',
  type: 'profile_ready',
  platform: 'jovie',
  platformLabel: 'Jovie',
  title: 'Your profile is live',
  subtitle: '',
  imageUrl: null,
  externalUrl: null,
  confidence: null,
};

describe('SuggestedProfilesCarousel', () => {
  it('renders the Dismiss control with its accessible name', () => {
    render(
      <SuggestedProfilesCarousel
        suggestions={[profileReadySuggestion]}
        isLoading={false}
        currentIndex={0}
        total={1}
        next={vi.fn()}
        prev={vi.fn()}
        confirm={vi.fn()}
        reject={vi.fn()}
        isActioning={false}
        username='artist'
        displayName='Test Artist'
        avatarUrl={null}
      />
    );

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('calls reject when the Dismiss control is clicked', async () => {
    const user = userEvent.setup();
    const reject = vi.fn();

    render(
      <SuggestedProfilesCarousel
        suggestions={[profileReadySuggestion]}
        isLoading={false}
        currentIndex={0}
        total={1}
        next={vi.fn()}
        prev={vi.fn()}
        confirm={vi.fn()}
        reject={reject}
        isActioning={false}
        username='artist'
        displayName='Test Artist'
        avatarUrl={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(reject).toHaveBeenCalledTimes(1);
  });

  it('disables the Dismiss control while an action is in flight', () => {
    render(
      <SuggestedProfilesCarousel
        suggestions={[profileReadySuggestion]}
        isLoading={false}
        currentIndex={0}
        total={1}
        next={vi.fn()}
        prev={vi.fn()}
        confirm={vi.fn()}
        reject={vi.fn()}
        isActioning
        username='artist'
        displayName='Test Artist'
        avatarUrl={null}
      />
    );

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
  });
});
