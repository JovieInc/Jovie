import { Button, HostDrawnTextarea } from '@jovie/ui';
import { ArrowRight } from 'lucide-react';
import { FlatPanel, StepFrame } from './OnboardingV2Panels';
import { canProceedToDashboard } from './onboardingV2Model';
import type { OnboardingV2StepContext } from './onboardingV2StepContext';

export function OnboardingV2ProfileReadyStep({
  ctx,
}: Readonly<{ ctx: OnboardingV2StepContext }>) {
  const {
    anythingElse,
    didCopyInstagramBioLink,
    didOpenInstagram,
    discoverySnapshot,
    handleCopyInstagramBioLink,
    handleOpenDashboard,
    handleOpenInstagram,
    publicProfileUrl,
    setAnythingElse,
  } = ctx;

  return (
    <StepFrame
      title='Your Link Is Live'
      prompt='Put your Jovie link where fans already look. We will count activation when the first Instagram visitor lands on it.'
      actions={
        <>
          <Button onClick={handleCopyInstagramBioLink}>
            Copy Instagram Bio Link
          </Button>
          <Button onClick={handleOpenInstagram} variant='secondary'>
            Open Instagram
          </Button>
          <Button
            disabled={!canProceedToDashboard(discoverySnapshot)}
            onClick={handleOpenDashboard}
            variant='ghost'
          >
            Open Dashboard
            <ArrowRight className='ml-1 h-4 w-4' />
          </Button>
        </>
      }
    >
      <FlatPanel>
        <div className='space-y-4'>
          <div>
            <p className='text-2xs font-semibold text-tertiary-token'>
              Your public link
            </p>
            <p className='mt-1 text-base font-semibold text-primary-token'>
              {publicProfileUrl ?? 'Your Jovie link will appear here'}
            </p>
            <p className='mt-2 text-sm leading-6 text-secondary-token'>
              We copy a tagged Instagram bio link so your first visit gets
              attributed even when referrers are weak.
            </p>
          </div>
          <ol className='space-y-3'>
            <li className='flex items-start gap-3'>
              <span className='system-b-onboarding-step-number'>1</span>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  Copy your Instagram bio link
                </p>
                <p className='text-sm leading-6 text-secondary-token'>
                  {didCopyInstagramBioLink
                    ? 'Copied. Paste this version so Instagram traffic stays attributable.'
                    : 'Use the primary action above to copy the tagged version.'}
                </p>
              </div>
            </li>
            <li className='flex items-start gap-3'>
              <span className='system-b-onboarding-step-number'>2</span>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  Open Instagram
                </p>
                <p className='text-sm leading-6 text-secondary-token'>
                  {didOpenInstagram
                    ? 'Instagram is open. Head to Edit Profile.'
                    : 'Open your profile settings and go to Edit Profile.'}
                </p>
              </div>
            </li>
            <li className='flex items-start gap-3'>
              <span className='system-b-onboarding-step-number'>3</span>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  Paste it into your bio
                </p>
                <p className='text-sm leading-6 text-secondary-token'>
                  Put the copied link in the website field. Activation happens
                  on the first Instagram-sourced visit.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </FlatPanel>

      <FlatPanel className='border-b-0 pb-0'>
        <label
          className='text-sm font-semibold text-primary-token'
          htmlFor='onboarding-anything-else'
        >
          Anything else I should know?
        </label>
        <div className='system-b-onboarding-context-textarea mt-3'>
          <HostDrawnTextarea
            id='onboarding-anything-else'
            className='w-full'
            onChange={event => setAnythingElse(event.target.value)}
            placeholder='Optional context for your first Jovie chat…'
            rows={5}
            value={anythingElse}
          />
        </div>
      </FlatPanel>
    </StepFrame>
  );
}
