import type { ReactNode } from 'react';
import { FORM_LAYOUT } from '@/lib/auth/constants';

/**
 * The checkout's content column. Auto margins centre a short page and pin a
 * tall one to the top of the frame's scroll box.
 */
export function OnboardingCheckoutColumn({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className={`m-auto w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
      {children}
    </div>
  );
}
