'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang='en'>
      <head>
        <meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover' />
        <style
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
                width: 3.5rem;
                height: 3.5rem;
              }

              .logo-bg {
                fill: var(--logo-bg);
              }

              .logo-text {
                fill: var(--logo-text);
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
              viewBox='0 0 32 32'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              aria-hidden='true'
            >
              <rect width='32' height='32' rx='8' className='logo-bg' />
              <path
                d='M10 22V10h4v12h-4zm8-12h4v8a4 4 0 01-4 4h-2v-4h2V10z'
                className='logo-text'
              />
            </svg>
          </div>

          <h1>Something went wrong</h1>
          <p className='description'>
            We encountered an unexpected error. Our team has been notified.
          </p>

          <div className='actions'>
            <button onClick={reset} className='btn btn-primary'>
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
