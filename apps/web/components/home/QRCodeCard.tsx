'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { PROFILE_URL } from '@/constants/app';

interface QRCodeCardProps {
  readonly handle: string;
}

export function QRCodeCard({ handle }: QRCodeCardProps) {
  const [effectiveHandle, setEffectiveHandle] = useState(handle);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const profileUrl = `${PROFILE_URL}/${effectiveHandle}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ handle?: string }>;
      const next = customEvent.detail?.handle?.trim();
      setEffectiveHandle(next && next.length > 0 ? next : handle);
    };

    globalThis.addEventListener(
      'jovie-hero-handle-change',
      listener as EventListener
    );

    return () => {
      globalThis.removeEventListener(
        'jovie-hero-handle-change',
        listener as EventListener
      );
    };
  }, [handle]);

  // Generate QR code URL using a free QR code API
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);

    // Using QR Code API to generate QR code
    // We're encoding the profile URL to be viewed on mobile
    const encodedUrl = encodeURIComponent(profileUrl);
    setQrCodeUrl(
      `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodedUrl}`
    );
  }, [profileUrl]);

  return (
    <div className='relative group'>
      {/* Card with glass morphism effect */}
      <div className='relative p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-white/10 shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-1'>
        <div className='flex flex-col items-center'>
          {/* QR Code */}
          <div className='w-[120px] h-[120px] bg-white rounded-lg p-2 shadow-sm'>
            {qrCodeUrl && !hasError ? (
              <Image
                src={qrCodeUrl}
                alt={`QR code for ${handle}`}
                width={100}
                height={100}
                sizes='100px'
                className='w-full h-full'
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
              />
            ) : (
              <div className='w-full h-full bg-gray-200 animate-pulse motion-reduce:animate-none rounded'>
                {isLoading && (
                  <div className='flex items-center justify-center h-full text-xs text-gray-500'>
                    Loading...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Text */}
          <div className='mt-3 text-center'>
            <p className='text-xs font-medium text-gray-900 dark:text-white'>
              Scan to view on mobile
            </p>
            <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
              <span className='text-gray-400 dark:text-gray-500'>@</span>
              {handle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
