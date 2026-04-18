import Link from 'next/link';

export default function SmartLinkNotFound() {
  return (
    <div
      data-testid='not-found'
      className='bg-base text-foreground flex min-h-dvh flex-col items-center justify-center px-4'
    >
      <div className='w-full max-w-sm text-center'>
        <div className='mb-6 select-none'>
          <span
            className='block text-[100px] font-semibold leading-none tracking-tighter text-primary-token/[0.34]'
            aria-hidden='true'
          >
            404
          </span>
        </div>

        <div className='-mt-12 relative'>
          <h1 className='text-lg font-semibold tracking-tight'>
            Content Not Found
          </h1>
          <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
            This page may have been removed or the link may be incorrect.
          </p>

          <div className='mt-6 flex items-center justify-center gap-3'>
            <Link
              href='/'
              className='text-muted-foreground hover:text-foreground text-sm transition-colors'
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
