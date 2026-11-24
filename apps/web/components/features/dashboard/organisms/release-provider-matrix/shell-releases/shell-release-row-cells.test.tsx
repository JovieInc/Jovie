import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { SmartLinkCell, WeeklyStreamsCell } from './shell-release-row-cells';

const release = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Lost in the Light',
  artistNames: ['Bahamas'],
  status: 'released',
  slug: 'lost-in-the-light',
  smartLinkPath: '/lost-in-the-light',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDurationMs: 214_000,
  releaseDate: '2026-06-15',
} satisfies ReleaseViewModel;

describe('shell-release-row-cells', () => {
  it('opens unlocked smart links in a new tab', () => {
    render(
      <SmartLinkCell
        release={release}
        smartLinkLockReason={null}
        smartLinkPath='/lost-in-the-light'
      />
    );
    const link = screen.getByRole('link', {
      name: 'Open smart link for Lost in the Light',
    });
    expect(link).toHaveAttribute('href', '/lost-in-the-light');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows locked smart-link state without a link', () => {
    render(
      <SmartLinkCell
        release={release}
        smartLinkLockReason='cap'
        smartLinkPath='/lost-in-the-light'
      />
    );
    expect(
      screen.getByRole('img', {
        name: 'Smart link locked (Pro) for Lost in the Light',
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('right-aligns weekly streams as a numeric app-table cell', () => {
    const { container } = render(
      <WeeklyStreamsCell weeklyStreams={12_400} />
    );
    const cell = container.querySelector('[data-app-table-cell="numeric"]');
    expect(cell).toBeTruthy();
    expect(cell?.className).toContain('justify-end');
    expect(screen.getByTestId('shell-release-weekly-streams')).toHaveTextContent(
      /\/ wk/
    );
  });
});
