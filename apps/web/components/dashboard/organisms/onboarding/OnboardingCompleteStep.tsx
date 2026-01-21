'use client';

import { AuthButton, AuthLinkPreviewCard } from '@/components/auth';

interface OnboardingCompleteStepProps {
  title: string;
  prompt?: string;
  displayDomain: string;
  handle: string;
  copied: boolean;
  onGoToDashboard: () => void;
  onCopyLink: () => void;
}

export function OnboardingCompleteStep({
  title,
  prompt,
  displayDomain,
  handle,
  copied,
  onGoToDashboard,
  onCopyLink,
}: OnboardingCompleteStepProps) {
  return (
    <div className='flex flex-col items-center justify-center h-full space-y-8'>
      <div className='text-center space-y-3 max-w-xl px-4'>
        <h1 className='text-lg font-medium text-primary-token text-center'>
          {title}
        </h1>
        {prompt ? (
          <p className='text-sm text-secondary-token text-center'>{prompt}</p>
        ) : null}
      </div>

      <div className='w-full max-w-md space-y-6'>
        <AuthLinkPreviewCard
          label='Your link'
          hrefText={`${displayDomain}/${handle}`}
        />

        <div className='space-y-4'>
          <AuthButton onClick={onGoToDashboard}>Go to Dashboard</AuthButton>

          <AuthButton onClick={onCopyLink} variant='secondary'>
            Copy Link
          </AuthButton>
        </div>

        {copied && (
          <div className='p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-xl text-green-600 dark:text-green-400 text-sm text-center'>
            Link copied to clipboard!
          </div>
        )}
      </div>
    </div>
  );
}
