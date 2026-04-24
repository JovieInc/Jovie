import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  readonly variant?: 'page' | 'image-only' | 'modal';
}

export function AuthBrandPanel({
  className,
  variant = 'page',
}: Readonly<AuthBrandPanelProps>) {
  const isModalVariant = variant === 'modal';
  const showCopy = variant === 'page';

  const showcaseAsset = isModalVariant
    ? {
        src: '/product-screenshots/release-sidebar-detail.png',
        alt: 'Jovie release detail panel showing analytics and release properties',
        aspectRatio: '391 / 845',
        sizes: '320px',
        imageClassName: 'object-cover object-top',
      }
    : {
        src: '/product-screenshots/releases-dashboard-full.png',
        alt: 'Jovie releases workspace showing artist releases, links, and audience context in one view',
        aspectRatio: '2880 / 1800',
        sizes: '(min-width: 1280px) 640px, (min-width: 1024px) 48vw, 100vw',
        imageClassName: 'object-cover object-left-top',
      };

  return (
    <div
      className={cn(
        'auth-showcase-panel flex flex-col',
        isModalVariant
          ? 'min-h-[20rem] justify-center p-4 sm:p-5'
          : 'min-h-[42rem] justify-between lg:min-h-[calc(100svh-8rem)]',
        className
      )}
      data-variant={variant}
    >
      {showCopy ? (
        <div className='auth-showcase-copy space-y-4'>
          <h2 className='text-[clamp(2.95rem,4.2vw,4.05rem)] leading-[0.92] font-[590] tracking-[-0.065em] whitespace-nowrap text-white'>
            Built for Artists.
          </h2>
          <p className='max-w-[21rem] text-[0.97rem] leading-[1.65] font-[420] text-white/56 text-pretty'>
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
            fill
            priority={!isModalVariant}
            sizes={showcaseAsset.sizes}
            className={showcaseAsset.imageClassName}
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
