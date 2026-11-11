import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import {
  buildLibraryAskJovieDraft,
  buildLibraryEntityActions,
  libraryEntityActionsToContextMenuItems,
} from '@/app/app/(shell)/library/library-entity-actions';
import {
  consumePendingChatDraft,
  consumePendingChatPrompt,
  openChatWithDraft,
} from '@/lib/chat/open-chat-with-prompt';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';

function buildAsset(
  overrides: Partial<LibraryReleaseAsset> = {}
): LibraryReleaseAsset {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    previewUrl: 'https://cdn.example.com/preview.mp3',
    videoUrl: 'https://cdn.example.com/canvas.mp4',
    waveformSeed: 17,
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    approvalStatus: 'draft',
    profileVisibility: 'visible',
    lifecycleStatus: 'active',
    trackCount: 1,
    providerCount: 0,
    providers: [],
    hasLyrics: false,
    hasArtwork: true,
    hasVideoLinks: true,
    assetKinds: ['artwork', 'preview', 'video'],
    genres: [],
    spotifyPopularity: null,
    targetPlaylistCount: 0,
    isExplicit: false,
    label: null,
    upc: '198391373428',
    primaryIsrc: 'US-ABC-26-00001',
    distributor: null,
    totalDurationMs: null,
    share: {
      assetId: 'release-1',
      visibility: 'private',
      shareSlug: 'take-me-over',
      accessToken: 'token-1',
      shareUrl: 'https://jov.ie/share/release-1',
      tokenRevokedAt: null,
    },
    ...overrides,
  };
}

function buildActions(
  asset: LibraryReleaseAsset,
  overrides: Partial<Parameters<typeof buildLibraryEntityActions>[0]> = {}
) {
  return buildLibraryEntityActions({
    asset,
    profileId: 'profile-1',
    isPreviewPlaying: false,
    isApprovalSaving: false,
    onTogglePreview: vi.fn(),
    onApprovalStatusChange: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn(),
    copyText: vi.fn(),
    ...overrides,
  });
}

