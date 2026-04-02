'use client';

import { useEffect, useState } from 'react';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

interface ProductScreenshotClientProps {
  readonly alt: string;
  readonly aspectRatio: string;
  readonly chrome: 'window' | 'minimal';
  readonly className?: string;
  readonly height: number;
  readonly priority: boolean;
  readonly quality?: number;
  readonly sizes?: string;
  readonly src: string;
  readonly testId?: string;
  readonly title: string;
  readonly width: number;
}

export function ProductScreenshotClient({
  alt,
  aspectRatio,
  chrome,
  className,
  height,
  priority,
  quality,
  sizes,
  src,
  testId,
  title,
  width,
}: ProductScreenshotClientProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let isActive = true;

    fetch(src, { method: 'HEAD' })
      .then(response => {
        if (isActive) {
          const contentType = response.headers.get('content-type') ?? '';
          setIsAvailable(response.ok && contentType.startsWith('image/'));
        }
      })
      .catch(() => {
        if (isActive) {
          setIsAvailable(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [src]);

  return (
    <ProductScreenshotFrame
      alt={alt}
      aspectRatio={aspectRatio}
      chrome={chrome}
      className={className}
      height={height}
      isAvailable={isAvailable}
      priority={priority}
      quality={quality}
      sizes={sizes}
      src={src}
      testId={testId}
      title={title}
      width={width}
    />
  );
}
