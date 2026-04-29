import Image from 'next/image';

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
        className='grid w-full place-items-center bg-[radial-gradient(circle_at_top,rgba(113,112,255,0.12),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-6 py-10 text-center'
        style={{ aspectRatio }}
      >
        <div className='max-w-[22rem]'>
          <div className='mb-4 inline-flex rounded-full border border-subtle bg-surface-1 px-3 py-1 text-xs text-tertiary-token'>
            {title}
          </div>
          <p className='text-lg font-medium tracking-tight text-primary-token'>
            Preview coming soon
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
      className='w-full'
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
      data-screenshot-chrome={chrome}
      data-testid={testId}
      className={[
        'relative overflow-hidden rounded-[0.95rem] border border-subtle bg-surface-0 shadow-card-elevated md:rounded-[1rem]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        boxShadow:
          '0 0 0 1px var(--linear-app-shell-border), 0 28px 70px rgba(0,0,0,0.28), 0 10px 22px rgba(0,0,0,0.18)',
      }}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.16) 24%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.16) 76%, transparent)',
        }}
      />

      {chrome === 'window' ? (
        <div className='flex h-10 items-center border-b border-subtle bg-surface-1 px-4 sm:px-5'>
          <div className='flex gap-2' aria-hidden='true'>
            <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
            <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
            <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
          </div>
          <div className='flex-1 text-center text-xs text-tertiary-token'>
            {title}
          </div>
          <div className='w-[52px]' />
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
