'use client';

import { Button } from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { CopyLinkInput } from '@/components/features/dashboard/atoms/CopyLinkInput';
import { toast } from '@/components/feedback';
import { DrawerAsyncToggle } from '@/components/molecules/drawer';
import {
  DEFAULT_LIBRARY_ASSET_VISIBILITY,
  formatLibraryAssetShareDisplayUrl,
  type LibraryAssetShareViewModel,
  type LibraryAssetVisibility,
} from '@/lib/library/asset-share';
import {
  buildLibraryAssetShareRequestBody,
  requestLibraryAssetShareMutation,
} from '@/lib/library/asset-share/client-mutations';
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
  const [hasEnsureFailed, setHasEnsureFailed] = useState(false);

  useEffect(() => {
    setShare(initialShare ?? null);
  }, [initialShare]);

  const applyShare = useCallback(
    (nextShare: LibraryAssetShareViewModel) => {
      setShare(nextShare);
      onShareChange(asset.id, nextShare);
    },
    [asset.id, onShareChange]
  );

  const ensureShare = useCallback(async () => {
    if (!profileId || !artistHandle) return null;

    setIsEnsuring(true);
    try {
      const nextShare = await requestLibraryAssetShareMutation(
        '/api/library/asset-share',
        'POST',
        buildLibraryAssetShareRequestBody(asset, profileId)
      );
      applyShare(nextShare);
      return nextShare;
    } catch {
      toast.error('Unable to load share link right now');
      return null;
    } finally {
      setIsEnsuring(false);
    }
  }, [applyShare, artistHandle, asset, profileId]);

  useEffect(() => {
    if (!profileId || !artistHandle || share || isEnsuring || hasEnsureFailed) {
      return;
    }

    ensureShare().then(result => {
      if (!result) {
        setHasEnsureFailed(true);
      }
    });
  }, [
    artistHandle,
    ensureShare,
    hasEnsureFailed,
    isEnsuring,
    profileId,
    share,
  ]);

  const handleVisibilityToggle = useCallback(
    async (isPublic: boolean) => {
      if (!profileId || !artistHandle) {
        throw new Error('Missing profile context');
      }

      const visibility: LibraryAssetVisibility = isPublic
        ? 'public'
        : 'private';
      const nextShare = await requestLibraryAssetShareMutation(
        '/api/library/asset-share',
        'PATCH',
        buildLibraryAssetShareRequestBody(asset, profileId, { visibility })
      );
      applyShare(nextShare);
    },
    [applyShare, artistHandle, asset, profileId]
  );

  const handleRevoke = useCallback(async () => {
    if (!profileId || !artistHandle) return;

    setIsRevoking(true);
    try {
      const nextShare = await requestLibraryAssetShareMutation(
        '/api/library/asset-share/revoke',
        'POST',
        buildLibraryAssetShareRequestBody(asset, profileId)
      );
      applyShare(nextShare);
      toast.success('Private link revoked and regenerated');
    } catch {
      toast.error('Unable to revoke private link right now');
    } finally {
      setIsRevoking(false);
    }
  }, [applyShare, artistHandle, asset, profileId]);

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
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => {
            handleRevoke().catch(() => {});
          }}
          disabled={disabled || isEnsuring || isRevoking || !profileId}
          data-testid={`library-asset-share-revoke-${asset.id}`}
          className='system-b-library-action system-b-library-action--standard h-8 px-2.5 text-2xs text-secondary-token'
        >
          {isRevoking ? 'Revoking...' : 'Revoke private link'}
        </Button>
      ) : null}
    </div>
  );
}
