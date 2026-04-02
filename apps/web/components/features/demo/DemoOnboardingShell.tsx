'use client';

import { Check, ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import {
  getRailStepState,
  ONBOARDING_RAIL_STEPS,
  type OnboardingFlowStepId,
  resolveRailStepId,
} from '@/components/features/dashboard/organisms/onboarding-v2/OnboardingStepRail';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from '@/components/organisms/Sidebar';

interface DemoOnboardingShellProps {
  readonly children: ReactNode;
  readonly currentStep: OnboardingFlowStepId;
}

function getStepLabel(step: OnboardingFlowStepId): string {
  const railStep = resolveRailStepId(step);
  return (
    ONBOARDING_RAIL_STEPS.find(item => item.id === railStep)?.label ?? 'Setup'
  );
}

function SidebarProgress({
  currentStep,
}: Readonly<{ currentStep: OnboardingFlowStepId }>) {
  return (
    <nav aria-label='Onboarding progress' className='pt-1'>
      <ol className='space-y-0.5'>
        {ONBOARDING_RAIL_STEPS.map(step => {
          const state = getRailStepState(step.id, currentStep);
          const isCurrent = state === 'current';
          const isComplete = state === 'complete';

          return (
            <li key={step.id}>
              <div
                className={[
                  'flex min-h-9 items-center gap-3 rounded-[10px] px-2.5 text-[13px] transition-colors',
                  isCurrent
                    ? 'bg-sidebar-accent/70 text-primary-token'
                    : 'text-secondary-token',
                ].join(' ')}
              >
                <span
                  aria-hidden='true'
                  className={[
                    'flex size-4 shrink-0 items-center justify-center rounded-full border',
                    isCurrent
                      ? 'border-primary-token/60 bg-primary-token/10 text-primary-token'
                      : isComplete
                        ? 'border-primary-token/25 bg-primary-token/10 text-primary-token'
                        : 'border-(--linear-app-frame-seam) text-quaternary-token',
                  ].join(' ')}
                >
                  {isComplete ? (
                    <Check className='size-3' />
                  ) : (
                    <span className='size-1.5 rounded-full bg-current' />
                  )}
                </span>
                <span
                  className={[
                    'truncate',
                    isCurrent ? 'font-[590]' : 'font-[500]',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function DemoOnboardingShell({
  children,
  currentStep,
}: Readonly<DemoOnboardingShellProps>) {
  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '276px' } as CSSProperties}
    >
      <div data-testid='demo-onboarding-app-shell'>
        <AppShellFrame
          sidebar={
            <Sidebar collapsible='none'>
              <SidebarHeader className='h-12 items-center justify-center border-b border-(--linear-app-frame-seam) px-4'>
                <div className='flex w-full min-w-0 items-center gap-2 text-[13px]'>
                  <span className='truncate font-[560] text-primary-token'>
                    Jovie Setup
                  </span>
                </div>
              </SidebarHeader>

              <SidebarContent className='px-3 py-3'>
                <SidebarProgress currentStep={currentStep} />
              </SidebarContent>
            </Sidebar>
          }
          header={
            <header className='flex h-[40px] shrink-0 items-center border-b border-(--linear-app-frame-seam) px-4 md:px-(--linear-app-header-padding-x)'>
              <div className='flex min-w-0 items-center gap-1 text-[13px]'>
                <span className='truncate text-tertiary-token'>
                  Jovie Setup
                </span>
                <ChevronRight className='size-3.5 shrink-0 text-quaternary-token' />
                <span className='truncate font-[510] text-primary-token'>
                  {getStepLabel(currentStep)}
                </span>
              </div>
            </header>
          }
          main={children}
        />
      </div>
    </SidebarProvider>
  );
}
