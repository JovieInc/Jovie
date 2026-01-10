'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';

/**
 * PreviewPanelContent - Profile preview drawer content
 *
 * Extracted from PreviewPanel, renders preview in UnifiedDrawer.
 * Used on dashboard profile page to show live preview of user's profile.
 */
export function PreviewPanelContent() {
  const { close, previewData } = usePreviewPanel();

  // Don't render anything until we have preview data
  if (!previewData) {
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <p className='text-secondary-token'>No profile to preview</p>
      </div>
    );
  }

  const { username, displayName, avatarUrl, links, profilePath } = previewData;

  return (
    <div className='h-full flex flex-col'>
      {/* Header */}
      <div className='flex h-12 items-center justify-between border-b border-subtle bg-surface-2/95 px-4 shrink-0 backdrop-blur-sm'>
        <h2 className='text-[13px] font-medium text-primary-token'>
          Live Preview
        </h2>
        <DashboardHeaderActionButton
          ariaLabel='Close preview'
          onClick={close}
          icon={<X className='h-4 w-4' aria-hidden='true' />}
        />
      </div>

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
      <div className='shrink-0 border-t border-subtle bg-surface-2/95 p-4 backdrop-blur-sm'>
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
  );
}
