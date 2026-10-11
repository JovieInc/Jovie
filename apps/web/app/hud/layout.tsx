import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { HudDesktopBootSignal } from './HudDesktopBootSignal';

/**
 * The signed-token kiosk boundary stays outside /app/* and does not inherit
 * the shell QueryClient. All interactive Ops presentations are rewritten into
 * the OV app shell; this provider supports the remaining kiosk route.
 * The desktop boot signal is required so Electron does not treat a painted
 * HUD as a missed app-booted ping.
 */
export default function HudLayout({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return (
    <QueryProvider>
      <HudDesktopBootSignal />
      {children}
    </QueryProvider>
  );
}
