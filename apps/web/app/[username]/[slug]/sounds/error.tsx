'use client';

/**
 * Error boundary for the /sounds route.
 *
 * Shows a branded error page when the server component throws
 * (e.g. DB connection timeout, pool exhaustion) instead of a raw Next.js 500.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/atoms/Icon';

export default function SoundsErrorBoundary({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const params = useParams<{ username: string; slug: string }>();
  const smartLinkPath =
    params?.username && params?.slug
      ? `/${params.username}/${params.slug}`
      : '/';

  return (
    <div className='flex h-dvh flex-col items-center justify-center bg-base px-6 text-foreground'>
      <div className='max-w-[272px] text-center'>
        <Icon
          name='AlertTriangle'
          className='mx-auto h-10 w-10 text-muted-foreground'
          aria-hidden='true'
        />
        <h1 className='mt-4 text-lg font-semibold'>Something went wrong</h1>
        <p className='text-muted-foreground mt-2 text-sm'>
          We couldn&apos;t load this page. Please try again.
        </p>

        <div className='mt-6 space-y-3'>
          <button
            type='button'
            onClick={reset}
            className='flex w-full items-center justify-center gap-2 rounded-xl bg-surface-1/70 px-4 py-3 text-sm font-semibold ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-surface-2/80'
          >
            <Icon name='RefreshCw' className='h-4 w-4' aria-hidden='true' />
            Try again
          </button>

          <Link
            href={smartLinkPath}
            className='flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground'
          >
            <Icon name='Headphones' className='h-4 w-4' aria-hidden='true' />
            Go to streaming links
          </Link>
        </div>
      </div>
    </div>
  );
}
