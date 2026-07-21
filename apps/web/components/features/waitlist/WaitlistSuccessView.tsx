'use client';

import { AuthLayout } from '@/features/auth';
import {
  type WaitlistDisplayOutcome,
  WaitlistOutcomeView,
} from './WaitlistOutcomeView';

interface WaitlistSuccessViewProps {
  readonly outcome?: WaitlistDisplayOutcome;
  readonly onRetry?: () => void;
  /** Optional contact email shown in the completion receipt. */
  readonly email?: string | null;
}

export function WaitlistSuccessView({
  outcome = 'pending',
  onRetry,
  email,
}: Readonly<WaitlistSuccessViewProps>) {
  return (
    <AuthLayout
      formTitle='Request Access'
      showFormTitle={false}
      showFooterPrompt={false}
    >
      <WaitlistOutcomeView outcome={outcome} onRetry={onRetry} email={email} />
    </AuthLayout>
  );
}
