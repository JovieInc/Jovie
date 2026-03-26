'use client';

export default function SentryExamplePage() {
  return (
    <main className='mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16'>
      <div className='space-y-3'>
        <p className='text-sm font-medium uppercase tracking-[0.2em] text-tertiary-token'>
          Sentry Example
        </p>
        <h1 className='text-4xl font-semibold tracking-tight text-primary-token'>
          Frontend error example
        </h1>
        <p className='max-w-2xl text-base leading-7 text-secondary-token'>
          This page exists only to verify that the client-side Sentry bundle
          loads and can capture a browser error without blanking the UI.
        </p>
      </div>

      <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
        <button
          className='inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90'
          onClick={() => {
            throw new Error('Intentional Sentry example frontend error');
          }}
          type='button'
        >
          Throw sample error
        </button>
      </div>
    </main>
  );
}
