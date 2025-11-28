'use client';

import { LogLevel, StatsigProvider } from '@statsig/react-bindings';
import { StatsigSessionReplayPlugin } from '@statsig/session-replay';
import { usePathname } from 'next/navigation';
import React from 'react';
import { env } from '@/lib/env';

export interface MyStatsigProps {
  children: React.ReactNode;
  userId?: string | null;
}

export function MyStatsig({ children, userId }: MyStatsigProps) {
  const sdkKey = env.NEXT_PUBLIC_STATSIG_CLIENT_KEY;
  const pathname = usePathname();

  const user = React.useMemo(
    () => ({
      userID: userId ?? 'anonymous',
    }),
    [userId]
  );

  const vercelEnv =
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.VERCEL_ENV ??
    'development';
  const isProductionEnv = vercelEnv === 'production';

  const plugins = React.useMemo(
    () =>
      pathname.startsWith('/dashboard')
        ? [new StatsigSessionReplayPlugin()]
        : [],
    [pathname]
  );

  // Only initialize Statsig in production for authenticated users with a configured key
  if (!sdkKey || !isProductionEnv || !userId) {
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
