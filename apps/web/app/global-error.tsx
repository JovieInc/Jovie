'use client';

import { useEffect } from 'react';

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

              body {
                font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-feature-settings: "cv01", "ss03";
                background-color: #08090a;
                color: #ffffff;
                min-height: 100dvh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                padding-bottom: max(24px, env(safe-area-inset-bottom));
                padding-left: max(24px, env(safe-area-inset-left));
                padding-right: max(24px, env(safe-area-inset-right));
                -webkit-font-smoothing: antialiased;
              }

              .container {
                width: 100%;
                max-width: 320px;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
              }

              .logo {
                display: flex;
                justify-content: center;
              }

              .logo svg {
                width: 32px;
                height: 32px;
              }

              h1 {
                margin-top: 20px;
                font-size: 18px;
                font-weight: 590;
                letter-spacing: -0.02em;
                line-height: 1.3;
              }

              .description {
                margin-top: 8px;
                font-size: 14px;
                line-height: 1.5;
                color: #969799;
              }

              .actions {
                margin-top: 24px;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
                gap: 12px;
              }

              .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 36px;
                padding: 0 16px;
                font-size: 14px;
                font-weight: 500;
                border-radius: 9999px;
                border: none;
                cursor: pointer;
                text-decoration: none;
                transition: background 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
                            border-color 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
                -webkit-tap-highlight-color: transparent;
              }

              .btn:focus-visible {
                outline: 2px solid #7170ff;
                outline-offset: 2px;
              }

              .btn:active {
                transform: scale(0.97);
              }

              .btn-primary {
                background: #e6e6e6;
                color: #08090a;
              }

              .btn-primary:hover {
                background: #ffffff;
              }

              .btn-secondary {
                background: transparent;
                color: #969799;
                border: 1px solid rgba(255, 255, 255, 0.08);
              }

              .btn-secondary:hover {
                background: rgba(255, 255, 255, 0.04);
                border-color: rgba(255, 255, 255, 0.12);
              }

              .error-id {
                margin-top: 20px;
                font-size: 12px;
                color: #62666d;
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
                fill='#ffffff'
                d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z'
              />
            </svg>
          </div>

          <h1>Something went wrong</h1>
          <p className='description'>An unexpected error occurred.</p>

          <div className='actions'>
            <button type='button' onClick={reset} className='btn btn-primary'>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Using <a> intentionally in global error boundary for resilience when routing may be broken */}
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
