import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { HudDesktopBootSignal } from './HudDesktopBootSignal';

/**
 * /hud lives outside /app/* and does not inherit the shell QueryClient.
 * Provide a standalone QueryClient for HUD metrics and shipper panels.
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
