'use client';

import { Button, type CommonDropdownItem } from '@jovie/ui';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  QrCode,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  DrawerButton,
  DrawerEmptyState,
  DrawerHeader,
} from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { BASE_URL } from '@/constants/domains';
import { CopyLinkInput } from '@/features/dashboard/atoms/CopyLinkInput';
import { ProfilePreview } from '@/features/dashboard/molecules/ProfilePreview';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { useQrCodeDownloadMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const PREVIEW_PANEL_WIDTH = 360;

/** Empty / loading state shown while preview data is hydrating. */
function PreviewPanelEmpty({
  isOpen,
  close,
}: Readonly<{
  isOpen: boolean;
  close: () => void;
}>) {
  return (
    <RightDrawer
      isOpen={isOpen}
      width={PREVIEW_PANEL_WIDTH}
      ariaLabel='Live Preview'
    >
      <div className='flex h-full flex-col'>
        <DrawerHeader
          title='Live preview'
          actions={
            <DrawerHeaderActions
              primaryActions={[]}
              overflowActions={[]}
              onClose={close}
            />
          }
        />

        <div className='flex-1 min-h-0 overflow-y-auto px-4 py-3'>
          <div className='space-y-3 pb-5'>
            <div className={cn(LINEAR_SURFACE.drawerCard, 'space-y-3 p-3')}>
              <div className='space-y-0.5'>
                <p className='text-3xs font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                  Live preview
                </p>
                <p className='text-xs text-secondary-token'>
                  This drawer will populate as soon as the profile preview state
                  hydrates.
                </p>
              </div>

              <DrawerEmptyState message='Loading profile preview…' />

              <div className='mx-auto w-full max-w-[320px]'>
                <div className={cn(LINEAR_SURFACE.sidebarCard, 'p-2.5')}>
                  <div className='rounded-[24px] border border-(--linear-app-frame-seam) bg-surface-1 p-2'>
                    <div className='mb-2 flex items-center justify-between px-2.5 pt-1'>
                      <div className='h-2.5 w-16 rounded skeleton' />
                      <div className='h-5 w-20 rounded-[8px] skeleton' />
                    </div>
                    <div className='relative aspect-[9/19.5] overflow-hidden rounded-[22px] border border-(--linear-app-frame-seam) bg-surface-0'>
                      <div className='pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2.5'>
                        <div className='h-1.5 w-24 rounded-full bg-black/55' />
                      </div>
                      <div className='flex h-full flex-col items-center justify-center gap-3 px-6'>
                        <div className='h-16 w-16 rounded-full skeleton' />
                        <div className='h-3 w-28 rounded skeleton' />
                        <div className='h-3 w-40 rounded skeleton' />
                        <div className='mt-2 h-9 w-full rounded-[16px] skeleton' />
                        <div className='h-9 w-full rounded-[16px] skeleton' />
                        <div className='h-9 w-full rounded-[16px] skeleton' />
                      </div>
                      <div className='pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2.5'>
                        <div className='h-1.5 w-28 rounded-full bg-black/55' />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RightDrawer>
  );
}

function getHometownTag(
  hometown: string | null | undefined,
  location: string | null | undefined
): string | null {
  if (!hometown || hometown === location || hometown.trim().length === 0) {
    return null;
  }
  return `From ${hometown}`;
}

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
  const qrCodeDownload = useQrCodeDownloadMutation();
  const [isUrlCopied, setIsUrlCopied] = useState(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const profileUrl = useMemo(() => {
    if (!previewData) return '';
    return `${BASE_URL}${previewData.profilePath}`;
  }, [previewData]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setIsUrlCopied(true);
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = setTimeout(
        () => setIsUrlCopied(false),
        2000
      );
      toast.success('Profile URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  }, [profileUrl]);

  const handleDownloadQr = useCallback(() => {
    if (!previewData) return;
    const qrUrl = getQrCodeUrl(profileUrl, 512);
    qrCodeDownload.mutate({
      qrUrl,
      filename: `${previewData.username || 'jovie'}-qr-code.png`,
    });
  }, [profileUrl, previewData, qrCodeDownload]);

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
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: handleCopyUrl,
      },
      {
        type: 'action',
        id: 'open-profile',
        label: 'Open profile in new tab',
        icon: <ExternalLink className='h-3.5 w-3.5' />,
        onClick: () =>
          globalThis.open(profileUrl, '_blank', 'noopener,noreferrer'),
      },
      {
        type: 'separator',
        id: 'preview-panel-separator-downloads',
      },
      {
        type: 'action',
        id: 'download-qr',
        label: 'Download QR Code',
        icon: <QrCode className='h-3.5 w-3.5' />,
        onClick: handleDownloadQr,
      },
      {
        type: 'action',
        id: 'download-vcard',
        label: 'Download vCard',
        icon: <Download className='h-3.5 w-3.5' />,
        onClick: handleDownloadVcard,
      },
    ],
    [handleCopyUrl, handleDownloadQr, handleDownloadVcard, profileUrl]
  );

  // Header actions using DrawerHeaderActions for consistent styling
  const primaryActions: DrawerHeaderAction[] = useMemo(
    () => [
      {
        id: 'copy-url',
        label: isUrlCopied ? 'Copied!' : 'Copy profile URL',
        icon: Copy,
        activeIcon: Check,
        isActive: isUrlCopied,
        onClick: handleCopyUrl,
      },
      {
        id: 'open',
        label: 'Open profile in new tab',
        icon: ExternalLink,
        href: profileUrl,
      },
    ],
    [handleCopyUrl, isUrlCopied, profileUrl]
  );

  if (!previewData) {
    return <PreviewPanelEmpty isOpen={isOpen} close={close} />;
  }

  const { username, displayName, avatarUrl, links } = previewData;
  const visibleLinkCount = links.filter(link => link.isVisible).length;
  const hiddenLinkCount = links.length - visibleLinkCount;
  const hiddenDraftLabel = `${hiddenLinkCount} draft${hiddenLinkCount === 1 ? '' : 's'}`;
  const connectedDspCount = [
    previewData.dspConnections.spotify.connected,
    previewData.dspConnections.appleMusic.connected,
  ].filter(Boolean).length;
  const hasBio = (previewData.bio?.trim().length ?? 0) > 0;
  const hometownTag = getHometownTag(
    previewData.hometown,
    previewData.location
  );
  const snapshotTags = [
    previewData.location,
    hometownTag,
    ...(previewData.genres?.slice(0, 2) ?? []),
    previewData.activeSinceYear ? `Since ${previewData.activeSinceYear}` : null,
    hasBio ? 'Bio live' : null,
    connectedDspCount > 0 ? `${connectedDspCount} connected` : null,
  ].filter(
    (value, i, arr): value is string =>
      Boolean(value) && arr.indexOf(value) === i
  );
  const headerTitle: ReactNode = (
    <div className='min-w-0 space-y-0.5'>
      <p className='text-3xs font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
        Live preview
      </p>
      <div className='flex min-w-0 items-center gap-1.5'>
        <span className='truncate text-xs font-semibold tracking-[-0.01em] text-primary-token'>
          {displayName || username || 'Profile'}
        </span>
        {username && displayName !== username && (
          <span className='truncate text-[11px] text-secondary-token'>
            @{username}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <RightDrawer
      isOpen={isOpen}
      width={PREVIEW_PANEL_WIDTH}
      ariaLabel='Live Preview'
      contextMenuItems={contextMenuItems}
    >
      <div className='flex h-full flex-col'>
        <DrawerHeader
          title={headerTitle}
          actions={
            <DrawerHeaderActions
              primaryActions={primaryActions}
              menuItems={contextMenuItems}
              onClose={close}
            />
          }
        />

        <div className='flex-1 min-h-0 overflow-y-auto px-4 py-3'>
          <div className='space-y-3 pb-5'>
            <div className={cn(LINEAR_SURFACE.drawerCard, 'space-y-3 p-3')}>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <p className='text-3xs font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                    Public profile
                  </p>
                  <p className='text-xs text-secondary-token'>
                    Preview the mobile profile before you publish changes.
                  </p>
                </div>
                <div className='flex items-center gap-1.5'>
                  <div className='rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-1 text-3xs font-caption tracking-[-0.01em] text-secondary-token'>
                    Mobile
                  </div>
                  <div className='rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-1 text-3xs font-caption tracking-[-0.01em] text-secondary-token'>
                    {visibleLinkCount} live
                  </div>
                  {hiddenLinkCount > 0 && (
                    <div className='rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-1 text-3xs font-caption tracking-[-0.01em] text-secondary-token'>
                      {hiddenLinkCount} draft{hiddenLinkCount === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              </div>

              <div className='mx-auto w-full max-w-[320px]'>
                <div className={cn(LINEAR_SURFACE.sidebarCard, 'p-2.5')}>
                  <div className='rounded-[24px] border border-(--linear-app-frame-seam) bg-surface-1 p-2'>
                    <div className='mb-2 flex items-center justify-between px-2.5 pt-1 text-3xs font-caption tracking-[-0.01em] text-secondary-token'>
                      <span>Preview</span>
                      <span className='rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2 py-0.5 text-[9px] tracking-[-0.01em]'>
                        {username ? `@${username}` : 'Profile'}
                      </span>
                    </div>

                    <div className='relative aspect-[9/19.5] max-h-[740px] overflow-hidden rounded-[22px] border border-(--linear-app-frame-seam) bg-surface-0'>
                      <div className='pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2.5'>
                        <div className='h-1.5 w-24 rounded-full bg-black/55' />
                      </div>
                      <ProfilePreview
                        username={username}
                        displayName={displayName}
                        avatarUrl={avatarUrl}
                        links={links}
                        className='h-full w-full'
                      />
                      <div className='pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2.5'>
                        <div className='h-1.5 w-28 rounded-full bg-black/55' />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                asChild
                variant='primary'
                className='h-9 w-full rounded-[10px] text-xs font-caption tracking-[-0.01em]'
              >
                <a href={profileUrl} target='_blank' rel='noopener noreferrer'>
                  <ExternalLink
                    className='mr-2 h-3.5 w-3.5'
                    aria-hidden='true'
                  />
                  Open profile
                </a>
              </Button>

              <div className='grid grid-cols-3 gap-2'>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  className='h-8 rounded-[10px] px-2 text-[11px]'
                  disabled={isUrlCopied}
                  onClick={handleCopyUrl}
                >
                  {isUrlCopied ? (
                    <Check className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
                  ) : (
                    <Copy className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
                  )}
                  {isUrlCopied ? 'Copied' : 'Copy'}
                </DrawerButton>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  className='h-8 rounded-[10px] px-2 text-[11px]'
                  disabled={qrCodeDownload.isPending}
                  onClick={handleDownloadQr}
                >
                  {qrCodeDownload.isPending ? (
                    <Loader2
                      className='mr-1.5 h-3.5 w-3.5 animate-spin'
                      aria-hidden='true'
                    />
                  ) : (
                    <QrCode className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
                  )}
                  {qrCodeDownload.isPending ? 'Saving' : 'QR'}
                </DrawerButton>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  className='h-8 rounded-[10px] px-2 text-[11px]'
                  onClick={handleDownloadVcard}
                >
                  <Download className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
                  vCard
                </DrawerButton>
              </div>
            </div>

            <div className={cn(LINEAR_SURFACE.drawerCard, 'space-y-2.5 p-3')}>
              <div className='space-y-0.5'>
                <p className='text-3xs font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                  Share link
                </p>
                <p className='text-xs text-secondary-token'>
                  Copy the public URL or open it in a new tab.
                </p>
              </div>

              <div className='flex items-center gap-1.5'>
                <CopyLinkInput
                  url={profileUrl}
                  size='md'
                  className='flex-1'
                  inputClassName='h-8 rounded-[8px] border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-1.5 text-[11px]'
                />
                <button
                  type='button'
                  className='shrink-0 rounded-[6px] border border-(--linear-app-frame-seam) bg-surface-0 p-1.5 text-tertiary-token transition-colors hover:border-default hover:bg-surface-1 hover:text-secondary-token'
                  onClick={() =>
                    globalThis.open(profileUrl, '_blank', 'noopener,noreferrer')
                  }
                  aria-label='Open public profile'
                >
                  <ExternalLink className='h-3 w-3' aria-hidden='true' />
                </button>
              </div>

              <p className='text-[11px] text-tertiary-token'>
                Visitors will land on the published mobile profile shown above.
              </p>
            </div>

            <div className={cn(LINEAR_SURFACE.drawerCard, 'space-y-2.5 p-3')}>
              <div className='space-y-0.5'>
                <p className='text-[10.5px] font-caption leading-none text-tertiary-token'>
                  Profile snapshot
                </p>
                <p className='text-xs text-secondary-token'>
                  A quick read on what the public profile is currently showing.
                </p>
              </div>

              <p className='rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-2 text-[11px] leading-5 text-secondary-token'>
                {visibleLinkCount} visible link
                {visibleLinkCount === 1 ? '' : 's'} currently anchor the public
                profile
                {hiddenLinkCount > 0
                  ? `, with ${hiddenDraftLabel} still hidden from visitors.`
                  : '.'}
              </p>

              <div className='grid grid-cols-3 divide-x divide-(--linear-app-frame-seam)'>
                <div className='space-y-px pr-3'>
                  <p className='text-[10.5px] font-medium leading-[14px] text-tertiary-token'>
                    Visible
                  </p>
                  <p className='tabular-nums text-lg font-semibold leading-none tracking-[-0.02em] text-primary-token'>
                    {visibleLinkCount}
                  </p>
                </div>
                <div className='space-y-px px-3'>
                  <p className='text-[10.5px] font-medium leading-[14px] text-tertiary-token'>
                    Hidden
                  </p>
                  <p className='tabular-nums text-lg font-semibold leading-none tracking-[-0.02em] text-primary-token'>
                    {hiddenLinkCount}
                  </p>
                </div>
                <div className='space-y-px pl-3'>
                  <p className='text-[10.5px] font-medium leading-[14px] text-tertiary-token'>
                    DSPs
                  </p>
                  <p className='tabular-nums text-lg font-semibold leading-none tracking-[-0.02em] text-primary-token'>
                    {connectedDspCount}
                  </p>
                </div>
              </div>

              <div className='flex flex-wrap gap-1.5'>
                {snapshotTags.map(tag => (
                  <span
                    key={tag}
                    className='rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-1 text-3xs font-caption tracking-[-0.01em] text-secondary-token'
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RightDrawer>
  );
}
