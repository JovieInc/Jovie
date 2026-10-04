'use client';

// @coverage-via apps/web/tests/unit/onboarding/OnboardingShell.sign-in-placement.test.tsx

import { Button } from '@jovie/ui';
import { LoaderCircle } from 'lucide-react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  ONBOARDING_ENTRY_SUPPORT,
  ONBOARDING_ENTRY_TITLE,
} from '@/lib/onboarding/empty-state';
import type { StartEntryProfile } from '@/lib/onboarding/start-entry-profile';

export type OnboardingEntryMode =
  | 'blank'
  | 'handle_entry'
  | 'prompt_handoff'
  | 'restoring_intent'
  | 'spotify_handoff';

interface OnboardingChatEmptyIntroProps {
  readonly mode: OnboardingEntryMode;
  readonly entryProfile?: StartEntryProfile | null;
  /** Taken handle: focus the composer so the visitor can ask for another name. */
  readonly onTryAnotherName?: () => void;
}

const MAX_ENTRY_ICONS = 6;

function getHandleEntryCopy(entry: StartEntryProfile): {
  readonly title: string;
  readonly support: string;
} {
  switch (entry.status) {
    case 'claimable':
      return {
        title: 'Your page is ready',
        support: `We built jov.ie/${entry.handle} from your public links. Send the message below to claim it.`,
      };
    case 'claimed':
      return {
        title: 'This page is taken',
        support: `jov.ie/${entry.handle} is already claimed. If it's yours, sign in.`,
      };
    case 'available':
      return {
        title: `Claim jov.ie/${entry.handle}`,
        support: "Send the message below and I'll set up your page.",
      };
  }
}

/**
 * Compact identity row for `/start?handle=` (JOV-7753): the visitor's real
 * photo, name, and the links we found. Desktop shows the full page preview in
 * the side rail instead, so this row is mobile-only there.
 */
function EntryProfileCard({
  entry,
}: {
  readonly entry: Exclude<StartEntryProfile, { status: 'available' }>;
}) {
  const platforms =
    entry.status === 'claimable'
      ? entry.linkPlatforms.slice(0, MAX_ENTRY_ICONS)
      : [];

  return (
    <div
      className='mb-6 flex w-full max-w-88 items-center gap-3 rounded-2xl border border-subtle bg-surface-1 p-3 text-left lg:hidden'
      data-testid='onboarding-entry-profile'
      data-entry-status={entry.status}
    >
      <ImageWithFallback
        src={entry.avatarUrl}
        alt=''
        width={56}
        height={56}
        fallbackVariant='avatar'
        className='h-14 w-14 shrink-0 rounded-full object-cover'
        fallbackClassName='h-14 w-14 shrink-0 rounded-full'
      />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-mid font-semibold text-primary-token'>
          {entry.displayName}
        </p>
        <p className='truncate text-app text-secondary-token'>
          jov.ie/{entry.handle}
        </p>
        {entry.status === 'claimable' && entry.linkCount > 0 ? (
          <div className='mt-1.5 flex min-h-4 items-center gap-1.5 text-secondary-token'>
            {platforms.map(platform => (
              <SocialIcon
                key={platform}
                platform={platform}
                className='h-3.5 w-3.5'
                aria-hidden
              />
            ))}
            <span className='text-2xs'>
              {entry.linkCount === 1 ? '1 link' : `${entry.linkCount} links`}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getEntryCopy(mode: OnboardingEntryMode): {
  readonly title: string;
  readonly support: string;
} {
  switch (mode) {
    case 'spotify_handoff':
      return {
        title: 'Getting your artist ready',
        support: 'Your message is on its way.',
      };
    case 'prompt_handoff':
      return {
        title: 'Getting this ready',
        support: 'Your message is on its way.',
      };
    case 'restoring_intent':
      return {
        title: 'Restoring your start',
        support: 'Checking the handoff from your last step.',
      };
    case 'blank':
    case 'handle_entry':
      return {
        title: ONBOARDING_ENTRY_TITLE,
        support: ONBOARDING_ENTRY_SUPPORT,
      };
  }
}

export function OnboardingChatEmptyIntro({
  mode,
  entryProfile,
  onTryAnotherName,
}: OnboardingChatEmptyIntroProps) {
  if (mode === 'handle_entry' && entryProfile) {
    const copy = getHandleEntryCopy(entryProfile);
    return (
      <div
        className='mx-auto flex w-full max-w-[45rem] flex-col items-center'
        data-entry-mode={mode}
        data-testid='onboarding-empty-intro'
      >
        {entryProfile.status === 'available' ? null : (
          <EntryProfileCard entry={entryProfile} />
        )}
        <div className='mb-6 text-center'>
          <h1 className='text-2xl font-semibold text-primary-token'>
            {copy.title}
          </h1>
          <p className='mx-auto mt-2 max-w-112 text-sm leading-6 text-secondary-token'>
            {copy.support}
          </p>
          {entryProfile.status === 'claimed' && onTryAnotherName ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='mt-4'
              onClick={onTryAnotherName}
              data-testid='onboarding-entry-try-another-name'
            >
              Try Another Name
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

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
          <BrandLogo size='splash' aria-hidden={true} />
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
