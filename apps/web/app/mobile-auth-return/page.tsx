'use client';

import Link from 'next/link';
import { Suspense } from 'react';

function MobileAuthReturnContent() {
  return (
    <main className='grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm px-6 py-7 text-center'>
        <p className='text-[13px] leading-5 text-white/60'>Jovie</p>
        <h1 className='mt-2 text-[22px] font-semibold leading-7'>
          Start again in the app
        </h1>
        <p className='mt-3 text-[14px] leading-5 text-white/64'>
          Jovie now completes mobile sign-in from the native app session. Open
          Jovie and tap Get started.
        </p>
        <Link
          href='/download'
          className='mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'
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
