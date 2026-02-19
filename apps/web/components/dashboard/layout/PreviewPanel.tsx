'use client';

import { Button, type CommonDropdownItem } from '@jovie/ui';
import { Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { DrawerHeader } from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getQrCodeUrl } from '@/components/molecules/QRCodeDisplay';
import { RightDrawer } from '@/components/organisms/RightDrawer';
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
    <RightDrawer
      isOpen={isOpen}
      width={PREVIEW_PANEL_WIDTH}
      ariaLabel='Live Preview'
      contextMenuItems={contextMenuItems}
    >
      <div className='flex h-full flex-col'>
        {/* Header with action buttons */}
        <DrawerHeader
          title='Live Preview'
          onClose={close}
          actions={
            <DrawerHeaderActions
              primaryActions={primaryActions}
              overflowActions={overflowActions}
            />
          }
        />

        {/* Preview Content */}
        <div className='flex-1 min-h-0 overflow-y-auto p-4'>
          <div className='flex flex-col items-center gap-4 pb-8'>
            <div className='w-full max-w-[360px] aspect-[9/19.5] max-h-[740px] overflow-hidden rounded-2xl border border-subtle bg-surface-1/40 ring-1 ring-inset ring-white/3 dark:ring-white/5 shadow-sm shadow-black/10 dark:shadow-black/40'>
              <ProfilePreview
                username={username}
                displayName={displayName}
                avatarUrl={avatarUrl}
                links={links}
                className='h-full w-full'
              />
            </div>

            {/* Hero CTA - View Jovie Profile */}
            <Button asChild variant='primary' className='w-full max-w-[360px]'>
              <a href={profileUrl} target='_blank' rel='noopener noreferrer'>
                <ExternalLink className='h-4 w-4 mr-2' aria-hidden='true' />
                View Jovie Profile
              </a>
            </Button>
          </div>
        </div>

        {/* Footer - URL Preview */}
        <div className='shrink-0 border-t border-subtle p-4'>
          <h3 className='text-[13px] font-medium text-primary-token mb-2'>
            Your Profile URL
          </h3>
          <div className='rounded-lg border border-subtle bg-surface-1/40 px-3 py-2 text-[12px] text-primary-token font-sans truncate'>
            {profileUrl || 'Loading...'}
          </div>
          <p className='mt-2 text-xs text-secondary-token'>
            Share this link with your audience
          </p>
        </div>
      </div>
    </RightDrawer>
  );
}
