'use client';

import { AuthLayout } from '@/features/auth';
import type { WaitlistAccessOutcome } from '@/lib/waitlist/access-request';
import { WaitlistOutcomeView } from './WaitlistOutcomeView';

interface WaitlistSuccessViewProps {
  readonly outcome?: WaitlistAccessOutcome | 'pending';
  readonly onRetry?: () => void;
}

export function WaitlistSuccessView({
  outcome = 'pending',
  onRetry,
}: Readonly<WaitlistSuccessViewProps>) {
  return (
    <AuthLayout
      formTitle='Request Access'
      showFormTitle={false}
      showFooterPrompt={false}
    >
      <WaitlistOutcomeView outcome={outcome} onRetry={onRetry} />
    </AuthLayout>
  );
}
