'use client';

/**
 * ProfilePhotoContextMenu Component
 *
 * Wraps a profile photo (avatar) with a right-click context menu that offers
 * download options at multiple sizes. Mirrors the album-art download pattern
 * used by AlbumArtworkContextMenu.
 */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@jovie/ui';
import { Download, ImageDown } from 'lucide-react';
import { useCallback } from 'react';
import { track } from '@/lib/analytics';
import { captureException } from '@/lib/sentry/client-lite';

import type { AvatarSize } from '@/lib/utils/avatar-sizes';

interface ProfilePhotoContextMenuProps {
  /** The avatar element to wrap */
  readonly children: React.ReactNode;
  /** Artist/profile name (used for download filename) */
  readonly name: string;
  /** Profile handle/username */
  readonly handle: string;
  /** Available download sizes */
  readonly sizes: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowDownloads: boolean;
}

function sanitizeFilename(value: string): string {
  const sanitized = value
    .replaceAll(/[^a-zA-Z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
  return sanitized || 'profile-photo';
}

export function ProfilePhotoContextMenu({
  children,
  name,
  handle,
  sizes,
  allowDownloads,
}: ProfilePhotoContextMenuProps) {
  const safeFilename = sanitizeFilename(handle || name);

  const handleDownload = useCallback(
    async (size: AvatarSize) => {
      try {
        track('profile_photo_download', {
          size: size.key,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        const response = await fetch(size.url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        const sizeLabel = size.key === 'original' ? '' : `-${size.key}`;
        const contentType = response.headers.get('content-type') ?? '';
        let ext = 'avif';
        if (contentType.includes('jpeg') || contentType.includes('jpg'))
          ext = 'jpg';
        else if (contentType.includes('png')) ext = 'png';
        else if (contentType.includes('webp')) ext = 'webp';
        link.download = `${safeFilename}${sizeLabel}.${ext}`;

        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        captureException(error, {
          tags: { feature: 'profile_photo_download' },
          extra: { sizeKey: size.key, url: size.url },
        });
        // Fallback: open in new tab
        globalThis.open(size.url, '_blank');
      }
    },
    [safeFilename]
  );

  const showDownloads = allowDownloads && sizes.length > 0;

  if (!showDownloads) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Download Profile Photo</ContextMenuLabel>
        <ContextMenuSeparator />
        {sizes.map(size => (
          <ContextMenuItem
            key={size.key}
            onClick={() => {
              handleDownload(size).catch(() => {});
            }}
          >
            {size.key === 'original' ? (
              <Download className='mr-2 h-4 w-4' />
            ) : (
              <ImageDown className='mr-2 h-4 w-4' />
            )}
            {size.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
