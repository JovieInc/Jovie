'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { InfoBox } from '@/components/molecules/InfoBox';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';

export function ChatUsageAlert() {
  const { data, isLoading } = useChatUsageQuery({ enabled: !env.IS_E2E });

  if (
    env.IS_E2E ||
    isLoading ||
    !data ||
    (!data.isNearLimit && !data.isExhausted)
  ) {
    return null;
  }

  const proLimit = ENTITLEMENT_REGISTRY.pro.limits.aiDailyMessageLimit;
  const isPaidPlan = data.plan !== 'free';

  if (data.isExhausted) {
    return (
      <InfoBox title="You're out of messages for today" variant='error'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p>
            You&apos;ve used all {data.dailyLimit} AI messages included in your
            plan.
            {isPaidPlan
              ? ' Come back tomorrow when your quota refreshes.'
              : ` Upgrade to Pro for ${proLimit} messages/day.`}
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
    <InfoBox title="You're almost out of messages" variant='warning'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p>
          You&apos;ve sent {data.used} of {data.dailyLimit} daily messages.
          {isPaidPlan
            ? ` ${data.remaining} remaining today.`
            : ` Upgrade to Pro for ${proLimit}/day.`}
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
