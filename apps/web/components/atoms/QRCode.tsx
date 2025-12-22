import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
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
  const qrUrl = useMemo(() => getQrCodeUrl(data, size), [data, size]);

  // Reset error state when props change
  useEffect(() => {
    setHasError(false);
  }, [data, size]);

  if (hasError) {
    return (
      <div
        role='img'
        aria-label={`${label} unavailable`}
        className={cn(
          'flex items-center justify-center rounded bg-gray-100 text-gray-500',
          className
        )}
        style={{ width: size, height: size }}
      >
        <span className='text-xs'>QR code unavailable</span>
      </div>
    );
  }

  return (
    <Image
      src={qrUrl}
      alt={label}
      width={size}
      height={size}
      className={cn(className)}
      style={{ width: size, height: size }}
      unoptimized // QR codes are dynamically generated
      onError={() => setHasError(true)}
    />
  );
}
