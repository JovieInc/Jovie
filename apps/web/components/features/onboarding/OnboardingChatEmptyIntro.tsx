'use client';

import { LoaderCircle } from 'lucide-react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import {
  ONBOARDING_ENTRY_SUPPORT,
  ONBOARDING_ENTRY_TITLE,
} from '@/lib/onboarding/empty-state';

export type OnboardingEntryMode =
  | 'blank'
  | 'prompt_handoff'
  | 'restoring_intent'
  | 'spotify_handoff';

interface OnboardingChatEmptyIntroProps {
  readonly mode: OnboardingEntryMode;
}

function getEntryCopy(mode: OnboardingEntryMode): {
  readonly title: string;
  readonly support: string;
} {
  switch (mode) {
    case 'spotify_handoff':
      return {
        title: 'Getting Your Artist Ready',
        support: 'Your message will send after a quick browser verification.',
      };
    case 'prompt_handoff':
      return {
        title: 'Getting This Ready',
        support: 'Your message will send after a quick browser verification.',
      };
    case 'restoring_intent':
      return {
        title: 'Restoring Your Start',
        support: 'Checking the handoff from your last step.',
      };
    case 'blank':
      return {
        title: ONBOARDING_ENTRY_TITLE,
        support: ONBOARDING_ENTRY_SUPPORT,
      };
  }
}

export function OnboardingChatEmptyIntro({
  mode,
}: OnboardingChatEmptyIntroProps) {
  const copy = getEntryCopy(mode);
  const isBlank = mode === 'blank';

  return (
    <div
      className='mx-auto flex w-full max-w-[45rem] flex-col items-center'
      data-entry-mode={mode}
      data-testid='onboarding-empty-intro'
    >
      {!isBlank ? (
        <div
          aria-hidden='true'
          className='mb-4 text-primary-token opacity-[0.18]'
        >
          <BrandLogo size={56} aria-hidden={true} />
        </div>
      ) : null}

      <div className='mb-6 text-center'>
        <h1 className='text-2xl font-semibold text-primary-token'>
          {copy.title}
        </h1>
        {!isBlank ? (
          <p className='mt-2 text-sm leading-6 text-secondary-token'>
            {copy.support}
          </p>
        ) : null}
      </div>

      {!isBlank ? (
        <div className='flex min-h-11 items-start justify-center pt-3'>
          <div
            className='inline-flex min-h-11 items-center gap-2 text-xs text-secondary-token'
            role='status'
            aria-live='polite'
          >
            <LoaderCircle
              className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
              aria-hidden='true'
            />
            Preparing your first message
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Start's blank composer gets its own ambient treatment rather than borrowing
 * the generic chat logo. It is absolutely positioned so the mark never takes
 * up layout space or shifts while the composer changes state.
 */
export function OnboardingComposerAmbientMark() {
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[20rem] overflow-hidden sm:h-[24rem]'
      data-testid='onboarding-start-ambient-mark'
    >
      <JovieMarkElectric
        size={560}
        idSeed='start-ambient-mark'
        settledSpark
        className='absolute left-1/2 top-[4.5rem] -translate-x-1/2 opacity-[0.22] [mask-image:linear-gradient(142deg,transparent_0%,black_28%,black_78%,transparent_100%)] sm:top-[3rem]'
      />
    </div>
  );
}
