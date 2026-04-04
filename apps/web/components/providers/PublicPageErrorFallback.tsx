'use client';

import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { captureErrorInSentry } from '@/lib/errors/capture';

interface PublicPageErrorFallbackProps {
  readonly error: Error & { digest?: string };
  readonly context: string;
  readonly onRefresh?: () => void;
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: '#08090a',
    color: '#ffffff',
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFeatureSettings: '"cv01", "ss03"',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '32px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: '#1c1c1f',
    boxShadow:
      'rgba(0,0,0,0.2) 0px 0px 12px inset, rgba(0,0,0,0.2) 0px 4px 24px',
    textAlign: 'center',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 590,
    letterSpacing: '-0.24px',
    lineHeight: 1.33,
  },
  button: {
    marginTop: '24px',
    width: '100%',
    minHeight: '40px',
    border: 'none',
    borderRadius: '9999px',
    backgroundColor: '#e6e6e6',
    color: '#08090a',
    fontSize: '15px',
    fontWeight: 590,
    cursor: 'pointer',
  },
  errorId: {
    marginTop: '16px',
    color: '#62666d',
    fontSize: '12px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
};

function JovieLogo() {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 353.68 347.97'
      width='44'
      height='44'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        fill='#ffffff'
        d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z'
      />
    </svg>
  );
}

export function PublicPageErrorFallback({
  error,
  context,
  onRefresh = () => globalThis.location.reload(),
}: PublicPageErrorFallbackProps) {
  useEffect(() => {
    console.error(`[${context} Error]`, error);
    captureErrorInSentry(error, context, { digest: error.digest });
  }, [context, error]);

  return (
    <div style={styles.page} role='alert' aria-live='assertive'>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <JovieLogo />
        </div>
        <h1 style={styles.title}>
          Something went wrong. Please refresh the page.
        </h1>
        <button type='button' style={styles.button} onClick={onRefresh}>
          Refresh
        </button>
        {error.digest ? (
          <p style={styles.errorId}>Error ID {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
