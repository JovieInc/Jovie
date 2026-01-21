'use client';

import { AuthButton, AuthLinkPreviewCard } from '@/components/auth';
import { FORM_LAYOUT } from '@/lib/auth/constants';

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

        <div className={FORM_LAYOUT.formInner}>
          <AuthButton onClick={onGoToDashboard}>Go to Dashboard</AuthButton>

          <AuthButton onClick={onCopyLink} variant='secondary'>
            Copy Link
          </AuthButton>
        </div>

        <div className={FORM_LAYOUT.footerHint}>
          {copied && (
            <span className='text-green-600 dark:text-green-400 animate-in fade-in-0 duration-200'>
              Link copied to clipboard!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
