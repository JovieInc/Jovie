'use client';

import { Button } from '@jovie/ui';
import { Copy, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
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
  const [copied, setCopied] = useState(false);

  // Don't render anything until we have preview data
  if (!previewData) {
    return (
      <div className='flex h-full items-center justify-center p-6'>
        <p className='text-secondary-token'>No profile to preview</p>
      </div>
    );
  }

  const { username, displayName, avatarUrl, links, profilePath } = previewData;

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}${profilePath}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Profile URL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className='h-full flex flex-col'>
      {/* Header with action buttons */}
      <div className='flex h-12 items-center justify-between border-b border-subtle bg-surface-2/95 px-4 shrink-0 backdrop-blur-sm'>
        <h2 className='text-[13px] font-medium text-primary-token'>
          Live Preview
        </h2>
        <div className='flex items-center gap-1'>
          {/* Copy button */}
          <button
            type='button'
            onClick={handleCopy}
            className='h-7 px-2 text-xs rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors'
            aria-label={copied ? 'Copied!' : 'Copy profile URL'}
          >
            <Copy className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
          {/* Open button */}
          <Link
            href={profilePath}
            target='_blank'
            rel='noopener noreferrer'
            className='h-7 px-2 text-xs rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors inline-flex items-center justify-center'
            aria-label='Open profile in new tab'
          >
            <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
          </Link>
          {/* Close button */}
          <DashboardHeaderActionButton
            ariaLabel='Close preview'
            onClick={close}
            icon={<X className='h-4 w-4' aria-hidden='true' />}
          />
        </div>
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

          {/* Hero CTA - View Jovie Profile */}
          <Button asChild variant='primary' className='w-full max-w-[360px]'>
            <Link href={profilePath} target='_blank' rel='noopener noreferrer'>
              <ExternalLink className='h-4 w-4 mr-2' aria-hidden='true' />
              View Jovie Profile
            </Link>
          </Button>
        </div>
      </div>

      {/* Footer - URL Preview */}
      <div className='shrink-0 border-t border-subtle bg-surface-2/95 p-4 backdrop-blur-sm'>
        <h3 className='text-[13px] font-medium text-primary-token mb-2'>
          Your Profile URL
        </h3>
        <div className='rounded-lg border border-subtle bg-surface-1/40 px-3 py-2 text-[12px] text-primary-token font-sans truncate'>
          {typeof window !== 'undefined'
            ? `${window.location.origin}${profilePath}`
            : 'Loading...'}
        </div>
        <p className='mt-2 text-xs text-secondary-token'>
          Share this link with your audience
        </p>
      </div>
    </div>
  );
}
