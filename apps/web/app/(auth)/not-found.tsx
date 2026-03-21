import Link from 'next/link';

export default function AuthNotFound() {
  return (
    <main className='min-h-screen bg-page text-primary-token'>
      <div className='mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center'>
        <p className='mb-3 text-[12px] uppercase tracking-[0.18em] text-tertiary-token'>
          Not Found
        </p>
        <h1 className='text-[22px] font-[510] tracking-[-0.019em]'>
          This auth page does not exist
        </h1>
        <p className='mt-3 text-[13px] text-secondary-token'>
          The link may be invalid or expired.
        </p>
        <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
          <Link
            href='/signin'
            className='inline-flex min-h-10 items-center justify-center rounded-(--linear-radius-sm) border border-subtle px-4 text-[13px] font-medium text-primary-token'
          >
            Go to sign in
          </Link>
          <Link
            href='/signup'
            className='inline-flex min-h-10 items-center justify-center rounded-(--linear-radius-sm) border border-subtle px-4 text-[13px] font-medium text-primary-token'
          >
            Go to sign up
          </Link>
        </div>
      </div>
    </main>
  );
}
