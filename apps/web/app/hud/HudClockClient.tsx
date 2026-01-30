'use client';

import { useEffect, useMemo, useState } from 'react';

export interface HudClockClientProps
  extends Readonly<{
    locale?: string;
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

  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      clearInterval(id);
    };
  }, []);

  return <span>{formatter.format(now)}</span>;
}
