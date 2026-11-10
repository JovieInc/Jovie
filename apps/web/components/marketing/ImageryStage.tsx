import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';
import './ImageryStage.css';

/**
 * The marketing imagery renderer (docs/marketing/IMAGERY.md). Landing pages
 * show art only through this component, so the one place that owns the raw
 * image tag is also the place that owns its radius: the image follows the
 * frame that clips it, and the frame carries a `--radius-*` token.
 */
export function ImageryStage({
  className,
  alt,
  ...image
}: Readonly<ImageProps>) {
  return (
    <Image
      {...image}
      alt={alt}
      className={cn('imagery-stage__img', className)}
    />
  );
}
