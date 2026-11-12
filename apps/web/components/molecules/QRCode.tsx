'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// QR codes are generated locally from the existing `qrcode` dependency.
// The previous implementation requested a PNG from api.qrserver.com, a
// third-party host — which broke the profile pages' published claim of zero
// third-party requests on load (apps/web/content/comparative-claims.ts) and
// added a privacy leak and a slow-host dependency to every QR render.
type QrModule = typeof import('qrcode');

let qrModulePromise: Promise<QrModule> | null = null;

function loadQrModule(): Promise<QrModule> {
  qrModulePromise ??= import('qrcode');
  return qrModulePromise;
}

// Cache with size limit to prevent memory leaks
const qrCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

/**
 * Renders `data` as a PNG data URL in a lazy-loaded worker-free pass, then
 * caches by (data, size). Generation is local CPU work: no network request,
 * so it can never hold the page's load event or leak the visitor.
 */
export async function getQrCodeDataUrl(
  data: string,
  size: number
): Promise<string> {
  const key = `${data}-${size}`;

  const cached = qrCache.get(key);
  if (cached) return cached;

  const qrcode = await loadQrModule();
  const url = await qrcode.toDataURL(data, { width: size, margin: 1 });

  // Implement simple LRU eviction when cache is full
  if (qrCache.size >= MAX_CACHE_SIZE) {
    const firstKey = qrCache.keys().next().value;
    if (firstKey !== undefined) {
      qrCache.delete(firstKey);
    }
  }

  qrCache.set(key, url);
  return url;
}

interface QRCodeProps {
  readonly data: string;
  readonly size?: number;
  readonly label?: string;
  readonly className?: string;
}

export function QRCode({
  data,
  size = 120,
  label = 'QR Code',
  className,
}: QRCodeProps) {
  const [src, setSrc] = useState('');
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset error and loading state when props change
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [data, size]);

  useEffect(() => {
    let cancelled = false;

    // Nothing to encode: the same unavailable fallback the failure path uses
    // renders instead of a code that scans to nothing.
    if (data === '') {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    getQrCodeDataUrl(data, size)
      .then(url => {
        if (cancelled) return;
        setSrc(url);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHasError(true);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data, size]);

  if (hasError) {
    return (
      <div
        aria-hidden='true'
        className={cn(
          'flex items-center justify-center rounded bg-surface-1 text-secondary-token',
          className
        )}
        style={{ width: size, height: size }}
      >
        <span className='text-xs'>QR code unavailable</span>
      </div>
    );
  }

  return (
    <div className='relative' style={{ width: size, height: size }}>
      {/* Loading skeleton */}
      {isLoading && (
        <div
          className='absolute inset-0 bg-surface-2 rounded-lg animate-pulse motion-reduce:animate-none'
          aria-hidden='true'
        />
      )}

      {/* QR Code Image (locally generated data URL — no third-party request) */}
      {!isLoading && src && (
        <Image
          src={src}
          alt={label}
          width={size}
          height={size}
          unoptimized // data URLs are final renders, not optimizable sources
          className={cn(className)}
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
        />
      )}
    </div>
  );
}
