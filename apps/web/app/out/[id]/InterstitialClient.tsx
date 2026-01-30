'use client';

/**
 * Client-side Interstitial Component
 * Handles human verification and secure URL fetching
 */

import { useCallback, useState } from 'react';
import { useLinkVerificationMutation } from '@/lib/queries';

interface InterstitialClientProps {
  shortId: string;
  titleAlias: string;
  domain: string;
}

export function InterstitialClient({
  shortId,
  titleAlias,
  domain,
}: InterstitialClientProps) {
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const { mutate: verifyLink, isPending: isVerifying } =
    useLinkVerificationMutation({
      onSuccess: data => {
        setIsVerified(true);
        // Short delay to show success state, then redirect
        setTimeout(() => {
          globalThis.location.replace(data.url);
        }, 1000);
      },
      onError: err => {
        setError(err.message || 'An error occurred');
      },
    });

  const handleContinue = useCallback(() => {
    if (isVerifying) return;
    setError(null);

    verifyLink({
      shortId,
      verified: true,
      timestamp: Date.now(),
    });
  }, [shortId, isVerifying, verifyLink]);

  if (isVerified) {
    return (
      <div className='text-center'>
        <div className='mb-4'>
          <div className='mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center'>
            <svg
              className='w-8 h-8 text-green-600'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <title>Verified</title>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M5 13l4 4L19 7'
              />
            </svg>
          </div>
        </div>
        <p className='text-green-600 font-medium'>Verified! Redirecting...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Dynamic content loaded client-side */}
      <noscript>
        <p className='text-red-600 mb-4'>
          JavaScript is required to continue to this link.
        </p>
      </noscript>

      <div className='mb-4 p-3 bg-gray-50 rounded-lg'>
        <p className='text-sm text-gray-700'>
          <strong>Destination:</strong> {titleAlias}
        </p>
        {/* Only show domain when it's not obfuscated */}
        {domain !== 'External Site' && (
          <p className='text-xs text-gray-500 mt-1'>Domain: {domain}</p>
        )}
      </div>

      {error && (
        <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
          <p className='text-sm text-red-600'>{error}</p>
        </div>
      )}

      <button
        type='button'
        onClick={handleContinue}
        disabled={isVerifying}
        className={`
          w-full py-3 px-4 rounded-md font-medium transition-colors
          ${
            isVerifying
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }
        `}
      >
        {isVerifying ? (
          <span className='flex items-center justify-center'>
            <svg
              className='animate-spin motion-reduce:animate-none -ml-1 mr-3 h-5 w-5 text-current'
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <circle
                className='opacity-25'
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='4'
              ></circle>
              <path
                className='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
              ></path>
            </svg>
            Verifying...
          </span>
        ) : (
          'Continue to Link'
        )}
      </button>

      <p className='mt-3 text-xs text-gray-500'>
        By continuing, you acknowledge this link leads to external content.
      </p>
    </div>
  );
}
