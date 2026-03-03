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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@jovie/ui';
import { Download, FileCode2, ImageDown, QrCode } from 'lucide-react';
import { useCallback } from 'react';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { getProfileUrl } from '@/constants/domains';
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
  /** Profile tagline or bio */
  readonly tagline?: string;
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

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function buildVxarCard(params: {
  name: string;
  handle: string;
  profileUrl: string;
  tagline?: string;
}): string {
  const { name, handle, profileUrl, tagline } = params;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${name};;;;`,
    `NICKNAME:${handle}`,
    `URL:${profileUrl}`,
    tagline ? `NOTE:${tagline}` : null,
    `X-JOVIE-PROFILE:${profileUrl}`,
    `X-JOVIE-HANDLE:${handle}`,
    'X-VXAR-FORMAT:1.0',
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\n');
}

export function ProfilePhotoContextMenu({
  children,
  name,
  handle,
  tagline,
  sizes,
  allowDownloads,
}: ProfilePhotoContextMenuProps) {
  const profileUrl = getProfileUrl(handle);
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

  const handleDownloadVxar = useCallback(() => {
    const vxar = buildVxarCard({
      name,
      handle,
      profileUrl,
      tagline,
    });
    downloadBlob(
      new Blob([vxar], { type: 'text/vcard' }),
      `${safeFilename}.vxar`
    );
  }, [handle, name, profileUrl, safeFilename, tagline]);

  const handleDownloadQr = useCallback(async () => {
    const qrUrl = getQrCodeUrl(profileUrl, 512);
    const response = await fetch(qrUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    downloadBlob(blob, `${safeFilename}-qr-code.png`);
  }, [profileUrl, safeFilename]);

  const handleDownloadProfileJson = useCallback(() => {
    const payload = {
      format: 'jovie-profile-v1',
      exportedAt: new Date().toISOString(),
      profile: {
        name,
        handle,
        tagline: tagline ?? null,
        profileUrl,
      },
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
      `${safeFilename}.json`
    );
  }, [handle, name, profileUrl, safeFilename, tagline]);

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
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Download className='mr-2 h-4 w-4' />
            Download
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={handleDownloadVxar}>
              <FileCode2 className='mr-2 h-4 w-4' />
              Download as VXAR
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                handleDownloadQr().catch(() => {});
              }}
            >
              <QrCode className='mr-2 h-4 w-4' />
              Download QR Code
            </ContextMenuItem>
            {sizes.map(size => (
              <ContextMenuItem
                key={size.key}
                onClick={() => {
                  handleDownload(size).catch(() => {});
                }}
              >
                <ImageDown className='mr-2 h-4 w-4' />
                {size.label}
              </ContextMenuItem>
            ))}
            <ContextMenuItem onClick={handleDownloadProfileJson}>
              <FileCode2 className='mr-2 h-4 w-4' />
              Download Profile as JSON
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
