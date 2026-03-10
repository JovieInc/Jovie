'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries/useChatUsageQuery';

export const HeaderChatUsageIndicator = memo(
  function HeaderChatUsageIndicator() {
    const isPassiveRuntime = env.IS_E2E;
    const { data } = useChatUsageQuery({ enabled: !isPassiveRuntime });

    if (isPassiveRuntime || !data || (!data.isNearLimit && !data.isExhausted)) {
      return null;
    }

    const isExhausted = data.isExhausted;
    const pluralSuffix = data.remaining === 1 ? '' : 's';
    const label = isExhausted
      ? 'Daily chat limit reached'
      : `${data.remaining} message${pluralSuffix} left`;

    return (
      <Link
        href={APP_ROUTES.PRICING}
        className='group inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-[13px] font-[510] text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200'
        aria-label={
          isExhausted
            ? 'Daily AI message limit reached. Open pricing to upgrade.'
            : `Only ${data.remaining} AI messages left today. Open pricing to upgrade.`
        }
      >
        <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
        <span className='hidden sm:inline'>Chat</span>
        <span className='tabular-nums'>{label}</span>
      </Link>
    );
  }
);
