import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';

export default function OutLayout({ children }: { children: ReactNode }) {
  // Wrap the /out subtree in QueryProvider so client components with
  // TanStack Query hooks (e.g. InterstitialClient's
  // useLinkVerificationMutation on /out/[id]) always have a QueryClient
  // context available. Same bug class as JOVIE-WEB-A6 / JOVIE-WEB-A7
  // (admin subtree): "No QueryClient set, use QueryClientProvider to set
  // one". See JOV-4328.
  return <QueryProvider>{children}</QueryProvider>;
}
