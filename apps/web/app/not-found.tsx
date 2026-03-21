import Link from 'next/link';

export default function NotFound() {
  return (
    <main className='min-h-screen bg-base text-primary-token'>
      <div className='mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 py-16 text-center'>
        <p className='mb-4 text-[12px] uppercase tracking-[0.22em] text-tertiary-token'>
          404
        </p>
        <h1 className='text-[28px] font-[520] tracking-[-0.03em] text-primary-token'>
          Page not found
        </h1>
        <p className='mt-3 max-w-sm text-[14px] leading-relaxed text-secondary-token'>
          The link may be broken, expired, or no longer available.
        </p>
        <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
          <Link
            href='/'
            className='inline-flex min-h-10 items-center justify-center rounded-(--linear-radius-sm) border border-subtle px-4 text-[13px] font-medium text-primary-token'
          >
            Return home
          </Link>
          <Link
            href='/signin'
            className='inline-flex min-h-10 items-center justify-center rounded-(--linear-radius-sm) border border-subtle px-4 text-[13px] font-medium text-primary-token'
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
