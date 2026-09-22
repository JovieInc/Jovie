'use client';

import {
  ChangelogEmailSignup,
  type ChangelogEmailSignupCopy,
} from '@/app/(marketing)/changelog/ChangelogEmailSignup';
import { JOVIE_CARD_INTEREST_SOURCE } from '@/data/jovieCardCopy';
import { JovieAuthValuesProvider, useUserSafe } from '@/hooks/useJovieAuth';

const CARD_SIGNUP_COPY: ChangelogEmailSignupCopy = {
  idleHeading: 'Join the Jovie Card list',
  idleDescription: 'Get access updates as the Jovie Card rollout develops.',
  buttonLabel: 'Join the list',
  consent:
    'Email me Jovie product updates, including Jovie Card access updates. Unsubscribe anytime.',
  successHeading: 'Check your email',
  successDescription:
    'Confirm your email to receive Jovie Card access updates.',
  subscribedHeading: 'You’re on the list',
  subscribedDescription: 'This email already receives Jovie product updates.',
};

export function JovieCardInterestCapture() {
  const { user } = useUserSafe();

  return (
    <ChangelogEmailSignup
      source={JOVIE_CARD_INTEREST_SOURCE}
      initialEmail={user?.primaryEmailAddress?.emailAddress ?? ''}
      copy={CARD_SIGNUP_COPY}
    />
  );
}

export function JovieCardInterestCaptureWithAuth() {
  return (
    <JovieAuthValuesProvider>
      <JovieCardInterestCapture />
    </JovieAuthValuesProvider>
  );
}
