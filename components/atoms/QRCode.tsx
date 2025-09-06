import Image from 'next/image';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

const qrCache = new Map<string, string>();

function getQrUrl(data: string, size: number) {
  const key = `${data}-${size}`;
  if (!qrCache.has(key)) {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
    qrCache.set(key, url);
  }
  return qrCache.get(key)!;
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
  const qrUrl = useMemo(() => getQrUrl(data, size), [data, size]);

  if (hasError) {
    return (
      <div
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
