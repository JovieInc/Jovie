import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';

/**
 * /hud-tv lives outside /app/* and does not inherit the shell QueryClient.
 * Provide a standalone QueryClient so useHudMetricsQuery works for the
 * dedicated TV/wallboard rendering of the HUD.
 */
export default function HudTvLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <QueryProvider>{children}</QueryProvider>;
}
