import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistProfileAdaptiveSection } from '@/components/marketing/artist-profile/ArtistProfileAdaptiveSection';
import { ArtistProfileHeroAdaptiveIntro } from '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

describe('ArtistProfileAdaptiveSection', () => {
  it('renders the single canonical feature-split body with its Pen contract root', () => {
    const { container } = render(
      <ArtistProfileAdaptiveSection adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    const root = container.querySelector(
      `[data-pen-contract="${MARKETING_PEN_CONTRACT_IDS.section.featureSplit}"]`
    );
    expect(root).not.toBeNull();
    expect(root?.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('id', 'adaptive');

    expect(
      screen.getAllByTestId('artist-profile-adaptive-sequence')
    ).toHaveLength(1);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('is mounted exactly once by the route intro composition', () => {
    render(
      <ArtistProfileHeroAdaptiveIntro
        hero={ARTIST_PROFILE_COPY.hero}
        adaptive={ARTIST_PROFILE_COPY.adaptive}
      />
    );

    expect(
      screen.getAllByTestId('artist-profile-adaptive-sequence')
    ).toHaveLength(1);
    expect(screen.getAllByRole('tab', { name: 'Pre-save' })).toHaveLength(1);
  });
});
