'use client';

import { SimpleTooltip } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import {
  getOverallRemainingPercent,
  isChatUsageBelowWarningThreshold,
} from '@/lib/chat-usage/metrics';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';

export const HeaderChatUsageIndicator = memo(
  function HeaderChatUsageIndicator() {
    const pathname = usePathname();
    const isPassiveRuntime = env.IS_E2E;
    const isDemoRoute = isDemoRoutePath(pathname);
    const { data } = useChatUsageQuery({
      enabled: !isPassiveRuntime && !isDemoRoute,
    });

    if (isPassiveRuntime || isDemoRoute || !data) {
      return null;
    }

    if (!isChatUsageBelowWarningThreshold(data)) {
      return null;
    }

    const remainingPercent = getOverallRemainingPercent(data);
    const label = `${remainingPercent}% remaining`;
    const detail = `${label}. Open the user menu for daily and monthly usage details.`;

    return (
      <SimpleTooltip content={detail} side='bottom'>
        <Link
          href={APP_ROUTES.PRICING}
          className='group inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-app font-caption text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200'
          aria-label={detail}
        >
          <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
          <span className='max-sm:hidden sm:inline'>Usage</span>
          <span className='tabular-nums'>{label}</span>
        </Link>
      </SimpleTooltip>
    );
  }
);
