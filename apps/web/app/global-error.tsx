'use client';

import './globals.css';
import { useEffect } from 'react';
import { SystemBErrorFallback } from '@/components/providers/SystemBErrorFallback';

/**
 * Global error page for Next.js App Router.
 *
 * This component handles uncaught errors at the root level of the application.
 * It integrates with Sentry for error tracking, supporting both lite and full
 * SDK variants.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    void import('@/lib/sentry/client-lite')
      .then(({ captureException }) => {
        captureException(error, {
          extra: { digest: error.digest },
          tags: { globalError: 'true' },
        });
      })
      .catch(() => {
        // Keep the global error boundary resilient even if telemetry fails.
      });
  }, [error]);

  return (
    <html lang='en' className='dark' suppressHydrationWarning>
      <head>
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1, viewport-fit=cover'
        />
      </head>
      <body className='system-b-error-fallback-body'>
        <main>
          <SystemBErrorFallback
            description='An unexpected error occurred.'
            digest={error.digest}
            actions={[
              { type: 'button', label: 'Try Again', onClick: reset },
              {
                type: 'link',
                label: 'Go Home',
                href: '/',
                variant: 'secondary',
              },
            ]}
          />
        </main>
      </body>
    </html>
  );
}
