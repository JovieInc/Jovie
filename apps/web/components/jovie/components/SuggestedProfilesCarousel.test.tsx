import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { SuggestedProfilesCarousel } from './SuggestedProfilesCarousel';

const baseSuggestion: ProfileSuggestion = {
  id: 'sug-1',
  type: 'dsp_match',
  platform: 'spotify',
  platformLabel: 'Spotify',
  title: 'DJ Example',
  subtitle: 'Spotify artist profile',
  imageUrl: null,
  externalUrl: null,
  confidence: 0.9,
};

function renderCarousel(
  overrides: Partial<
    React.ComponentProps<typeof SuggestedProfilesCarousel>
  > = {}
) {
  return render(
    <SuggestedProfilesCarousel
      suggestions={[baseSuggestion]}
      isLoading={false}
      currentIndex={0}
      total={1}
      next={vi.fn()}
      prev={vi.fn()}
      confirm={vi.fn()}
      reject={vi.fn()}
      isActioning={false}
      {...overrides}
    />
  );
}

describe('SuggestedProfilesCarousel', () => {
  it('renders nothing while loading or when there are no suggestions', () => {
    const { container: loading } = renderCarousel({ isLoading: true });
    expect(loading).toBeEmptyDOMElement();

    const { container: empty } = renderCarousel({ suggestions: [], total: 0 });
    expect(empty).toBeEmptyDOMElement();
  });

  it('renders canonical confirm/reject actions for a suggestion', () => {
    renderCarousel();
    expect(
      screen.getByRole('button', { name: /that's me/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /not me/i })).toBeInTheDocument();
  });

  it('disables all actions while an action is pending', () => {
    renderCarousel({ isActioning: true });
    expect(screen.getByRole('button', { name: /that's me/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /not me/i })).toBeDisabled();
  });

  it('disables previous/next at the carousel bounds', () => {
    renderCarousel({
      suggestions: [baseSuggestion, { ...baseSuggestion, id: 'sug-2' }],
      total: 2,
      currentIndex: 0,
    });
    expect(
      screen.getByRole('button', { name: 'Previous Suggestion' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Next Suggestion' })
    ).toBeEnabled();
  });
});
