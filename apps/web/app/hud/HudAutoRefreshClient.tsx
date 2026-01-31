'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export interface HudAutoRefreshClientProps {
  readonly intervalMs: number;
}

export function HudAutoRefreshClient({
  intervalMs,
}: HudAutoRefreshClientProps) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs, router]);

  return null;
}
