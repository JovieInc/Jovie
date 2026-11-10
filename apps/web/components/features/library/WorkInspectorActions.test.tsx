import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import {
  buildLibraryAskJovieDraft,
  buildLibraryEntityActions,
  libraryEntityActionsToContextMenuItems,
} from '@/app/app/(shell)/library/library-entity-actions';
import {
  convertContextMenuItems,
  convertToCommonDropdownItems,
} from '@/components/organisms/table/molecules/TableContextMenu';

import type { WorkLaunchSummary } from '@/lib/library/work-actions';
import { WorkInspectorActions } from './WorkInspectorActions';

const onAskJovieMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function buildAsset(
  overrides: Partial<LibraryReleaseAsset> = {}
): LibraryReleaseAsset {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: null,
    previewUrl: null,
    videoUrl: null,
    waveformSeed: 17,
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    approvalStatus: 'draft',
    profileVisibility: 'visible',
    trackCount: 1,
    providerCount: 1,
    providers: [],
    hasLyrics: false,
    hasArtwork: true,
    hasVideoLinks: false,
    assetKinds: [],
    genres: [],
    spotifyPopularity: null,
    targetPlaylistCount: 0,
    isExplicit: false,
    label: null,
    upc: null,
    distributor: null,
    totalDurationMs: null,
    ...overrides,
  };
}

function buildLaunch(
  overrides: Partial<WorkLaunchSummary> = {}
): WorkLaunchSummary {
  return {
    id: 'launch-1',
    workId: 'release-1',
    title: 'Take Me Over launch',
    kitStatus: 'ready',
    pressKitHref: '/app/releases/release-1/press-kit',
    pressReleaseHref: '/app/releases/release-1/press-release',
    launchHref: '/app/releases/release-1/tasks',
    ...overrides,
  };
}

function renderActions(
  props: Partial<Parameters<typeof WorkInspectorActions>[0]> = {}
) {
  return render(
    <WorkInspectorActions
      asset={buildAsset()}
      onAskJovie={onAskJovieMock}
      canPublish
      onSharePrivately={vi.fn()}
      {...props}
    />
  );
}

