import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { HudDesktopBootSignal } from './HudDesktopBootSignal';

/**
 * Isolated /hud query modes (fullscreen, kiosk, packaged Mac) stay outside
 * /app/* and do not inherit the shell QueryClient. Default /hud is rewritten
 * into the OV app shell. Provide a QueryClient for isolated HUD panels.
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
