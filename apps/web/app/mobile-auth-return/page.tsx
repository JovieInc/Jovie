'use client';

import Link from 'next/link';
import { Suspense } from 'react';

function MobileAuthReturnContent() {
  return (
    <main className='grid min-h-dvh place-items-center bg-base px-6 text-primary-token'>
      <section className='w-full max-w-sm px-6 py-7 text-center'>
        <p className='text-sm leading-5 text-tertiary-token'>Jovie</p>
        <h1 className='mt-2 text-xl font-semibold leading-7'>
          Start again in the app
        </h1>
        <p className='mt-3 text-sm leading-5 text-secondary-token'>
          Jovie now completes mobile sign-in from the native app session. Open
          Jovie and tap Get started.
        </p>
        <Link
          href='/download'
          className='focus-ring-transparent-offset mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-btn-primary px-4 text-sm font-medium text-btn-primary-foreground transition-opacity duration-subtle hover:opacity-95'
        >
          Open downloads
        </Link>
      </section>
    </main>
  );
}

export default function MobileAuthReturnPage() {
  return (
    <Suspense fallback={null}>
      <MobileAuthReturnContent />
    </Suspense>
  );
}
