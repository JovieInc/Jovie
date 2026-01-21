'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface EnvHealthResponse {
  ok: boolean;
  status: 'ok' | 'warning' | 'error';
  details: {
    currentValidation: {
      critical: string[];
      errors: string[];
      warnings: string[];
    };
  };
}

/**
 * Operator Banner Component (ENG-004)
 *
 * Displays a warning banner when environment configuration issues are detected.
 * Only visible to admin users in non-production environments, or when explicitly enabled.
 *
 * Features:
 * - Auto-fetches environment health on mount
 * - Shows critical/error issues prominently
 * - Dismissible (state persists in session storage)
 * - Styled consistently with the app's design system
 */
export function OperatorBanner({ isAdmin }: Readonly<{ isAdmin: boolean }>) {
  const [envIssues, setEnvIssues] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    const dismissed = sessionStorage.getItem('operator-banner-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // Only show for admins
    if (!isAdmin) return;

    // Only show in non-production or if explicitly enabled
    const showBanner =
      process.env.NODE_ENV !== 'production' ||
      process.env.NEXT_PUBLIC_SHOW_OPERATOR_BANNER === 'true';

    if (!showBanner) return;

    async function checkEnvHealth() {
      try {
        const res = await fetch('/api/health/env', {
          cache: 'no-store',
        });
        const data: EnvHealthResponse = await res.json();

        if (!data.ok && data.details?.currentValidation) {
          const issues = [
            ...data.details.currentValidation.critical,
            ...data.details.currentValidation.errors,
          ];
          if (issues.length > 0) {
            setEnvIssues(issues);
            setIsVisible(true);
          }
        }
      } catch {
        // Silently fail - don't block the UI for health check failures
      }
    }

    checkEnvHealth();
  }, [isAdmin]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem('operator-banner-dismissed', 'true');
  };

  if (!isVisible || isDismissed || envIssues.length === 0) {
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
          <X className='h-4 w-4' />
        </button>
      </div>
    </div>
  );
}
