'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { getLibraryItemKind } from '@/app/app/(shell)/library/library-data';
import { CopyLinkInput } from '@/components/features/dashboard/atoms/CopyLinkInput';
import { DrawerAsyncToggle } from '@/components/molecules/drawer';
import {
  DEFAULT_LIBRARY_ASSET_VISIBILITY,
  formatLibraryAssetShareDisplayUrl,
  type LibraryAssetShareViewModel,
  type LibraryAssetVisibility,
} from '@/lib/library/asset-share';
import { cn } from '@/lib/utils';

export function LibraryAssetSharePanel({
  asset,
  profileId,
  artistHandle,
  disabled,
  initialShare,
  onShareChange,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly profileId: string | null;
  readonly artistHandle: string | null;
  readonly disabled: boolean;
  readonly initialShare?: LibraryAssetShareViewModel | null;
  readonly onShareChange: (
    assetId: string,
    share: LibraryAssetShareViewModel
  ) => void;
}) {
  const [share, setShare] = useState<LibraryAssetShareViewModel | null>(
    initialShare ?? null
  );
  const [isEnsuring, setIsEnsuring] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    setShare(initialShare ?? null);
  }, [initialShare]);

  const ensureShare = useCallback(async () => {
    if (!profileId || !artistHandle) return null;

    setIsEnsuring(true);
    try {
      const response = await fetch('/api/library/asset-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          assetId: asset.id,
          itemKind: getLibraryItemKind(asset),
          title: asset.title,
          smartLinkPath: asset.smartLinkPath,
        }),
      });

      if (!response.ok) {
        throw new Error('Share ensure failed');
      }

      const body = (await response.json()) as {
        readonly share?: LibraryAssetShareViewModel;
      };
      if (!body.share) {
        throw new Error('Share ensure missing payload');
      }

      setShare(body.share);
      onShareChange(asset.id, body.share);
      return body.share;
    } catch {
      toast.error('Unable to load share link right now');
      return null;
    } finally {
      setIsEnsuring(false);
    }
  }, [artistHandle, asset, onShareChange, profileId]);

  useEffect(() => {
    if (!profileId || !artistHandle || share || isEnsuring) return;
    void ensureShare();
  }, [artistHandle, ensureShare, isEnsuring, profileId, share]);

  const handleVisibilityToggle = useCallback(
    async (isPublic: boolean) => {
      if (!profileId || !artistHandle) {
        throw new Error('Missing profile context');
      }

      const visibility: LibraryAssetVisibility = isPublic
        ? 'public'
        : 'private';
      const response = await fetch('/api/library/asset-share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          assetId: asset.id,
          itemKind: getLibraryItemKind(asset),
          title: asset.title,
          smartLinkPath: asset.smartLinkPath,
          visibility,
        }),
      });

      if (!response.ok) {
        throw new Error('Visibility update failed');
      }

      const body = (await response.json()) as {
        readonly share?: LibraryAssetShareViewModel;
      };
      if (!body.share) {
        throw new Error('Visibility update missing payload');
      }

      setShare(body.share);
      onShareChange(asset.id, body.share);
    },
    [artistHandle, asset, onShareChange, profileId]
  );

  const handleRevoke = useCallback(async () => {
    if (!profileId || !artistHandle) return;

    setIsRevoking(true);
    try {
      const response = await fetch('/api/library/asset-share/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          assetId: asset.id,
          itemKind: getLibraryItemKind(asset),
          title: asset.title,
          smartLinkPath: asset.smartLinkPath,
        }),
      });

      if (!response.ok) {
        throw new Error('Revoke failed');
      }

      const body = (await response.json()) as {
        readonly share?: LibraryAssetShareViewModel;
      };
      if (!body.share) {
        throw new Error('Revoke missing payload');
      }

      setShare(body.share);
      onShareChange(asset.id, body.share);
      toast.success('Private link revoked and regenerated');
    } catch {
      toast.error('Unable to revoke private link right now');
    } finally {
      setIsRevoking(false);
    }
  }, [artistHandle, asset, onShareChange, profileId]);

  const visibility = share?.visibility ?? DEFAULT_LIBRARY_ASSET_VISIBILITY;
  const shareUrl = share?.shareUrl ?? '';
  const displayUrl = shareUrl
    ? formatLibraryAssetShareDisplayUrl(shareUrl)
    : 'Generating link...';

  return (
    <div className='space-y-3' data-testid={`library-asset-share-${asset.id}`}>
      <DrawerAsyncToggle
        label='Public Link'
        ariaLabel={`Set ${asset.title} share link visibility`}
        checked={visibility === 'public'}
        onToggle={handleVisibilityToggle}
        successMessage={enabled =>
          enabled ? 'Asset link is now public' : 'Asset link is now private'
        }
        density='compact'
        testId={`library-asset-share-visibility-${asset.id}`}
      />

      <CopyLinkInput
        url={shareUrl || ' '}
        displayValue={displayUrl}
        size='sm'
        stopPropagation
        testId={`library-asset-share-url-${asset.id}`}
        className={cn((disabled || isEnsuring) && 'opacity-60')}
      />

      {visibility === 'private' ? (
        <button
          type='button'
          onClick={() => {
            void handleRevoke();
          }}
          disabled={disabled || isEnsuring || isRevoking || !profileId}
          data-testid={`library-asset-share-revoke-${asset.id}`}
          className='system-b-library-action system-b-library-action--standard inline-flex h-8 items-center border border-subtle px-2.5 text-2xs text-secondary-token'
        >
          {isRevoking ? 'Revoking...' : 'Revoke private link'}
        </button>
      ) : null}
    </div>
  );
}
