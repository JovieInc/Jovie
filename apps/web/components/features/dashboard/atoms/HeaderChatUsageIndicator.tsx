'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
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

    if (
      isPassiveRuntime ||
      isDemoRoute ||
      !data ||
      (!data.isNearLimit && !data.isExhausted)
    ) {
      return null;
    }

    const copy = getChatUsageCopy(data);

    return (
      <Link
        href={APP_ROUTES.PRICING}
        className='group inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-app font-caption text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200'
        aria-label={copy.headerAriaLabel}
      >
        <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
        <span className='max-sm:hidden sm:inline'>Chat</span>
        <span className='tabular-nums'>{copy.headerLabel}</span>
      </Link>
    );
  }
);
