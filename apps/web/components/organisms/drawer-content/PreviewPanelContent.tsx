'use client';

import { Button } from '@jovie/ui';
import { Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { usePreviewPanel } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { DrawerHeader } from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { BASE_URL } from '@/constants/domains';

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

/**
 * PreviewPanelContent - Profile preview drawer content
 *
 * Extracted from PreviewPanel, renders preview in UnifiedDrawer.
 * Used on dashboard profile page to show live preview of user's profile.
 */
export function PreviewPanelContent() {
  const { close, previewData } = usePreviewPanel();

  // Compute values from preview data (safe to compute even when null)
  const username = previewData?.username ?? '';
  const displayName = previewData?.displayName ?? '';
  const avatarUrl = previewData?.avatarUrl ?? null;
  const links = previewData?.links ?? [];
  const profilePath = previewData?.profilePath ?? '';

  // Use BASE_URL to ensure profile links always point to the profile domain
  const profileUrl = profilePath ? `${BASE_URL}${profilePath}` : '';

  // Action handlers - defined inline, no useCallback needed for simple handlers
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast.success('Profile URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleDownloadQr = async () => {
    try {
      const qrUrl = getQrCodeUrl(profileUrl, 512);
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      downloadBlob(blob, `${username || 'jovie'}-qr-code.png`);
      toast.success('QR code downloaded');
    } catch {
      toast.error('Failed to download QR code');
    }
  };

  const handleDownloadVcard = () => {
    try {
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${displayName || username}`,
        `URL:${profileUrl}`,
        'END:VCARD',
      ].join('\n');

      downloadBlob(
        new Blob([vcard], { type: 'text/vcard' }),
        `${username || 'jovie'}.vcf`
      );
      toast.success('vCard downloaded');
    } catch {
      toast.error('Failed to download vCard');
    }
  };

  // Header actions using DrawerHeaderActions for consistent styling
  const primaryActions: DrawerHeaderAction[] = useMemo(
    () => [
      {
        id: 'open',
        label: 'Open profile in new tab',
        icon: ExternalLink,
        href: profileUrl || undefined,
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
        onClick: () => void handleCopyUrl(),
      },
      {
        id: 'download-qr',
        label: 'Download QR Code',
        icon: QrCode,
        onClick: () => void handleDownloadQr(),
      },
      {
        id: 'download-vcard',
        label: 'Download vCard',
        icon: Download,
        onClick: handleDownloadVcard,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers use stable values
    [profileUrl, username, displayName]
  );

  // Early return AFTER all hooks
  if (!previewData) {
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <p className='text-secondary-token'>No profile to preview</p>
      </div>
    );
  }

  return (
    <div className='h-full flex flex-col'>
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
  );
}
