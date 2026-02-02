'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { publicEnv } from '@/lib/env-public';
import { useEnvHealthQuery } from '@/lib/queries/useEnvHealthQuery';

/**
 * Operator Banner Component (ENG-004)
 *
 * Displays a warning banner when environment configuration issues are detected.
 * Only visible to admin users in non-production environments, or when explicitly enabled.
 *
 * Features:
 * - Uses TanStack Query for caching and automatic refetching
 * - Shows critical/error issues prominently
 * - Dismissible (state persists in session storage)
 * - Styled consistently with the app's design system
 *
 * Note: This component requires QueryClientProvider to be in the React tree.
 * If QueryClient is not available, the query will be disabled and component won't show.
 */
export function OperatorBanner({ isAdmin }: Readonly<{ isAdmin: boolean }>) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Wait for client-side mount (avoids SSR/hydration issues)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check dismissal state from session storage
  useEffect(() => {
    const dismissed = sessionStorage.getItem('operator-banner-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Determine if we should show the banner
  const showBanner =
    isMounted &&
    isAdmin &&
    (process.env.NODE_ENV !== 'production' ||
      publicEnv.NEXT_PUBLIC_SHOW_OPERATOR_BANNER === 'true');

  // Use TanStack Query for fetching environment health
  const { data: envHealth } = useEnvHealthQuery({
    enabled: showBanner && !isDismissed,
  });

  // Extract issues from the response
  const envIssues = useMemo(() => {
    if (!envHealth?.details?.currentValidation) return [];
    return [
      ...envHealth.details.currentValidation.critical,
      ...envHealth.details.currentValidation.errors,
    ];
  }, [envHealth]);

  const isVisible = !envHealth?.ok && envIssues.length > 0;

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('operator-banner-dismissed', 'true');
  };

  if (!showBanner || isDismissed || !isVisible) {
    return null;
  }

  return (
    <div className='fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-amber-950 px-4 py-2 shadow-lg'>
      <div className='max-w-7xl mx-auto flex items-center gap-3'>
        <AlertTriangle className='h-5 w-5 flex-shrink-0' aria-hidden='true' />
        <div className='flex-1 min-w-0'>
          <span className='font-semibold'>Environment Issues: </span>
          <span className='truncate'>
            {envIssues.slice(0, 2).join('; ')}
            {envIssues.length > 2 && (
              <span className='ml-1 text-amber-800'>
                +{envIssues.length - 2} more
              </span>
            )}
          </span>
        </div>
        <button
          type='button'
          onClick={handleDismiss}
          className='p-1 rounded hover:bg-amber-600/20 transition-colors'
          aria-label='Dismiss environment warning'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      </div>
    </div>
  );
}
