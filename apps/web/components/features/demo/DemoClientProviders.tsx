'use client';

import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { NuqsProvider } from '@/components/providers/NuqsProvider';
import { ClerkSafeDefaultsProvider } from '@/hooks/useClerkSafe';

export function DemoClientProviders({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Number.POSITIVE_INFINITY,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ClerkSafeDefaultsProvider>
      <QueryClientProvider client={queryClient}>
        <NuqsProvider>
          <TooltipProvider delayDuration={1200}>{children}</TooltipProvider>
        </NuqsProvider>
      </QueryClientProvider>
    </ClerkSafeDefaultsProvider>
  );
}
