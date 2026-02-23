'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { InfoBox } from '@/components/molecules/InfoBox';
import { APP_ROUTES } from '@/constants/routes';
import { useChatUsageQuery } from '@/lib/queries/useChatUsageQuery';

export function ChatUsageAlert() {
  const { data, isLoading } = useChatUsageQuery();

  if (isLoading || !data || (!data.isNearLimit && !data.isExhausted)) {
    return null;
  }

  if (data.isExhausted) {
    return (
      <InfoBox title='You’re out of messages for today' variant='error'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p>
            You’ve used all {data.dailyLimit} AI messages included in your plan.
            Upgrade to continue now, or come back tomorrow when your quota
            refreshes.
          </p>
          <Button asChild size='sm'>
            <Link href={APP_ROUTES.PRICING}>Upgrade</Link>
          </Button>
        </div>
      </InfoBox>
    );
  }

  return (
    <InfoBox title='You’re almost out of messages' variant='warning'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p>
          You have {data.remaining} message{data.remaining === 1 ? '' : 's'}{' '}
          left today. Upgrade now to keep momentum without interruption.
        </p>
        <Button asChild size='sm' variant='secondary'>
          <Link href={APP_ROUTES.PRICING}>Upgrade</Link>
        </Button>
      </div>
    </InfoBox>
  );
}
