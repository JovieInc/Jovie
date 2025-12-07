'use client';

import {
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import Link from 'next/link';
import { usePreviewPanel } from '@/app/dashboard/PreviewPanelContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { cn } from '@/lib/utils';

const PREVIEW_PANEL_WIDTH = 400;

export function PreviewPanel() {
  const { isOpen, close, previewData } = usePreviewPanel();

  // Don't render anything until we have preview data
  if (!previewData) {
    return null;
  }

  const { username, avatarUrl, links, profilePath } = previewData;

  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        'fixed top-0 right-0 z-40 h-svh flex flex-col',
        'bg-surface-1 border-l border-subtle shadow-xl',
        'transition-[transform,opacity] duration-300 ease-out',
        isOpen
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0 pointer-events-none'
      )}
      style={{ width: PREVIEW_PANEL_WIDTH }}
    >
      {/* Header */}
      <div className='flex items-center justify-between px-4 py-3 border-b border-subtle shrink-0'>
        <h2 className='text-lg font-semibold text-primary-token'>
          Live Preview
        </h2>
        <Button
          variant='ghost'
          size='icon'
          onClick={close}
          aria-label='Close preview'
          className='h-8 w-8'
        >
          <XMarkIcon className='h-5 w-5' />
        </Button>
      </div>

      {/* Preview Content */}
      <div className='flex-1 min-h-0 overflow-hidden p-4'>
        <div className='h-full w-full overflow-hidden rounded-xl border border-subtle bg-base'>
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
        <h3 className='text-sm font-medium text-primary-token mb-2'>
          Your Profile URL
        </h3>
        <div className='flex flex-col gap-2'>
          <div className='bg-surface-2 rounded-lg px-3 py-2 text-sm text-primary-token font-mono truncate'>
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
              className='flex-1 whitespace-nowrap bg-white text-black hover:bg-gray-100 dark:bg-white dark:text-black dark:hover:bg-gray-100'
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
    </aside>
  );
}

export { PREVIEW_PANEL_WIDTH };
