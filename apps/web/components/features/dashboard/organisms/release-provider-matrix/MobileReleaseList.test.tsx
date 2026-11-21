import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MobileReleaseList } from './MobileReleaseList';

vi.mock('@/components/atoms/SwipeToReveal', () => ({
  SwipeToReveal: ({
    children,
    actions,
  }: {
    readonly children: ReactNode;
    readonly actions: ReactNode;
  }) => (
    <div>
      {children}
      <div>{actions}</div>
    </div>
  ),
  SwipeToRevealGroup: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }) => <span className={className}>{children}</span>,
}));

const release: ReleaseViewModel = {
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
};

describe('MobileReleaseList', () => {
  it('renders an empty list without rows', async () => {
    const { container } = render(
      <MobileReleaseList releases={[]} onEdit={vi.fn()} />
    );
    expect(screen.getByTestId('mobile-release-list')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('edits from the row and from the swipe action', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { container } = render(
      <MobileReleaseList
        releases={[release]}
        artistName='Jovie Artist'
        onEdit={onEdit}
      />
    );

    await user.click(screen.getByTestId('mobile-release-row-release-1'));
    expect(onEdit).toHaveBeenCalledWith(release);
    await user.click(
      screen.getByRole('button', { name: 'Edit Summer Lights' })
    );
    expect(onEdit).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('runs the optional art, pitch and copy actions', async () => {
    const user = userEvent.setup();
    const onGenerateAlbumArt = vi.fn();
    const onGeneratePitch = vi.fn();
    const onCopy = vi.fn(async () => 'Copied');
    render(
      <MobileReleaseList
        releases={[release]}
        onEdit={vi.fn()}
        canGenerateAlbumArt
        onGenerateAlbumArt={onGenerateAlbumArt}
        onGeneratePitch={onGeneratePitch}
        onCopy={onCopy}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Generate Album Art For Summer Lights',
      })
    );
    expect(onGenerateAlbumArt).toHaveBeenCalledWith(release);
    await user.click(
      screen.getByRole('button', { name: 'Generate pitch for Summer Lights' })
    );
    expect(onGeneratePitch).toHaveBeenCalledWith(release);
    await user.click(
      screen.getByRole('button', { name: 'Copy smart link for Summer Lights' })
    );
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('disables copy for a locked smart link and groups by year', async () => {
    const { container } = render(
      <MobileReleaseList
        releases={[
          release,
          { ...release, id: 'release-2', releaseDate: undefined },
        ]}
        onEdit={vi.fn()}
        onCopy={vi.fn(async () => 'Copied')}
        groupByYear
        isSmartLinkLocked={id => id === 'release-1'}
        getSmartLinkLockReason={() => 'scheduled'}
      />
    );

    expect(screen.getByTestId('mobile-release-group-2026')).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button', { name: /Copy smart link/ })
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
