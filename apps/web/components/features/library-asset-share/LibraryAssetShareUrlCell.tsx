'use client';

import { Button } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { type MouseEvent, useCallback, useState } from 'react';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import {
  formatLibraryAssetShareDisplayUrl,
  type LibraryAssetShareViewModel,
} from '@/lib/library/asset-share';
import { cn } from '@/lib/utils';

export function LibraryAssetShareUrlCell({
  asset,
  share,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly share?: LibraryAssetShareViewModel | null;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = share?.shareUrl ?? '';
  const displayUrl = shareUrl
    ? formatLibraryAssetShareDisplayUrl(shareUrl)
    : '—';

  const handleCopy = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!shareUrl) return;

      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
      }
    },
    [shareUrl]
  );

  return (
    <div
      className='flex min-w-0 items-center gap-1.5'
      data-testid={`library-share-url-cell-${asset.id}`}
    >
      <span className='system-b-library-meta-text min-w-0 flex-1 truncate font-mono text-2xs text-tertiary-token'>
        {displayUrl}
      </span>
      <Button
        type='button'
        variant='outline'
        size='icon'
        onClick={event => {
          handleCopy(event).catch(() => {});
        }}
        disabled={!shareUrl}
        aria-label={
          copied ? 'Copied share URL' : `Copy share URL for ${asset.title}`
        }
        data-testid={`library-share-url-copy-${asset.id}`}
        className={cn(
          'system-b-library-action h-6 w-6 shrink-0 border border-subtle',
          !shareUrl && 'opacity-40'
        )}
      >
        {copied ? (
          <Check className='h-3 w-3 text-emerald-300' strokeWidth={2.25} />
        ) : (
          <Copy className='h-3 w-3' strokeWidth={2.25} />
        )}
      </Button>
    </div>
  );
}
