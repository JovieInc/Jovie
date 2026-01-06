'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export interface HudAutoRefreshClientProps {
  intervalMs: number;
}

export function HudAutoRefreshClient({
  intervalMs,
}: HudAutoRefreshClientProps) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs, router]);

  return null;
}
