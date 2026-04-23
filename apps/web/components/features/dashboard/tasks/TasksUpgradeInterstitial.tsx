'use client';

import { Button } from '@jovie/ui';
import { CheckSquare, Lock } from 'lucide-react';
import Link from 'next/link';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { PageShell } from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

interface TasksUpgradeContentProps {
  readonly heading: string;
  readonly description: string;
  readonly secondaryLabel: string;
  readonly secondaryHref?: string;
  readonly onSecondaryClick?: () => void;
  readonly compact?: boolean;
  readonly testId?: string;
}

function TasksUpgradeContent({
  heading,
  description,
  secondaryLabel,
  secondaryHref,
  onSecondaryClick,
  compact = false,
  testId,
}: TasksUpgradeContentProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col items-center justify-center text-center',
        compact
          ? 'rounded-[18px] border border-(--linear-app-frame-seam) bg-surface-1 px-5 py-8'
          : 'max-w-xl rounded-[24px] border border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,transparent)] px-8 py-14'
      )}
      data-testid={testId}
    >
      <div className='mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--linear-app-content-surface)_84%,transparent)] text-amber-700'>
        {compact ? (
          <Lock className='h-5 w-5' aria-hidden='true' />
        ) : (
          <CheckSquare className='h-5 w-5' aria-hidden='true' />
        )}
      </div>
      <h2 className='text-lg font-[580] tracking-[-0.025em] text-primary-token'>
        {heading}
      </h2>
      <p className='mt-2 max-w-md text-[13px] leading-[1.5] text-secondary-token'>
        {description}
      </p>
      <div className='mt-6 flex flex-wrap items-center justify-center gap-3'>
        <UpgradeButton size='sm'>Upgrade to Pro</UpgradeButton>
        {secondaryHref ? (
          <Button asChild variant='outline' size='sm'>
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        ) : (
          <Button variant='outline' size='sm' onClick={onSecondaryClick}>
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TasksWorkspaceUpgradeInterstitial() {
  return (
    <PageShell data-testid='tasks-upgrade-interstitial'>
      <section className='flex min-h-0 flex-1 items-center justify-center px-6 py-6'>
        <TasksUpgradeContent
          heading='Upgrade to access Tasks'
          description='Upgrade to turn releases into step-by-step plans and manage all of your work in one task workspace.'
          secondaryHref={APP_ROUTES.DASHBOARD_RELEASES}
          secondaryLabel='Back to Releases'
        />
      </section>
    </PageShell>
  );
}

export function ReleasePlanUpgradeInterstitial({
  releaseTitle,
}: Readonly<{ releaseTitle?: string | null }>) {
  const releaseName = releaseTitle?.trim() || 'this release';

  return (
    <div
      className='mx-auto flex max-w-2xl px-4 py-6'
      data-testid='release-plan-upgrade-interstitial'
    >
      <TasksUpgradeContent
        heading='Upgrade To Generate A Release Plan'
        description={`Upgrade to turn ${releaseName} into a step-by-step plan with tasks you can assign to Jovie AI.`}
        secondaryHref={APP_ROUTES.DASHBOARD_RELEASES}
        secondaryLabel='Back to Releases'
      />
    </div>
  );
}

export function CompactReleasePlanUpgradeCard({
  onDismiss,
}: Readonly<{ onDismiss: () => void }>) {
  return (
    <TasksUpgradeContent
      compact
      heading='Upgrade To Generate A Release Plan'
      description='Upgrade to turn this release into an assignable step-by-step plan.'
      onSecondaryClick={onDismiss}
      secondaryLabel='Maybe Later'
      testId='compact-release-plan-upgrade-card'
    />
  );
}
