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
            <span className='text-success animate-in fade-in-0 duration-200'>
              Link copied to clipboard!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
