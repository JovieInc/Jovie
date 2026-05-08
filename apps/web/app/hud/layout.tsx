import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';

// The HUD route lives outside /app/* and does not inherit the shell QueryClient.
// Provide a standalone QueryClient so useHudMetricsQuery (TanStack Query) works.
export default function HudLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <QueryProvider>{children}</QueryProvider>;
}
