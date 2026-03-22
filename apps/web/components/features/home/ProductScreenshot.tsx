import Image from 'next/image';

interface ProductScreenshotProps {
  /** Path to the screenshot image in /public */
  readonly src: string;
  /** Alt text for accessibility */
  readonly alt: string;
  /** Natural width of the source image (2x retina) */
  readonly width: number;
  /** Natural height of the source image (2x retina) */
  readonly height: number;
  /** Title shown in the window chrome title bar */
  readonly title?: string;
  /** Whether to preload the image (set true for above-the-fold) */
  readonly priority?: boolean;
  /** Additional className for the outer wrapper */
  readonly className?: string;
}

/**
 * Renders a real product screenshot inside Mac-style window chrome.
 * Drop-in replacement for hand-coded dashboard/analytics mockups.
 */
export function ProductScreenshot({
  src,
  alt,
  width,
  height,
  title = 'Jovie',
  priority = false,
  className,
}: ProductScreenshotProps) {
  return (
    <figure
      aria-label={alt}
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
      {/* Top shine */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.16) 24%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.16) 76%, transparent)',
        }}
      />

      {/* Mac window chrome */}
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

      {/* Screenshot image */}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className='w-full'
        sizes='(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1440px'
      />
    </figure>
  );
}
