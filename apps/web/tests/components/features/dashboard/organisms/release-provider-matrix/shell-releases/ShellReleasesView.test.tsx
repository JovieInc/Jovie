import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import type { ReleaseViewModel } from '@/lib/discography/types';

function fakeRelease(
  partial: Partial<ReleaseViewModel> & { id: string; title: string }
): ReleaseViewModel {
  return {
    profileId: 'p',
    artistNames: ['Bahamas'],
    status: 'released',
    artworkUrl: 'https://x.invalid/a.jpg',
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    smartLinkPath: `/${partial.title.toLowerCase().replace(/\s+/g, '-')}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...partial,
  } as ReleaseViewModel;
}

describe('ShellReleasesView', () => {
  it('renders one row per release with title + artist', () => {
    render(
      <ShellReleasesView
        releases={[
          fakeRelease({ id: '1', title: 'Lost in the Light' }),
          fakeRelease({
            id: '2',
            title: 'Take Me Over',
            artistNames: ['Other'],
          }),
        ]}
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows the empty state when there are no releases', () => {
    render(<ShellReleasesView releases={[]} />);
    expect(screen.getByText(/No releases yet/)).toBeInTheDocument();
  });

  it('toggles aria-selected on click', () => {
    render(
      <ShellReleasesView
        releases={[fakeRelease({ id: 'r1', title: 'Lost in the Light' })]}
      />
    );
    const row = screen.getByRole('option', { name: /Lost in the Light/ });
    expect(row).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-selected', 'false');
  });

  it('shows a count when filtered down', () => {
    render(
      <ShellReleasesView
        releases={[
          fakeRelease({ id: '1', title: 'Alpha' }),
          fakeRelease({ id: '2', title: 'Beta' }),
        ]}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
