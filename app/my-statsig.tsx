'use client';

import { LogLevel, StatsigProvider } from '@statsig/react-bindings';
import { StatsigSessionReplayPlugin } from '@statsig/session-replay';
import { usePathname } from 'next/navigation';
import React from 'react';
import { publicEnv } from '@/lib/env-public';

export interface MyStatsigProps {
  children: React.ReactNode;
  userId?: string | null;
}

export function MyStatsig({ children, userId }: MyStatsigProps) {
  const sdkKey = publicEnv.NEXT_PUBLIC_STATSIG_CLIENT_KEY;
  const pathname = usePathname();

  const user = React.useMemo(
    () => ({
      userID: userId ?? 'anonymous',
    }),
    [userId]
  );

  const plugins = React.useMemo(
    () =>
      pathname.startsWith('/dashboard')
        ? [new StatsigSessionReplayPlugin()]
        : [],
    [pathname]
  );

  // If we don't have a configured key, bail out quietly (previews/staging)
  if (!sdkKey) {
    return <>{children}</>;
  }

  return (
    <StatsigProvider
      sdkKey={sdkKey}
      user={user}
      options={{
        logLevel: LogLevel.Debug,
        plugins,
      }}
    >
      {children}
    </StatsigProvider>
  );
}
