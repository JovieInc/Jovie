'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';

class SentryExampleFrontendError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'SentryExampleFrontendError';
  }
}

export function SentryExamplePageClient() {
  const [hasSentError, setHasSentError] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    async function checkConnectivity() {
      try {
        const result = await Sentry.diagnoseSdkConnectivity();
        setIsConnected(result !== 'sentry-unreachable');
      } catch (error) {
        console.error('Failed to check Sentry connectivity:', error);
        setIsConnected(false);
      }
    }
    checkConnectivity();
  }, []);

  return (
    <div>
      <main className='flex min-h-screen flex-col items-center justify-center gap-4 p-4'>
        <div className='flex-1' />
        <svg
          height='40'
          width='40'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
        >
          <path
            d='M21.85 2.995a3.698 3.698 0 0 1 1.353 1.354l16.303 28.278a3.703 3.703 0 0 1-1.354 5.053 3.694 3.694 0 0 1-1.848.496h-3.828a31.149 31.149 0 0 0 0-3.09h3.815a.61.61 0 0 0 .537-.917L20.523 5.893a.61.61 0 0 0-1.057 0l-3.739 6.494a28.948 28.948 0 0 1 9.63 10.453 28.988 28.988 0 0 1 3.499 13.78v1.542h-9.852v-1.544a19.106 19.106 0 0 0-2.182-8.85 19.08 19.08 0 0 0-6.032-6.829l-1.85 3.208a15.377 15.377 0 0 1 6.382 12.484v1.542H3.696A3.694 3.694 0 0 1 0 34.473c0-.648.17-1.286.494-1.849l2.33-4.074a8.562 8.562 0 0 1 2.689 1.536L3.158 34.17a.611.611 0 0 0 .538.917h8.448a12.481 12.481 0 0 0-6.037-9.09l-1.344-.772 4.908-8.545 1.344.77a22.16 22.16 0 0 1 7.705 7.444 22.193 22.193 0 0 1 3.316 10.193h3.699a25.892 25.892 0 0 0-3.811-12.033 25.856 25.856 0 0 0-9.046-8.796l-1.344-.772 5.269-9.136a3.698 3.698 0 0 1 3.2-1.849c.648 0 1.285.17 1.847.495Z'
            fill='currentColor'
          />
        </svg>
        <h1 className='rounded bg-[rgba(24,20,35,0.03)] px-1 text-[20px] leading-[1.2]'>
          sentry-example-page
        </h1>

        <p className='m-0 max-w-[500px] text-center text-[20px] leading-[1.5] text-[#6e6c75] dark:text-[#a49fb5]'>
          Click the button below, and view the sample error on the Sentry{' '}
          <a
            target='_blank'
            rel='noreferrer'
            href='https://jovie.sentry.io/issues/?project=4510479236792320'
            className='cursor-pointer underline text-[#6341f0] dark:text-[#b3a1ff]'
          >
            Issues Page
          </a>
          {'. '}For more details about setting up Sentry,{' '}
          <a
            target='_blank'
            rel='noreferrer'
            href='https://docs.sentry.io/platforms/javascript/guides/nextjs/'
            className='cursor-pointer underline text-[#6341f0] dark:text-[#b3a1ff]'
          >
            read our docs
          </a>
          {'.'}
        </p>

        <button
          type='button'
          onClick={async () => {
            await Sentry.startSpan(
              {
                name: 'Example Frontend/Backend Span',
                op: 'test',
              },
              async () => {
                const res = await fetch('/api/sentry-example-api');
                if (!res.ok) {
                  setHasSentError(true);
                }
              }
            );
            throw new SentryExampleFrontendError(
              'This error is raised on the frontend of the example page.'
            );
          }}
          disabled={!isConnected}
          className='mt-1 rounded-lg bg-[#553db8] p-0 text-white disabled:cursor-not-allowed disabled:opacity-60 [&>span]:inline-block [&>span]:rounded-[inherit] [&>span]:bg-[#7553ff] [&>span]:border [&>span]:border-[#553db8] [&>span]:px-4 [&>span]:py-3 [&>span]:text-[20px] [&>span]:font-bold [&>span]:leading-none [&>span]:translate-y-[-4px] [&>span]:transition-transform [&>span]:duration-150 hover:[&>span]:translate-y-[-8px] active:[&>span]:translate-y-0 disabled:[&>span]:translate-y-0 disabled:[&>span]:border-0'
        >
          <span>Throw Sample Error</span>
        </button>

        {(() => {
          if (hasSentError) {
            return (
              <p className='m-0 rounded-lg border border-[#00bf4d] bg-[#00f261] px-4 py-3 text-[20px] leading-none text-[#181423]'>
                Error sent to Sentry.
              </p>
            );
          }
          if (!isConnected) {
            return (
              <div className='w-[500px] rounded-lg border border-[#a80033] bg-[#e50045] p-4 text-center text-white'>
                <p className='m-0 text-[20px]'>
                  It looks like network requests to Sentry are being blocked,
                  which will prevent errors from being captured. Try disabling
                  your ad-blocker to complete the test.
                </p>
              </div>
            );
          }
          return <div className='h-[46px]' />;
        })()}

        <div className='flex-1' />
      </main>
    </div>
  );
}
