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
import { Download } from 'lucide-react';
import { useCallback } from 'react';
import { track } from '@/lib/analytics';

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
  /** Whether downloads are allowed */
  readonly allowDownloads: boolean;
  /** Optional release ID for analytics */
  readonly releaseId?: string;
}

/** Default artwork size presets from URL map */
export function buildArtworkSizes(
  sizesMap: Record<string, string> | null | undefined,
  artworkUrl: string | null | undefined
): ArtworkSize[] {
  if (!sizesMap && !artworkUrl) return [];

  const sizes: ArtworkSize[] = [];

  if (sizesMap) {
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

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
}

export function AlbumArtworkContextMenu({
  children,
  title,
  sizes,
  allowDownloads,
  releaseId,
}: AlbumArtworkContextMenuProps) {
  const handleDownload = useCallback(
    async (size: ArtworkSize) => {
      try {
        track('artwork_download', {
          releaseId,
          size: size.key,
        });

        const response = await fetch(size.url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        const filename = sanitizeFilename(title);
        const sizeLabel = size.key === 'original' ? '' : `-${size.key}`;
        const contentType = response.headers.get('content-type') ?? '';
        let ext = 'avif';
        if (contentType.includes('jpeg') || contentType.includes('jpg'))
          ext = 'jpg';
        else if (contentType.includes('png')) ext = 'png';
        else if (contentType.includes('webp')) ext = 'webp';
        link.download = `${filename}${sizeLabel}.${ext}`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        // Fallback: open in new tab
        globalThis.open(size.url, '_blank');
      }
    },
    [title, releaseId]
  );

  // If downloads are not allowed or no sizes available, render children directly
  if (!allowDownloads || sizes.length === 0) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Download Artwork</ContextMenuLabel>
        <ContextMenuSeparator />
        {sizes.map(size => (
          <ContextMenuItem
            key={size.key}
            onClick={() => void handleDownload(size)}
          >
            <Download className='mr-2 h-4 w-4' />
            {size.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
