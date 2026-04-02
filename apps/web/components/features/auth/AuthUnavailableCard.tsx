import Link from 'next/link';

export function AuthUnavailableCard() {
  return (
    <div
      data-testid='auth-clerk-unavailable'
      className='w-full max-w-[28rem] rounded-2xl border border-subtle bg-surface-0 px-8 py-10 text-center shadow-xl'
    >
      <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-1 ring-1 ring-subtle'>
        <svg
          viewBox='0 0 24 24'
          fill='none'
          className='h-6 w-6 text-tertiary-token'
          aria-hidden='true'
        >
          <path
            d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z'
            fill='currentColor'
          />
        </svg>
      </div>

      <h2 className='mt-5 text-[1.25rem] font-semibold tracking-tight text-primary-token'>
        Auth temporarily unavailable
      </h2>

      <p className='mt-2 text-[0.9375rem] leading-relaxed text-secondary-token'>
        We&apos;re having trouble connecting to our auth service. This is
        usually temporary.
      </p>

      <div className='mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center'>
        <button
          type='button'
          onClick={() => globalThis.location.reload()}
          className='inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90'
        >
          Try again
        </button>
        <Link
          href='/'
          className='inline-flex h-10 items-center justify-center rounded-lg border border-subtle bg-transparent px-4 text-sm font-medium text-primary-token transition-colors hover:bg-surface-1'
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