describe('library entity actions', () => {
  it('prepares the existing draft transport without queuing an auto-submit prompt', () => {
    resetCacheIsolationForTests();
    applyCacheScope({
      userId: 'user-1',
      sessionId: 'session-1',
      profileId: 'profile-1',
      ready: true,
    });
    const router = { push: vi.fn() };
    const asset = buildAsset();
    const actions = buildActions(asset, {
      onAskJovie: draft => {
        openChatWithDraft(draft, router);
      },
    });
    actions.find(action => action.id === 'ask-jovie')?.onExecute?.();
    expect(consumePendingChatPrompt()).toBeNull();
    expect(consumePendingChatDraft('profile-1')).toBe(
      buildLibraryAskJovieDraft(asset, 'profile-1')
    );
    expect(router.push).toHaveBeenCalledOnce();
    resetCacheIsolationForTests();
  });

  it('does not invoke Ask without a selected profile even if called programmatically', () => {
    const onAskJovie = vi.fn();
    const action = buildActions(buildAsset(), {
      profileId: null,
      onAskJovie,
    }).find(action => action.id === 'ask-jovie');
    expect(action?.disabled).toBe(true);
    action?.onExecute?.();
    expect(onAskJovie).not.toHaveBeenCalled();
  });

  it('builds release actions in one canonical order', () => {
    const actions = buildActions(buildAsset());

    expect(actions.map(action => action.id)).toEqual([
      'approval-status',
      'play-preview',
      'open-video',
      'open-artwork',
      'open-primary',
      'copy',
      'ask-jovie',
    ]);
  });

  it('includes only supported actions for merch', () => {
    const actions = buildActions(
      buildAsset({
        itemKind: 'merch',
        previewUrl: null,
        videoUrl: null,
        primaryActionLabel: 'Open Merch',
        primaryActionHref: '/app/library?view=merch',
        share: null,
      })
    );

    expect(actions.map(action => action.id)).toEqual([
      'approval-status',
      'open-artwork',
      'open-primary',
      'copy',
      'ask-jovie',
    ]);
    expect(actions.find(action => action.id === 'open-primary')?.label).toBe(
      'Open Merch'
    );
  });

  it('offers a private studio take only Watch Take and Copy', () => {
    const openUrl = vi.fn();
    const actions = buildActions(
      buildAsset({
        id: 'take-take_1',
        itemKind: 'video',
        primaryActionLabel: 'Watch Take',
        primaryActionHref: '/api/teleprompter/takes/take_1/media',
        share: null,
      }),
      { openUrl }
    );

    expect(actions.map(action => action.id)).toEqual(['open-primary', 'copy']);
    void actions[0]?.onExecute?.();
    expect(openUrl).toHaveBeenCalledWith(
      '/api/teleprompter/takes/take_1/media'
    );
  });

  it('keeps approval mutations disabled without profile-owner authority', () => {
    const actions = buildActions(buildAsset(), { profileId: null });
    const approval = actions.find(action => action.id === 'approval-status');

    expect(approval?.authority).toBe('profile-owner');
    expect(approval?.children).toHaveLength(4);
    expect(
      approval?.children?.every(
        action =>
          action.disabled &&
          action.disabledReason === 'Requires an owned creator profile'
      )
    ).toBe(true);
  });

  it('adds typed profile visibility only when the read model supports it', async () => {
    const asset = buildAsset();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const actions = buildActions(asset, {
      profileVisibility: {
        value: 'visible',
        isSaving: false,
        onChange,
      },
    });

    expect(actions.map(action => action.id)).toEqual([
      'approval-status',
      'profile-visibility',
      'play-preview',
      'open-video',
      'open-artwork',
      'open-primary',
      'copy',
      'ask-jovie',
    ]);

    const visibility = actions.find(
      action => action.id === 'profile-visibility'
    );
    expect(visibility).toMatchObject({
      label: 'Visibility',
      authority: 'profile-owner',
      disabled: false,
      destructive: false,
    });

    expect(visibility?.children).toHaveLength(2);
    expect(visibility?.children?.[0]).toMatchObject({
      id: 'profile-visibility:visible',
      label: 'Shown on Profile',
      disabled: true,
      disabledReason: 'Current profile visibility',
    });
    await visibility?.children
      ?.find(action => action.id === 'profile-visibility:hidden')
      ?.onExecute?.();
    expect(onChange).toHaveBeenCalledWith(asset, 'hidden');
  });

  it('keeps visibility and release lifecycle actions in the canonical order', () => {
    const actions = buildActions(buildAsset(), {
      profileVisibility: {
        value: 'visible',
        isSaving: false,
        onChange: vi.fn().mockResolvedValue(undefined),
      },
      lifecycle: {
        value: 'active',
        isSaving: false,
        onChange: vi.fn().mockResolvedValue(undefined),
      },
    });

    expect(actions.map(action => action.id)).toEqual([
      'approval-status',
      'profile-visibility',
      'play-preview',
      'open-video',
      'open-artwork',
      'open-primary',
      'copy',
      'ask-jovie',
      'archive',
    ]);
  });

  it('exposes reversible release lifecycle actions with owner authority', async () => {
    const asset = buildAsset();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const archive = buildActions(asset, {
      lifecycle: {
        value: 'active',
        isSaving: false,
        onChange,
      },
    }).find(action => action.id === 'archive');
    const restore = buildActions(buildAsset({ lifecycleStatus: 'archived' }), {
      lifecycle: {
        value: 'archived',
        isSaving: false,
        onChange,
      },
    }).find(action => action.id === 'restore');

    expect(archive).toMatchObject({
      label: 'Archive',
      authority: 'profile-owner',
      disabled: false,
      destructive: true,
    });
    expect(restore).toMatchObject({
      label: 'Restore',
      authority: 'profile-owner',
      disabled: false,
      destructive: false,
    });

    await archive?.onExecute?.();
    await restore?.onExecute?.();
    expect(onChange).toHaveBeenNthCalledWith(1, asset, 'archived');
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lifecycleStatus: 'archived' }),
      'active'
    );
  });

  it('does not invent lifecycle actions for merch', () => {
    const actions = buildActions(
      buildAsset({
        itemKind: 'merch',
        previewUrl: null,
        videoUrl: null,
      })
    );

    expect(actions.some(action => action.id === 'archive')).toBe(false);
    expect(actions.some(action => action.id === 'restore')).toBe(false);
  });

  it('disables lifecycle changes without authority or while saving', () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const withoutOwner = buildActions(buildAsset(), {
      profileId: null,
      lifecycle: {
        value: 'active',
        isSaving: false,
        onChange,
      },
    }).find(action => action.id === 'archive');
    const whileSaving = buildActions(buildAsset(), {
      lifecycle: {
        value: 'archived',
        isSaving: true,
        onChange,
      },
    }).find(action => action.id === 'restore');

    expect(withoutOwner).toMatchObject({
      disabled: true,
      disabledReason: 'Requires an owned creator profile',
    });
    expect(whileSaving).toMatchObject({
      disabled: true,
      disabledReason: 'Restoring release',
    });
  });

  it('disables profile visibility without owner authority or while saving', () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const withoutOwner = buildActions(buildAsset(), {
      profileId: null,
      profileVisibility: {
        value: 'hidden',
        isSaving: false,
        onChange,
      },
    }).find(action => action.id === 'profile-visibility');
    const whileSaving = buildActions(buildAsset(), {
      profileVisibility: {
        value: 'hidden',
        isSaving: true,
        onChange,
      },
    }).find(action => action.id === 'profile-visibility');

    expect(withoutOwner).toMatchObject({
      label: 'Visibility',
      disabled: false,
    });
    expect(
      withoutOwner?.children?.every(
        action =>
          action.disabled &&
          action.disabledReason === 'Requires an owned creator profile'
      )
    ).toBe(true);
    expect(whileSaving).toMatchObject({ label: 'Visibility', disabled: false });
    expect(
      whileSaving?.children?.every(
        action =>
          action.disabled &&
          action.disabledReason === 'Saving profile visibility'
      )
    ).toBe(true);
  });

  it('routes actions through the injected entity handlers', async () => {
    const asset = buildAsset();
    const onTogglePreview = vi.fn();
    const onApprovalStatusChange = vi.fn().mockResolvedValue(undefined);
    const openUrl = vi.fn();
    const copyText = vi.fn();
    const actions = buildActions(asset, {
      onTogglePreview,
      onApprovalStatusChange,
      openUrl,
      copyText,
    });

    await actions.find(action => action.id === 'play-preview')?.onExecute?.();
    await actions.find(action => action.id === 'open-video')?.onExecute?.();
    const copy = actions.find(action => action.id === 'copy');
    await copy?.children
      ?.find(action => action.id === 'copy-title')
      ?.onExecute?.();
    const approval = actions.find(action => action.id === 'approval-status');
    await approval?.children
      ?.find(action => action.id === 'approval-status:approved')
      ?.onExecute?.();

    expect(onTogglePreview).toHaveBeenCalledWith(asset);
    expect(openUrl).toHaveBeenCalledWith('https://cdn.example.com/canvas.mp4');
    expect(copyText).toHaveBeenCalledWith('Take Me Over');
    expect(onApprovalStatusChange).toHaveBeenCalledWith(asset, 'approved');
  });

  it('groups share links, tracked links, and release identifiers under Copy', () => {
    const copy = buildActions(buildAsset()).find(
      action => action.id === 'copy'
    );

    expect(copy?.children?.map(action => action.id)).toEqual([
      'copy-share-link',
      'copy-tracked-link',
      'copy-title',
      'copy-artist',
      'copy-isrc',
      'copy-upc',
    ]);
    expect(
      copy?.children?.find(action => action.id === 'copy-tracked-link')
    ).toMatchObject({
      label: 'Tracked Link',
      children: expect.arrayContaining([
        expect.objectContaining({ id: 'utm-share-instagram-story' }),
      ]),
    });
  });

  it('does not invent identifier copy actions when metadata is absent', () => {
    const copy = buildActions(
      buildAsset({ artist: 'Unknown Artist', primaryIsrc: null, upc: null })
    ).find(action => action.id === 'copy');

    expect(copy?.children?.map(action => action.id)).not.toContain(
      'copy-artist'
    );
    expect(copy?.children?.map(action => action.id)).not.toContain('copy-isrc');
    expect(copy?.children?.map(action => action.id)).not.toContain('copy-upc');
  });

  it('adapts the same typed actions to nested context-menu items', () => {
    const actions = buildActions(buildAsset());
    const items = libraryEntityActionsToContextMenuItems(actions);
    const approval = items[0];

    expect(items.map(item => ('id' in item ? item.id : item.type))).toEqual(
      actions.map(action => action.id)
    );
    expect(approval).toMatchObject({
      id: 'approval-status',
      label: 'Status',
    });
    expect('items' in approval ? approval.items : []).toHaveLength(4);
  });
});
