'use client';

import { useEffect, useState } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { PublicProfileFixture } from './PublicProfileFixture';

export function UnfazedProfileClient({
  longName = false,
  state = 'unclaimed',
}: Readonly<{
  longName?: boolean;
  state?: string;
}>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <QueryProvider>
      <PublicProfileFixture longName={longName} state={state} />
    </QueryProvider>
  );
}