describe('WorkInspectorActions', () => {
  it('uses the same exact draft context through right-click, ellipsis and inspector adapters', () => {
    const asset = buildAsset({
      itemKind: 'merch',
      id: 'merch-7',
      updatedAt: '2026-11-10T00:00:00Z',
    });
    const onAskJovie = vi.fn();
    const actions = buildLibraryEntityActions({
      asset,
      profileId: 'profile-1',
      isPreviewPlaying: false,
      isApprovalSaving: false,
      onTogglePreview: vi.fn(),
      onApprovalStatusChange: vi.fn(),
      onAskJovie,
    });
    const contextItems = libraryEntityActionsToContextMenuItems(actions);
    const menus = [
      contextItems,
      convertContextMenuItems(contextItems),
      convertToCommonDropdownItems(contextItems),
    ];
    for (const items of menus) {
      const ask = items.find(item => 'id' in item && item.id === 'ask-jovie');
      expect(ask).toBeDefined();
      if (ask && 'onClick' in ask) ask.onClick?.();
    }
    expect(onAskJovie).toHaveBeenCalledTimes(3);
    for (const call of onAskJovie.mock.calls) {
      expect(call).toEqual([
        buildLibraryAskJovieDraft(asset, 'profile-1'),
        'profile-1',
      ]);
    }
    expect(
      JSON.parse(onAskJovie.mock.calls[0][0].split('\n')[1])
    ).toMatchObject({
      kind: 'merch',
      id: 'merch-7',
      profileId: 'profile-1',
      revision: '2026-11-10T00:00:00Z',
    });
  });

  it('offers Share page for a live public work', () => {
    renderActions();
    expect(screen.getByTestId('work-action-share-page')).toBeInTheDocument();
    expect(screen.getByTestId('work-action-preview-page')).toHaveAttribute(
      'href',
      'http://localhost:3000/tim/take-me-over'
    );
    expect(screen.queryByTestId('work-action-review-publish')).toBeNull();
  });

  it('renders every action as one secondary button style, preview included', () => {
    renderActions({ preview: <button type='button'>Play Preview</button> });
    const share = screen.getByTestId('work-action-share-page');
    const previewPage = screen.getByTestId('work-action-preview-page');
    const ask = screen.getByTestId('work-action-ask-jovie');
    expect(previewPage.className).toBe(share.className);
    expect(ask.className).toBe(share.className);
    expect(screen.getByText('Play Preview')).toBeInTheDocument();
  });

  it('keeps primary and utility actions in keyboard order without activating them on focus', async () => {
    const user = userEvent.setup();
    const onSharePrivately = vi.fn();
    renderActions({ onSharePrivately });

    await user.tab();
    expect(screen.getByTestId('work-action-share-page')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('work-action-preview-page')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('work-action-ask-jovie')).toHaveFocus();
    expect(onAskJovieMock).not.toHaveBeenCalled();
    expect(onSharePrivately).not.toHaveBeenCalled();

    await user.tab({ shift: true });
    expect(screen.getByTestId('work-action-preview-page')).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onAskJovieMock).toHaveBeenCalledOnce();
  });

  it('offers Review & publish for a prepared unpublished work', () => {
    renderActions({
      asset: buildAsset({ status: 'scheduled', smartLinkPath: '' }),
    });
    const action = screen.getByTestId('work-action-review-publish');
    expect(action).toBeInTheDocument();
    expect(screen.queryByTestId('work-action-share-page')).toBeNull();
  });

  it('shows a permission blocker instead of a dead publish action', () => {
    renderActions({
      asset: buildAsset({ status: 'draft', smartLinkPath: '' }),
      canPublish: false,
    });
    expect(screen.getByTestId('work-action-blocker')).toHaveTextContent(
      /permission/i
    );
  });

  it('routes intentional private work to private sharing without publish nagging', () => {
    const onSharePrivately = vi.fn();
    renderActions({
      asset: buildAsset({ profileVisibility: 'hidden' }),
      onSharePrivately,
    });
    expect(screen.queryByTestId('work-action-review-publish')).toBeNull();
    const sharePrivately = screen.getByTestId('work-action-share-privately');
    expect(sharePrivately).toHaveTextContent('Share Privately');
    fireEvent.click(sharePrivately);
    expect(onSharePrivately).toHaveBeenCalledOnce();
  });

  it('uses the same selected-item Ask callback supplied by the shared action owner', () => {
    renderActions();
    fireEvent.click(screen.getByTestId('work-action-ask-jovie'));
    expect(onAskJovieMock).toHaveBeenCalledOnce();
  });

  it('disables Ask when the selected-item action is unavailable', () => {
    renderActions({ onAskJovie: undefined });
    expect(screen.getByTestId('work-action-ask-jovie')).toBeDisabled();
    fireEvent.click(screen.getByTestId('work-action-ask-jovie'));
    expect(onAskJovieMock).not.toHaveBeenCalled();
  });

  it('renders no press-kit slot when the work has no launch', () => {
    renderActions({ launches: [buildLaunch({ workId: 'release-2' })] });
    expect(screen.queryByTestId('work-launch-launch-1')).toBeNull();
  });

  it('surfaces preparing, failed-with-retry, and ready launch states', () => {
    const onRetry = vi.fn();
    renderActions({
      launches: [
        buildLaunch({ id: 'l-prep', kitStatus: 'preparing' }),
        buildLaunch({ id: 'l-fail', kitStatus: 'failed' }),
        buildLaunch({ id: 'l-ready', kitStatus: 'ready' }),
      ],
      onRetryLaunchKit: onRetry,
    });
    expect(screen.getByTestId('work-launch-status-l-prep')).toHaveTextContent(
      /preparing press kit/i
    );
    fireEvent.click(screen.getByTestId('work-launch-retry-l-fail'));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByTestId('work-press-kit-l-ready')).toBeInTheDocument();
    expect(
      screen.getByTestId('work-press-release-l-ready')
    ).toBeInTheDocument();
  });
});
