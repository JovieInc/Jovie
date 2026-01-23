'use client';

import Image from 'next/image';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

// Cache with size limit to prevent memory leaks
const qrCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

export function getQrCodeUrl(data: string, size: number) {
  const key = `${data}-${size}`;

  let url = qrCache.get(key);
  if (!url) {
    url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;

    // Implement simple LRU eviction when cache is full
    if (qrCache.size >= MAX_CACHE_SIZE) {
      const firstKey = qrCache.keys().next().value as string | undefined;
      if (firstKey !== undefined) {
        qrCache.delete(firstKey);
      }
    }

    qrCache.set(key, url);
  }

  return url;
}

interface QRCodeProps {
  data: string;
  size?: number;
  label?: string;
  className?: string;
}

export function QRCode({
  data,
  size = 120,
  label = 'QR Code',
  className,
}: QRCodeProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const qrUrl = useMemo(() => getQrCodeUrl(data, size), [data, size]);

  // Memoize size style to avoid creating new object on each render
  const sizeStyle = useMemo<CSSProperties>(
    () => ({ width: size, height: size }),
    [size]
  );

  // Reset error and loading state when props change
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [data, size]);

  if (hasError) {
    return (
      // NOSONAR S6819: Fallback state container needs role="img" for accessibility
      <div
        role='img'
        aria-label={`${label} unavailable`}
        className={cn(
          'flex items-center justify-center rounded bg-gray-100 text-gray-500',
          className
        )}
        style={sizeStyle}
      >
        <span className='text-xs'>QR code unavailable</span>
      </div>
    );
  }

  return (
    <div className='relative' style={sizeStyle}>
      {/* Loading skeleton */}
      {isLoading && (
        <div
          className='absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse motion-reduce:animate-none'
          aria-hidden='true'
        />
      )}

      {/* QR Code Image */}
      <Image
        src={qrUrl}
        alt={label}
        width={size}
        height={size}
        className={cn(className)}
        style={sizeStyle}
        unoptimized // QR codes are dynamically generated
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
