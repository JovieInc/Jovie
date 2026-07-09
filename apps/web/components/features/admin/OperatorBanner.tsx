'use client';

import { Button } from '@jovie/ui';
import { QueryClient, QueryClientContext } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { env } from '@/lib/env-client';
import { useEnvHealthQuery } from '@/lib/queries';

/** Fixed overlay height — matches py-2 + single-line content. */
export const OPERATOR_BANNER_HEIGHT_CLASS = 'min-h-10';

/**
 * Operator Banner Component (ENG-004)
 *
 * Displays a warning banner when environment configuration issues are detected.
 * Only visible to admin users in non-production environments, or when explicitly enabled.
 *
 * Uses fixed overlay placement so the dashboard shell never shifts when the banner
 * appears. When rendered via OperatorBannerWrapper, initialIssues are decided on
 * the server so first paint matches hydration.
 */
export function OperatorBanner({
  initialIssues = [],
}: Readonly<{ initialIssues?: readonly string[] }>) {
  const [isDismissed, setIsDismissed] = useState(false);
  const isE2EClientRuntime = env.IS_E2E;
  const hasInitialIssues = initialIssues.length > 0;

  const queryClient = useContext(QueryClientContext);
  const standaloneQueryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
    []
  );

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem('operator-banner-dismissed');
      if (dismissed === 'true') {
        setIsDismissed(true);
      }
    } catch {
      // Ignore storage access errors (private browsing / restricted context)
    }
  }, []);

  const shouldFetchHealth =
    !hasInitialIssues && !isDismissed && !isE2EClientRuntime;

  const { data: envHealth } = useEnvHealthQuery({
    enabled: shouldFetchHealth,
    queryClient: queryClient ?? standaloneQueryClient,
  });

  const envIssues = useMemo(() => {
    if (hasInitialIssues) {
      return [...initialIssues];
    }
    if (!envHealth?.details?.currentValidation) return [];
    return [
      ...envHealth.details.currentValidation.critical,
      ...envHealth.details.currentValidation.errors,
    ];
  }, [envHealth, hasInitialIssues, initialIssues]);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('operator-banner-dismissed', 'true');
    } catch {
      // Ignore storage access errors (private browsing / restricted context)
    }
  };

  if (isDismissed || isE2EClientRuntime || envIssues.length === 0) {
    return null;
  }

  return (
    <div
      data-testid='operator-banner'
      role='alert'
      aria-live='polite'
      className={`fixed inset-x-0 top-0 z-9999 bg-amber-500 px-4 py-2 text-amber-950 shadow-lg ${OPERATOR_BANNER_HEIGHT_CLASS}`}
    >
      <div className='mx-auto flex max-w-7xl items-center gap-3'>
        <AlertTriangle className='size-5 shrink-0' aria-hidden='true' />
        <div className='min-w-0 flex-1'>
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
        <Button
          type='button'
          variant='ghost'
          onClick={handleDismiss}
          className='h-auto w-auto rounded p-1 text-amber-950 transition-colors hover:bg-amber-600/20'
          aria-label='Dismiss Environment Warning'
        >
          <X className='size-3.5' />
        </Button>
      </div>
    </div>
  );
}
