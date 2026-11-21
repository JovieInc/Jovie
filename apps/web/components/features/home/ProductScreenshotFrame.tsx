import Image from 'next/image';
import { COPY_FALLBACKS } from '@/data/copyFallbacks';

interface ProductScreenshotFrameProps {
  readonly alt: string;
  readonly aspectRatio: string;
  readonly chrome: 'window' | 'minimal';
  readonly className?: string;
  readonly height: number;
  readonly isAvailable: boolean;
  readonly onImageError?: () => void;
  readonly priority: boolean;
  readonly quality?: number;
  readonly sizes?: string;
  readonly src: string;
  readonly testId?: string;
  readonly title: string;
  readonly width: number;
}

function renderScreenshotContent({
  alt,
  aspectRatio,
  height,
  isAvailable,
  onImageError,
  priority,
  quality,
  sizes,
  src,
  title,
  width,
}: Pick<
  ProductScreenshotFrameProps,
  | 'alt'
  | 'aspectRatio'
  | 'height'
  | 'isAvailable'
  | 'onImageError'
  | 'priority'
  | 'quality'
  | 'sizes'
  | 'src'
  | 'title'
  | 'width'
>) {
  if (isAvailable === false) {
    return (
      <div
        className='grid w-full place-items-center px-6 py-10 text-center'
        style={{ aspectRatio }}
      >
        <div className='max-w-88'>
          <div className='mb-4 inline-flex rounded-full border border-subtle bg-surface-1 px-3 py-1 text-xs text-tertiary-token'>
            {title}
          </div>
          <p className='text-lg font-medium tracking-tight text-primary-token'>
            {COPY_FALLBACKS.preview}
          </p>
          <p className='mt-2 text-sm leading-6 text-secondary-token'>
            See it live when you sign up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      quality={quality}
      sizes={sizes}
      className='marketing-rounded-frame w-full'
      onError={onImageError}
    />
  );
}

export function ProductScreenshotFrame({
  alt,
  aspectRatio,
  chrome,
  className,
  height,
  isAvailable,
  onImageError,
  priority,
  quality,
  sizes,
  src,
  testId,
  title,
  width,
}: ProductScreenshotFrameProps) {
  return (
    <figure
      aria-label={isAvailable === true ? undefined : alt}
      data-testid={testId}
      className={[
        'marketing-rounded-frame relative border border-subtle bg-surface-0 shadow-card-elevated',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-linear-to-r from-transparent via-on-media/20 to-transparent'
      />

      {chrome === 'window' ? (
        <div className='flex h-10 items-center border-b border-subtle bg-surface-1 px-4 sm:px-5'>
          <div className='flex gap-2' aria-hidden='true'>
            <div className='h-3 w-3 rounded-full bg-(--color-accent-red)' />
            <div className='h-3 w-3 rounded-full bg-(--color-accent-orange)' />
            <div className='h-3 w-3 rounded-full bg-(--color-accent-green)' />
          </div>
          <div className='flex-1 text-center text-xs text-tertiary-token'>
            {title}
          </div>
          <div className='w-13' />
        </div>
      ) : null}

      {renderScreenshotContent({
        alt,
        aspectRatio,
        height,
        isAvailable,
        onImageError,
        priority,
        quality,
        sizes,
        src,
        title,
        width,
      })}
    </figure>
  );
}
