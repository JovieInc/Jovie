'use client';

import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
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
    backgroundColor: '#06070a',
    color: '#ffffff',
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFeatureSettings: '"cv01", "ss03"',
  },
  container: {
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  title: {
    marginTop: '20px',
    fontSize: '18px',
    fontWeight: 590,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
  },
  description: {
    marginTop: '8px',
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#969799',
  },
  errorId: {
    marginTop: '20px',
    color: '#62666d',
    fontSize: '12px',
  },
};

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
      <div style={styles.container}>
        <JovieMarkElectric size={32} />
        <h1 style={styles.title}>Something Went Wrong</h1>
        <p style={styles.description}>Try refreshing the page.</p>
        <button
          type='button'
          className='mt-6 inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-[#e6e6e6] px-4 text-sm font-medium text-[#06070a] transition-[background] duration-subtle hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7170ff]'
          onClick={onRefresh}
        >
          Refresh
        </button>
        {error.digest ? (
          <p style={styles.errorId}>Error ID {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
