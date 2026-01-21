'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { DrawerHeader } from '@/components/molecules/drawer';
import { RightDrawer } from '@/components/organisms/RightDrawer';

const PREVIEW_PANEL_WIDTH = 360;

const CONTEXT_MENU_ITEM_CLASS =
  'rounded-md px-2 py-1 text-[12.5px] font-medium leading-[16px] [&_svg]:text-tertiary-token hover:[&_svg]:text-secondary-token data-[highlighted]:[&_svg]:text-secondary-token focus-visible:[&_svg]:text-secondary-token';

export function PreviewPanel() {
  const { isOpen, close, previewData } = usePreviewPanel();

  const copyProfileUrl = useCallback(async () => {
    if (!previewData) return;
    try {
      const url = `${window.location.origin}${previewData.profilePath}`;
      await navigator.clipboard.writeText(url);
      toast.success('Profile URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  }, [previewData]);

  const contextMenuItems = useMemo<CommonDropdownItem[]>(() => {
    if (!previewData) return [];

    return [
      {
        type: 'action',
        id: 'copy-url',
        label: 'Copy profile URL',
        icon: <Copy className='h-4 w-4' />,
        onClick: copyProfileUrl,
        className: CONTEXT_MENU_ITEM_CLASS,
      },
      {
        type: 'action',
        id: 'open-profile',
        label: 'Open in new tab',
        icon: <ExternalLink className='h-4 w-4' />,
        onClick: () => window.open(previewData.profilePath, '_blank'),
        className: CONTEXT_MENU_ITEM_CLASS,
      },
      {
        type: 'action',
        id: 'refresh',
        label: 'Refresh preview',
        icon: <RefreshCw className='h-4 w-4' />,
        onClick: () => window.location.reload(),
        className: CONTEXT_MENU_ITEM_CLASS,
      },
    ];
  }, [previewData, copyProfileUrl]);

  // Don't render anything until we have preview data
  if (!previewData) {
    return null;
  }

  const { username, displayName, avatarUrl, links, profilePath } = previewData;

  return (
    <RightDrawer
      isOpen={isOpen}
      width={PREVIEW_PANEL_WIDTH}
      ariaLabel='Live Preview'
      contextMenuItems={contextMenuItems}
      className='bg-surface-1'
    >
      <div className='flex h-full flex-col'>
        {/* Header */}
        <DrawerHeader title='Live Preview' onClose={close} />

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
          </div>
        </div>

        {/* Footer - URL Preview */}
        <div className='shrink-0 border-t border-subtle bg-surface-0/95 p-4 backdrop-blur-sm'>
          <h3 className='text-[13px] font-medium text-primary-token mb-2'>
            Your Profile URL
          </h3>
          <div className='flex flex-col gap-2'>
            <div className='rounded-lg border border-subtle bg-surface-1/40 px-3 py-2 text-[12px] text-primary-token font-sans truncate'>
              {typeof window !== 'undefined'
                ? `${window.location.origin}${profilePath}`
                : 'Loading...'}
            </div>
            <div className='flex gap-2'>
              <CopyToClipboardButton
                relativePath={profilePath}
                idleLabel='Copy'
                successLabel='Copied!'
                className='flex-1 whitespace-nowrap border border-subtle bg-surface-1/40 ring-1 ring-inset ring-white/5 transition-colors hover:bg-surface-2/40 dark:ring-white/10'
              />
              <Button
                asChild
                size='sm'
                variant='secondary'
                className='flex-1 whitespace-nowrap border border-subtle bg-surface-1/40 ring-1 ring-inset ring-white/5 transition-colors hover:bg-surface-2/40 dark:ring-white/10'
              >
                <Link
                  href={profilePath}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <ExternalLink className='h-4 w-4 mr-1.5' />
                  Open Jovie Profile
                </Link>
              </Button>
            </div>
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
