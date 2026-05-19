import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MobileReleaseList } from '@/features/dashboard/organisms/release-provider-matrix/MobileReleaseList';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/atoms/SwipeToReveal', () => ({
  SwipeToReveal: ({
    children,
    actions,
  }: {
    children: ReactNode;
    actions: ReactNode;
  }) => (
    <div>
      {children}
      <div>{actions}</div>
    </div>
  ),
  SwipeToRevealGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
}));

function createRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Summer Lights',
    artistNames: ['Jovie Artist'],
    slug: 'summer-lights',
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
    ...overrides,
  };
}

describe('MobileReleaseList', () => {
  it('renders grouped year sections including the unknown-year fallback', () => {
    render(
      <MobileReleaseList
        releases={[
          createRelease(),
          createRelease({
            id: 'release-2',
            title: 'No Date Release',
            slug: 'no-date-release',
            releaseDate: undefined,
          }),
        ]}
        artistName='Jovie Artist'
        onEdit={vi.fn()}
        groupByYear
      />
    );

    expect(screen.getByTestId('mobile-release-list')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-release-group-2026')).toBeInTheDocument();
    expect(
      screen.getByTestId('mobile-release-group-Unknown')
    ).toBeInTheDocument();
    expect(screen.getByText('Summer Lights')).toBeInTheDocument();
    expect(screen.getByText('No Date Release')).toBeInTheDocument();
  });

  it('routes row taps through the edit handler', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const release = createRelease();

    render(
      <MobileReleaseList
        releases={[release]}
        artistName='Jovie Artist'
        onEdit={onEdit}
      />
    );

    const row = screen.getByTestId('mobile-release-row-release-1');
    expect(row).toHaveAttribute('data-shell-list-row', 'true');
    expect(row.className).toContain('hover:bg-(--linear-row-hover)');
    expect(row.className).toContain('focus-visible:bg-(--linear-row-hover)');

    await user.click(row);

    expect(onEdit).toHaveBeenCalledWith(release);
  });

  it('uses the shell release typography tokens for mobile scanning', () => {
    render(
      <MobileReleaseList
        releases={[createRelease()]}
        artistName='Jovie Artist'
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText('Summer Lights').className).toContain(
      'font-caption'
    );
    expect(screen.getByText('Summer Lights').className).toContain(
      'text-[13px]'
    );
    expect(screen.getByText('Jovie Artist').parentElement?.className).toContain(
      'text-[11px]'
    );

    const badge = screen.getByText('Single');
    expect(badge.className).toContain('inline-flex');
    expect(badge.className).toContain('items-center');
    expect(badge.className).toContain('leading-none');
  });
});
