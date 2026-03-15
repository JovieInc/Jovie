import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createRightMetaCellRenderer } from '@/components/dashboard/organisms/release-provider-matrix/utils/column-renderers';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/dashboard/organisms/releases/cells', () => ({
  SmartLinkCell: ({ release }: { release: ReleaseViewModel }) => (
    <span data-testid='smart-link-cell'>{release.smartLinkPath}</span>
  ),
  PopularityIcon: ({ popularity }: { popularity: number | null }) => (
    <span data-testid='popularity-icon'>{popularity ?? 'none'}</span>
  ),
  AvailabilityCell: () => null,
  PopularityCell: () => null,
  ReleaseCell: () => null,
}));

const baseRelease: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-06-15',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: 67,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

describe('createRightMetaCellRenderer', () => {
  it('renders compact right lane classes and the release year', () => {
    const Renderer = createRightMetaCellRenderer();
    const { container } = render(
      <Renderer
        row={{ original: baseRelease } as never}
        getValue={vi.fn() as never}
        table={{} as never}
        column={{} as never}
        cell={{} as never}
        renderValue={vi.fn() as never}
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('min-w-[252px]');
    expect(wrapper.className).toContain(
      'grid-cols-[minmax(168px,1fr)_12px_34px]'
    );
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('gracefully falls back to em dash when the year cannot be parsed', () => {
    const Renderer = createRightMetaCellRenderer();
    render(
      <Renderer
        row={{ original: { ...baseRelease, releaseDate: undefined } } as never}
        getValue={vi.fn() as never}
        table={{} as never}
        column={{} as never}
        cell={{} as never}
        renderValue={vi.fn() as never}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
