'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import {
  DrawerButton,
  DrawerSectionHeading,
  DrawerSurfaceCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { BASE_URL } from '@/constants/domains';

export const PREVIEW_PANEL_WIDTH = 360;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function PreviewPanel() {
  const { isOpen, close } = usePreviewPanelState();
  const { previewData } = usePreviewPanelData();

  const profileUrl = useMemo(() => {
    if (!previewData) return '';
    return `${BASE_URL}${previewData.profilePath}`;
  }, [previewData]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast.success('Profile URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  }, [profileUrl]);

  const handleDownloadQr = useCallback(async () => {
    if (!previewData) return;
    try {
      const qrUrl = getQrCodeUrl(profileUrl, 512);
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      downloadBlob(blob, `${previewData.username || 'jovie'}-qr-code.png`);
      toast.success('QR code downloaded');
    } catch {
      toast.error('Failed to download QR code');
    }
  }, [profileUrl, previewData]);

  const handleDownloadVcard = useCallback(() => {
    if (!previewData) return;
    try {
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${previewData.displayName || previewData.username}`,
        `URL:${profileUrl}`,
        'END:VCARD',
      ].join('\n');

      downloadBlob(
        new Blob([vcard], { type: 'text/vcard' }),
        `${previewData.username || 'jovie'}.vcf`
      );
      toast.success('vCard downloaded');
    } catch {
      toast.error('Failed to download vCard');
    }
  }, [previewData, profileUrl]);

  const contextMenuItems = useMemo<CommonDropdownItem[]>(
    () => [
      {
        type: 'action',
        id: 'copy-url',
        label: 'Copy Jovie Profile URL',
        icon: <Copy className='h-4 w-4' />,
        onClick: handleCopyUrl,
      },
      {
        type: 'action',
        id: 'download-qr',
        label: 'Download QR Code',
        icon: <QrCode className='h-4 w-4' />,
        onClick: handleDownloadQr,
      },
      {
        type: 'action',
        id: 'download-vcard',
        label: 'Download vCard',
        icon: <Download className='h-4 w-4' />,
        onClick: handleDownloadVcard,
      },
    ],
    [handleCopyUrl, handleDownloadQr, handleDownloadVcard]
  );

  // Header actions using DrawerHeaderActions for consistent styling
  const primaryActions: DrawerHeaderAction[] = useMemo(
    () => [
      {
        id: 'open',
        label: 'Open profile in new tab',
        icon: ExternalLink,
        href: profileUrl,
      },
    ],
    [profileUrl]
  );

  const overflowActions: DrawerHeaderAction[] = useMemo(
    () => [
      {
        id: 'copy-url',
        label: 'Copy Jovie Profile URL',
        icon: Copy,
        onClick: () => {
          handleCopyUrl();
        },
      },
      {
        id: 'download-qr',
        label: 'Download QR Code',
        icon: QrCode,
        onClick: () => {
          handleDownloadQr();
        },
      },
      {
        id: 'download-vcard',
        label: 'Download vCard',
        icon: Download,
        onClick: handleDownloadVcard,
      },
    ],
    [handleCopyUrl, handleDownloadQr, handleDownloadVcard]
  );

  // Don't render anything until we have preview data
  if (!previewData) {
    return null;
  }

  const { username, displayName, avatarUrl, links } = previewData;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={PREVIEW_PANEL_WIDTH}
      ariaLabel='Live Preview'
      contextMenuItems={contextMenuItems}
      title='Live Preview'
      onClose={close}
      headerActions={
        <DrawerHeaderActions
          primaryActions={primaryActions}
          overflowActions={overflowActions}
          onClose={close}
        />
      }
      contentClassName='space-y-0 px-4 py-4'
      footerClassName='px-4 py-4'
      footer={
        <DrawerSurfaceCard className='space-y-2.5 p-3'>
          <DrawerSectionHeading>Your profile URL</DrawerSectionHeading>
          <div className='rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2 text-[12px] font-medium tracking-[-0.01em] text-(--linear-text-primary)'>
            <div className='truncate'>{profileUrl || 'Loading...'}</div>
          </div>
          <p className='text-[12px] leading-[16px] text-(--linear-text-tertiary)'>
            Share this link with your audience.
          </p>
        </DrawerSurfaceCard>
      }
    >
      <div className='flex flex-col items-center gap-4 pb-6'>
        <div className='aspect-[9/19.5] max-h-[740px] w-full max-w-[360px] overflow-hidden rounded-[24px] border border-(--linear-border-default) bg-(--linear-bg-surface-0) shadow-[0_20px_60px_rgba(0,0,0,0.24)] dark:shadow-[0_24px_72px_rgba(0,0,0,0.48)]'>
          <ProfilePreview
            username={username}
            displayName={displayName}
            avatarUrl={avatarUrl}
            links={links}
            className='h-full w-full'
          />
        </div>

        <DrawerButton
          asChild
          tone='primary'
          size='sm'
          className='h-10 w-full max-w-[360px] rounded-[10px] text-[13px]'
        >
          <a href={profileUrl} target='_blank' rel='noopener noreferrer'>
            <ExternalLink className='mr-2 h-4 w-4' aria-hidden='true' />
            View Jovie Profile
          </a>
        </DrawerButton>
      </div>
    </EntitySidebarShell>
  );
}
