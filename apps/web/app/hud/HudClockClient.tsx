'use client';

import { useEffect, useMemo, useState } from 'react';

export interface HudClockClientProps
  extends Readonly<{
    readonly locale?: string;
  }> {}

export function HudClockClient({ locale }: HudClockClientProps) {
  const resolvedLocale = locale ?? 'en-US';
  const formatter = useMemo(() => {
    return new Intl.DateTimeFormat(resolvedLocale, {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [resolvedLocale]);

  // Initialize as null to avoid SSR/client hydration mismatch: the server
  // renders a timestamp that the client would immediately disagree with.
  // We show nothing until the first client-side tick so React can safely
  // hydrate without a warning.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Set immediately on mount, then update every second.
    setNow(new Date());
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      clearInterval(id);
    };
  }, []);

  if (now === null) return null;

  return <span>{formatter.format(now)}</span>;
}
