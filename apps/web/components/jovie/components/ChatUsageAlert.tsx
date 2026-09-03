'use client';

// @coverage-via apps/web/tests/unit/chat/ChatUsageAlert.test.tsx

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { InfoBox } from '@/components/molecules/InfoBox';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { APP_ROUTES } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';

export function ChatUsageAlert() {
  const { data, isLoading } = useChatUsageQuery({ enabled: !env.IS_E2E });
  const usageState = data ? getChatUsageCopy(data).state : null;

  if (
    env.IS_E2E ||
    isLoading ||
    !data ||
    (usageState !== 'near_limit' && usageState !== 'exhausted')
  ) {
    return null;
  }

  const proLimit = ENTITLEMENT_REGISTRY.pro.limits.aiWeeklyMessageLimit;
  const isPaidPlan = data.plan !== 'free';

  if (usageState === 'exhausted') {
    return (
      <InfoBox
        title="You're out of messages for this week"
        variant='error'
        className='mb-2 rounded-2xl'
      >
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p>
            You&apos;ve used all {data.weeklyLimit} AI messages included in your
            plan.
            {isPaidPlan
              ? ' Your messages refresh when the current window ends.'
              : ` Upgrade to Pro for ${proLimit} messages/week.`}
          </p>
          {isPaidPlan ? (
            <Button asChild size='sm' variant='secondary'>
              <Link href={APP_ROUTES.PRICING}>View plans</Link>
            </Button>
          ) : (
            <UpgradeButton size='sm' variant='primary'>
              Upgrade to Pro
            </UpgradeButton>
          )}
        </div>
      </InfoBox>
    );
  }

  return (
    <InfoBox
      title="You're almost out of messages"
      variant='warning'
      className='mb-2 rounded-2xl'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p>
          You&apos;ve sent {data.used} of {data.weeklyLimit} weekly messages.
          {isPaidPlan
            ? ` ${data.remaining} remaining this week.`
            : ` Upgrade to Pro for ${proLimit}/week.`}
        </p>
        {isPaidPlan ? (
          <Button asChild size='sm' variant='secondary'>
            <Link href={APP_ROUTES.PRICING}>View plans</Link>
          </Button>
        ) : (
          <UpgradeButton size='sm' variant='secondary'>
            Upgrade to Pro
          </UpgradeButton>
        )}
      </div>
    </InfoBox>
  );
}
