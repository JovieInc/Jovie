import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { ReleaseCreditsSection } from './ReleaseCreditsSection';

vi.mock('./release-credits-action', () => ({
  fetchReleaseCreditsAction: vi.fn().mockResolvedValue([]),
}));

const creditGroups: SmartLinkCreditGroup[] = [
  {
    role: 'producer',
    label: 'Producer',
    entries: [
      {
        artistId: 'artist-1',
        name: 'Jane Producer',
        handle: 'janeproducer',
        role: 'producer',
        position: 0,
      },
    ],
  },
];

describe('ReleaseCreditsSection', () => {
  it('renders provided credit groups without fetching', () => {
    render(
      <ReleaseCreditsSection releaseId='rel-1' creditsGroups={creditGroups} />
    );

    expect(screen.getByTestId('release-credits-card')).toBeInTheDocument();
    expect(screen.getByText('Jane Producer')).toBeInTheDocument();
    expect(screen.getByText('Producer')).toBeInTheDocument();
  });

  it('renders nothing when only the main artist is credited', () => {
    const { container } = render(
      <ReleaseCreditsSection
        releaseId='rel-1'
        creditsGroups={[
          {
            role: 'main_artist',
            label: 'Main Artist',
            entries: [
              {
                artistId: 'artist-1',
                name: 'Main Artist',
                handle: 'main',
                role: 'main_artist',
                position: 0,
              },
            ],
          },
        ]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders flat variant without the surface card', () => {
    render(
      <ReleaseCreditsSection
        releaseId='rel-1'
        creditsGroups={creditGroups}
        variant='flat'
      />
    );

    expect(screen.getByTestId('release-credits-content')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-credits-card')
    ).not.toBeInTheDocument();
  });
});
