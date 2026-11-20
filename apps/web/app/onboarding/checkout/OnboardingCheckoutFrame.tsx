'use client';

import type { ReactNode } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/sidebar';

/**
 * The checkout's app-shell frame. The app shell clips its content pane, so the
 * checkout owns its scroll and the price and button stay reachable on a phone.
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
            {children}
          </div>
        }
        rightPanel={null}
      />
    </SidebarProvider>
  );
}
