// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IngestedSuggestions } from './IngestedSuggestions';
import type { SuggestedLink } from './hooks/useSuggestions';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

const suggestion: SuggestedLink = {
  platform: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '#1ED760',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  normalizedUrl: 'https://open.spotify.com/artist/demo',
  originalUrl: 'https://open.spotify.com/artist/demo',
  suggestedTitle: 'Spotify',
  isValid: true,
  suggestionId: 'sug-1',
};

describe('IngestedSuggestions', () => {
  it('dismisses a suggestion from the control IconButton', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <IngestedSuggestions
        suggestions={[suggestion]}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        profileId='profile-1'
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Spotify suggestion' })
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
