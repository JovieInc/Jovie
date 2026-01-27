'use client';

import { Button, CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import {
  Copy,
  Download,
  ExternalLink,
  MoreVertical,
  QrCode,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { getQrCodeUrl } from '@/components/atoms/QRCode';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { DrawerHeader } from '@/components/molecules/drawer';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { PROFILE_URL } from '@/constants/domains';

const PREVIEW_PANEL_WIDTH = 360;

export function PreviewPanel() {
  const { isOpen, close, previewData } = usePreviewPanel();

  // Use PROFILE_URL to ensure profile links always point to the profile domain
  const profileUrl = useMemo(() => {
    if (!previewData) return '';
    return `${PROFILE_URL}${previewData.profilePath}`;
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${previewData.username || 'jovie'}-qr-code.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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

      const blob = new Blob([vcard], { type: 'text/vcard' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${previewData.username || 'jovie'}.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('vCard downloaded');
    } catch {
      toast.error('Failed to download vCard');
    }
  }, [previewData, profileUrl]);

  const actionMenuItems = useMemo<CommonDropdownItem[]>(
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
      contextMenuItems={actionMenuItems}
      className='bg-surface-1'
    >
      <div className='flex h-full flex-col'>
        {/* Header with action buttons */}
        <DrawerHeader
          title='Live Preview'
          onClose={close}
          actions={
            <div className='flex items-center gap-1'>
              {/* Action menu */}
              <CommonDropdown
                variant='dropdown'
                items={actionMenuItems}
                trigger={
                  <button
                    type='button'
                    className='h-7 px-2 text-xs rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ease-out'
                    aria-label='Profile actions'
                  >
                    <MoreVertical className='h-3.5 w-3.5' aria-hidden='true' />
                  </button>
                }
                align='end'
              />
              {/* Open button */}
              <a
                href={profileUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='h-7 px-2 text-xs rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ease-out inline-flex items-center justify-center'
                aria-label='Open profile in new tab'
              >
                <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
              </a>
            </div>
          }
        />

        {/* Preview Content */}
        <div className='flex-1 min-h-0 overflow-y-auto p-4'>
          <div className='flex flex-col items-center gap-4 pb-8'>
            <div className='w-full max-w-[360px] aspect-[9/19.5] max-h-[740px] overflow-hidden rounded-2xl border border-subtle bg-surface-1/40 ring-1 ring-inset ring-white/5 dark:ring-white/10 shadow-sm shadow-black/10 dark:shadow-black/40'>
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
        <div className='shrink-0 border-t border-subtle bg-surface-0/95 p-4 backdrop-blur-sm'>
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

export { PREVIEW_PANEL_WIDTH };
