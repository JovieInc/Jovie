import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ReleaseMetadata } from './ReleaseMetadata';
import type { Release } from './types';

function buildRelease(overrides: Partial<Release> = {}): Release {
  return {
    profileId: 'profile_1',
    id: 'release_1',
    title: 'Midnight Echo',
    status: 'released',
    releaseDate: '2025-06-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/artwork.jpg',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo--profile_1',
    spotifyPopularity: 72,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    upc: '123456789012',
    label: 'North Star Records',
    totalTracks: 1,
    totalDurationMs: 185000,
    primaryIsrc: 'USRC17607839',
    genres: ['Indie Pop'],
    canvasStatus: 'not_set',
    ...overrides,
  };
}

it('reveals metadata actions from the full row and keeps keyboard copy feedback visible', async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  const release = buildRelease();
  render(
    <TooltipProvider>
      <ReleaseMetadata release={release} />
    </TooltipProvider>
  );
  for (const [label, value] of [
    ['ISRC', release.primaryIsrc],
    ['UPC', release.upc],
    ['Label', release.label],
  ] as const) {
    const rowLabel = screen.getByText(label);
    const copy = screen.getByRole('button', { name: `Copy ${label}` });
    expect(rowLabel.parentElement).toHaveClass('group');
    expect(rowLabel.parentElement).toContainElement(copy);
    expect(copy.parentElement).toHaveClass(
      'group-hover:opacity-100',
      'group-focus-within:opacity-100'
    );
    await user.hover(rowLabel);
    await user.tab();
    expect(copy).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(value));
    await user.unhover(rowLabel);
    await waitFor(() => expect(copy.parentElement).toHaveClass('opacity-100'));
  }
  writeText.mockRestore();
});
