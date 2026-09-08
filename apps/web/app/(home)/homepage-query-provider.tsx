'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/**
 * The certified homepage prerenders statically, outside the app shell's
 * QueryProvider. The name-search control is the only TanStack Query consumer
 * in this tree, so it gets a dedicated lightweight client scoped to the page.
 */
export function HomepageQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
