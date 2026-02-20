'use client';

import { AuthButton, AuthLinkPreviewCard } from '@/components/auth';
import { FORM_LAYOUT } from '@/lib/auth/constants';

interface OnboardingCompleteStepProps {
  readonly title: string;
  readonly prompt?: string;
  readonly displayDomain: string;
  readonly handle: string;
  readonly copied: boolean;
  readonly onGoToDashboard: () => void;
  readonly onCopyLink: () => void;
  readonly spotifyImportStatus: 'idle' | 'importing' | 'success' | 'error';
  readonly spotifyImportStage: 0 | 1 | 2;
  readonly spotifyImportMessage: string;
}

export function OnboardingCompleteStep({
  title,
  prompt,
  displayDomain,
  handle,
  copied,
  onGoToDashboard,
  onCopyLink,
  spotifyImportStatus,
  spotifyImportMessage,
  spotifyImportStage,
}: OnboardingCompleteStepProps) {
  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          {prompt ? <p className={FORM_LAYOUT.hint}>{prompt}</p> : null}
        </div>

        <AuthLinkPreviewCard
          label='Your link'
          hrefText={`${displayDomain}/${handle}`}
        />

        {spotifyImportStatus !== 'idle' && spotifyImportMessage ? (
          <div className='w-full rounded-[--radius-lg] border border-subtle bg-surface-0 px-4 py-3'>
            <div className='mb-2 flex items-center gap-2'>
              <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2'>
                <div
                  className='h-full rounded-full bg-accent transition-all duration-500'
                  style={{ width: `${((spotifyImportStage + 1) / 3) * 100}%` }}
                />
              </div>
              <span className='text-xs text-secondary-token'>
                {spotifyImportStage + 1}/3
              </span>
            </div>
            <p className='text-center text-sm text-secondary-token'>
              {spotifyImportMessage}
            </p>
          </div>
        ) : null}

        <div className={FORM_LAYOUT.formInner}>
          <AuthButton onClick={onGoToDashboard}>Go to Dashboard</AuthButton>

          <AuthButton onClick={onCopyLink} variant='secondary'>
            Copy Link
          </AuthButton>
        </div>

        <div className={FORM_LAYOUT.footerHint}>
          {copied && (
            <span className='text-success animate-in fade-in-0 duration-200'>
              Link copied to clipboard!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
