import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  readonly variant?: 'page' | 'image-only';
}

export function AuthBrandPanel({
  className,
  variant = 'page',
}: Readonly<AuthBrandPanelProps>) {
  const showCopy = variant === 'page';

  const showcaseAsset = {
    src: '/product-screenshots/releases-dashboard-full.png',
    alt: 'Jovie releases workspace showing artist releases, links, and audience context in one view',
    width: 2880,
    height: 1800,
    aspectRatio: variant === 'image-only' ? '1 / 1.12' : '1 / 1.48',
    sizes: '(min-width: 1280px) 620px, (min-width: 1024px) 46vw, 100vw',
    imageClassName:
      variant === 'image-only'
        ? 'object-cover object-[22%_top] brightness-[1.05] contrast-[1.03]'
        : 'object-cover object-[24%_top] brightness-[1.05] contrast-[1.03]',
  } as const;

  return (
    <div
      className={cn(
        'auth-showcase-panel flex h-full flex-col',
        'min-h-[42rem] lg:min-h-[calc(100svh-7.5rem)]',
        className
      )}
      data-variant={variant}
    >
      {showCopy ? (
        <div className='auth-showcase-copy space-y-3'>
          <h2 className='text-[clamp(2.15rem,2.95vw,2.9rem)] leading-[0.95] font-[600] tracking-[-0.055em] whitespace-nowrap text-white'>
            Built for Artists.
          </h2>
          <p className='max-w-[16rem] text-[0.92rem] leading-[1.58] font-[420] text-white/54 text-pretty'>
            Jovie keeps releases, profiles, and the audience behind them in one
            calm system.
          </p>
        </div>
      ) : null}

      <div className='auth-showcase-frame w-full'>
        <div
          className='auth-showcase-screen'
          style={{ aspectRatio: showcaseAsset.aspectRatio }}
        >
          <Image
            src={showcaseAsset.src}
            alt={showcaseAsset.alt}
            width={showcaseAsset.width}
            height={showcaseAsset.height}
            priority
            sizes={showcaseAsset.sizes}
            className={`h-full w-full ${showcaseAsset.imageClassName}`}
          />
        </div>
      </div>

      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.04]'
      />
    </div>
  );
}
