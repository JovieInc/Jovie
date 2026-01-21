'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { getSentryMode, isSentryInitialized } from '@/lib/sentry/init';

/**
 * Global error page for Next.js App Router.
 *
 * This component handles uncaught errors at the root level of the application.
 * It integrates with Sentry for error tracking, supporting both lite and full
 * SDK variants.
 *
 * SDK Variant Awareness:
 * - Checks SDK initialization state before capturing errors
 * - Includes SDK mode (lite/full) in error tags for dashboard filtering
 * - Provides fallback console logging when SDK is not initialized
 * - Wrapped in try/catch for resilience in case Sentry capture fails
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Capture error in Sentry with SDK variant awareness
    const sentryMode = getSentryMode();
    const isInitialized = isSentryInitialized();

    if (isInitialized) {
      try {
        Sentry.captureException(error, {
          extra: {
            digest: error.digest,
            sentryMode, // Include SDK mode for debugging
          },
          tags: {
            globalError: 'true',
            sentryMode, // Tag to filter by SDK variant in Sentry dashboard
          },
        });
      } catch (sentryError) {
        // Fallback: Sentry capture failed - this should be rare but provides resilience
        console.error('[GlobalError] Sentry capture failed:', sentryError);
        console.error('[GlobalError] Original error:', error);
      }
    } else {
      // Fallback: Sentry not initialized - log to console
      // This can happen during initial load before SDK is ready
      console.error(
        '[GlobalError] Sentry not initialized, logging error:',
        error,
        {
          digest: error.digest,
          sentryMode,
        }
      );
    }
  }, [error]);

  return (
    <html lang='en'>
      <head>
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1, viewport-fit=cover'
        />
        <style
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for dynamic CSS injection
          dangerouslySetInnerHTML={{
            __html: `
              *, *::before, *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }

              :root {
                --bg: #ffffff;
                --text: #111827;
                --text-muted: #6b7280;
                --text-subtle: #9ca3af;
                --border: #e5e7eb;
                --btn-primary-bg: #111827;
                --btn-primary-text: #ffffff;
                --btn-primary-hover: #374151;
                --btn-secondary-bg: transparent;
                --btn-secondary-text: #111827;
                --btn-secondary-border: #d1d5db;
                --btn-secondary-hover: #f9fafb;
                --logo-bg: #111827;
                --logo-text: #ffffff;
              }

              @media (prefers-color-scheme: dark) {
                :root {
                  --bg: #0f0f0f;
                  --text: #f9fafb;
                  --text-muted: #9ca3af;
                  --text-subtle: #6b7280;
                  --border: #374151;
                  --btn-primary-bg: #ffffff;
                  --btn-primary-text: #111827;
                  --btn-primary-hover: #f3f4f6;
                  --btn-secondary-bg: transparent;
                  --btn-secondary-text: #f9fafb;
                  --btn-secondary-border: #4b5563;
                  --btn-secondary-hover: #1f2937;
                  --logo-bg: #ffffff;
                  --logo-text: #111827;
                }
              }

              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background-color: var(--bg);
                color: var(--text);
                min-height: 100vh;
                min-height: 100dvh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
                padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
                padding-left: max(1.5rem, env(safe-area-inset-left));
                padding-right: max(1.5rem, env(safe-area-inset-right));
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }

              .container {
                width: 100%;
                max-width: 24rem;
                text-align: center;
              }

              .logo {
                display: flex;
                justify-content: center;
                margin-bottom: 2rem;
              }

              .logo svg {
                width: 2.5rem;
                height: 2.5rem;
              }

              .logo-icon {
                fill: var(--logo-bg);
              }
              h1 {
                font-size: 1.5rem;
                font-weight: 600;
                line-height: 1.25;
                margin-bottom: 0.75rem;
                letter-spacing: -0.025em;
              }

              .description {
                font-size: 0.9375rem;
                line-height: 1.5;
                color: var(--text-muted);
                margin-bottom: 2rem;
              }

              .actions {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
              }

              @media (min-width: 400px) {
                .actions {
                  flex-direction: row;
                  justify-content: center;
                }
              }

              .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 2.75rem;
                padding: 0 1.5rem;
                font-size: 0.9375rem;
                font-weight: 500;
                border-radius: 0.625rem;
                border: none;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.15s ease;
                -webkit-tap-highlight-color: transparent;
              }

              .btn:focus-visible {
                outline: 2px solid var(--btn-primary-bg);
                outline-offset: 2px;
              }

              .btn-primary {
                background-color: var(--btn-primary-bg);
                color: var(--btn-primary-text);
              }

              .btn-primary:hover {
                background-color: var(--btn-primary-hover);
              }

              .btn-primary:active {
                transform: scale(0.98);
              }

              .btn-secondary {
                background-color: var(--btn-secondary-bg);
                color: var(--btn-secondary-text);
                border: 1px solid var(--btn-secondary-border);
              }

              .btn-secondary:hover {
                background-color: var(--btn-secondary-hover);
              }

              .btn-secondary:active {
                transform: scale(0.98);
              }

              .error-id {
                font-size: 0.75rem;
                color: var(--text-subtle);
                margin-top: 2rem;
                font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
              }

              @media (min-width: 400px) {
                h1 {
                  font-size: 1.75rem;
                }
              }
            `,
          }}
        />
      </head>
      <body>
        <div className='container'>
          <div className='logo'>
            <svg
              viewBox='0 0 353.68 347.97'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              aria-hidden='true'
            >
              <path
                className='logo-icon'
                d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z'
              />
            </svg>
          </div>

          <h1>Something went wrong</h1>
          <p className='description'>
            We encountered an unexpected error. Our team has been notified.
          </p>

          <div className='actions'>
            <button type='button' onClick={reset} className='btn btn-primary'>
              Try again
            </button>
            <a href='/' className='btn btn-secondary'>
              Go home
            </a>
          </div>

          {error.digest && <p className='error-id'>Error ID: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
