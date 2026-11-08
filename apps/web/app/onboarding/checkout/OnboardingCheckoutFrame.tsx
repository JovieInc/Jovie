'use client';

import type { ReactNode } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { FORM_LAYOUT } from '@/lib/auth/constants';

/**
 * The checkout and its loading state draw the same frame, so nothing moves
 * when the page's data arrives. The app shell clips its content pane, so the
 * checkout owns its scroll. Auto margins centre a short page and pin a tall
 * one to the top, so the price and the button stay reachable on a phone.
 */
export function OnboardingCheckoutFrame({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        sidebar={null}
        containerClassName='[color-scheme:dark]'
        contentClassName='overflow-clip!'
        main={
          <div
            className='flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-8'
            data-testid='onboarding-checkout-scroll'
          >
            <div
              className={`m-auto w-full max-w-md ${FORM_LAYOUT.formContainer}`}
            >
              {children}
            </div>
          </div>
        }
        rightPanel={null}
      />
    </SidebarProvider>
  );
}
