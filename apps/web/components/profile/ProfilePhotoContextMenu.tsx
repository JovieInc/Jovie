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
import { Download } from 'lucide-react';
import { useCallback } from 'react';
import { track } from '@/lib/analytics';

export interface AvatarSize {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

interface ProfilePhotoContextMenuProps {
  /** The avatar element to wrap */
  readonly children: React.ReactNode;
  /** Artist/profile name (used for download filename) */
  readonly name: string;
  /** Available download sizes */
  readonly sizes: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowDownloads: boolean;
}

/** Build avatar sizes from a URL map stored in profile settings */
export function buildAvatarSizes(
  sizesMap: Record<string, string> | null | undefined,
  avatarUrl: string | null | undefined
): AvatarSize[] {
  if (!sizesMap && !avatarUrl) return [];

  const sizes: AvatarSize[] = [];

  if (sizesMap && Object.keys(sizesMap).length > 0) {
    if (sizesMap.original) {
      sizes.push({ key: 'original', label: 'Original', url: sizesMap.original });
    }
    if (sizesMap['512']) {
      sizes.push({ key: '512', label: '512 × 512', url: sizesMap['512'] });
    }
    if (sizesMap['256']) {
      sizes.push({ key: '256', label: '256 × 256', url: sizesMap['256'] });
    }
    if (sizesMap['128']) {
      sizes.push({ key: '128', label: '128 × 128', url: sizesMap['128'] });
    }
  } else if (avatarUrl) {
    sizes.push({ key: 'original', label: 'Original', url: avatarUrl });
  }

  return sizes;
}

function sanitizeFilename(name: string): string {
  const sanitized = name
    .replaceAll(/[^a-zA-Z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
  return sanitized || 'profile-photo';
}

export function ProfilePhotoContextMenu({
  children,
  name,
  sizes,
  allowDownloads,
}: ProfilePhotoContextMenuProps) {
  const handleDownload = useCallback(
    async (size: AvatarSize) => {
      try {
        track('profile_photo_download', {
          size: size.key,
        });

        const response = await fetch(size.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        const filename = sanitizeFilename(name);
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
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        // Fallback: open in new tab
        globalThis.open(size.url, '_blank');
      }
    },
    [name]
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
              handleDownload(size);
            }}
          >
            <Download className='mr-2 h-4 w-4' />
            {size.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
