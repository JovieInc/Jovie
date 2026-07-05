import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';

/**
 * /hud lives outside /app/* and does not inherit the shell QueryClient.
 * Provide a standalone QueryClient for HUD metrics and shipper panels.
 */
export default function HudLayout({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
