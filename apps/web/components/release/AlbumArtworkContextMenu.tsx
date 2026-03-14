'use client';

/**
 * AlbumArtworkContextMenu Component
 *
 * Wraps album artwork with a right-click context menu that offers
 * download options at multiple sizes. Used on both dashboard and public pages.
 */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@jovie/ui';
import { Download, Undo2 } from 'lucide-react';
import { useCallback } from 'react';
import { track } from '@/lib/analytics';
import { useArtworkDownloadMutation } from '@/lib/queries';

export interface ArtworkSize {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

interface AlbumArtworkContextMenuProps {
  /** The artwork element to wrap */
  readonly children: React.ReactNode;
  /** Release title (used for download filename) */
  readonly title: string;
  /** Available download sizes */
  readonly sizes: ArtworkSize[];
  /** Whether album art downloads are allowed */
  readonly allowDownloads: boolean;
  /** Optional release ID for analytics */
  readonly releaseId?: string;
  /** Whether the artwork can be reverted to the original DSP-ingested version */
  readonly canRevert?: boolean;
  /** Callback to revert artwork to original */
  readonly onRevert?: () => void;
}

/** Default artwork size presets from URL map */
export function buildArtworkSizes(
  sizesMap: Record<string, string> | null | undefined,
  artworkUrl: string | null | undefined
): ArtworkSize[] {
  if (!sizesMap && !artworkUrl) return [];

  const sizes: ArtworkSize[] = [];

  if (sizesMap && Object.keys(sizesMap).length > 0) {
    if (sizesMap.original) {
      sizes.push({
        key: 'original',
        label: 'Original',
        url: sizesMap.original,
      });
    }
    if (sizesMap['1000']) {
      sizes.push({ key: '1000', label: '1000 × 1000', url: sizesMap['1000'] });
    }
    if (sizesMap['500']) {
      sizes.push({ key: '500', label: '500 × 500', url: sizesMap['500'] });
    }
    if (sizesMap['250']) {
      sizes.push({ key: '250', label: '250 × 250', url: sizesMap['250'] });
    }
  } else if (artworkUrl) {
    // Fallback: only the main artwork URL is available
    sizes.push({ key: 'original', label: 'Original', url: artworkUrl });
  }

  return sizes;
}

export function AlbumArtworkContextMenu({
  children,
  title,
  sizes,
  allowDownloads,
  releaseId,
  canRevert = false,
  onRevert,
}: AlbumArtworkContextMenuProps) {
  const artworkDownload = useArtworkDownloadMutation();

  const handleDownload = useCallback(
    (size: ArtworkSize) => {
      track('artwork_download', {
        releaseId,
        size: size.key,
      });

      artworkDownload.mutate(
        { url: size.url, title, sizeKey: size.key },
        {
          onError: () => {
            // Fallback: open in new tab
            globalThis.open(size.url, '_blank');
          },
        }
      );
    },
    [title, releaseId, artworkDownload]
  );

  const showDownloads = allowDownloads && sizes.length > 0;
  const showRevert = canRevert && onRevert;

  // If no menu items available, render children directly
  if (!showDownloads && !showRevert) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {showRevert && (
          <>
            <ContextMenuItem
              onClick={() => {
                onRevert();
              }}
            >
              <Undo2 className='mr-2 h-4 w-4' />
              Revert to original artwork
            </ContextMenuItem>
            {showDownloads && <ContextMenuSeparator />}
          </>
        )}
        {showDownloads && (
          <>
            <ContextMenuLabel>Download Artwork</ContextMenuLabel>
            <ContextMenuSeparator />
            {sizes.map(size => (
              <ContextMenuItem
                key={size.key}
                onClick={() => {
                  handleDownload(size);
                }}
              >
                <Download className='mr-2 h-4 w-4' />
                {size.label}
              </ContextMenuItem>
            ))}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
