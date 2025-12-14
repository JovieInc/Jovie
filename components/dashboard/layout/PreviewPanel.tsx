'use client';

import {
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import Link from 'next/link';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { RightDrawer } from '@/components/organisms/RightDrawer';

const PREVIEW_PANEL_WIDTH = 400;

export function PreviewPanel() {
  const { isOpen, close, previewData } = usePreviewPanel();

  // Don't render anything until we have preview data
  if (!previewData) {
    return null;
  }

  const { username, avatarUrl, links, profilePath } = previewData;

  return (
    <RightDrawer
      isOpen={isOpen}
      width={PREVIEW_PANEL_WIDTH}
      ariaLabel='Live Preview'
      className='bg-sidebar-surface border-sidebar-border'
    >
      {/* Header */}
      <div className='flex h-12 items-center justify-between border-b border-subtle px-4 shrink-0'>
        <h2 className='text-[13px] font-medium text-primary-token'>
          Live Preview
        </h2>
        <DashboardHeaderActionButton
          ariaLabel='Close preview'
          onClick={close}
          icon={<XMarkIcon className='h-4 w-4' aria-hidden='true' />}
        />
      </div>

      {/* Preview Content */}
      <div className='flex-1 min-h-0 overflow-hidden p-4'>
        <div className='h-full w-full overflow-hidden rounded-2xl border border-subtle bg-bg-base'>
          <ProfilePreview
            username={username}
            avatarUrl={avatarUrl}
            links={links}
            className='h-full w-full'
          />
        </div>
      </div>

      {/* Footer - URL Preview */}
      <div className='shrink-0 border-t border-subtle p-4'>
        <h3 className='text-[13px] font-medium text-primary-token mb-2'>
          Your Profile URL
        </h3>
        <div className='flex flex-col gap-2'>
          <div className='rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary-token font-mono truncate'>
            {typeof window !== 'undefined'
              ? `${window.location.origin}${profilePath}`
              : 'Loading...'}
          </div>
          <div className='flex gap-2'>
            <CopyToClipboardButton
              relativePath={profilePath}
              idleLabel='Copy'
              successLabel='Copied!'
            />
            <Button
              asChild
              size='sm'
              variant='secondary'
              className='flex-1 whitespace-nowrap'
            >
              <Link
                href={profilePath}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ArrowTopRightOnSquareIcon className='h-4 w-4 mr-1.5' />
                Open
              </Link>
            </Button>
          </div>
        </div>
        <p className='mt-2 text-xs text-secondary-token'>
          Share this link with your audience
        </p>
      </div>
    </RightDrawer>
  );
}

export { PREVIEW_PANEL_WIDTH };
