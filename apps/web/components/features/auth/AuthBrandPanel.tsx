import Image from 'next/image';
import { BrowserFrame } from '@/components/features/demo/BrowserFrame';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  readonly compact?: boolean;
}

export function AuthBrandPanel({
  className,
  compact = false,
}: Readonly<AuthBrandPanelProps>) {
  const showcaseAsset = compact
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
        compact
          ? 'min-h-[20rem] justify-center p-4 sm:p-5'
          : 'min-h-[42rem] justify-between p-6 sm:p-7 lg:min-h-[calc(100svh-8rem)] lg:p-8 xl:p-10',
        className
      )}
      data-compact={compact ? 'true' : undefined}
    >
      {!compact ? (
        <div className='auth-showcase-copy max-w-[25rem] space-y-5'>
          <h2 className='text-[clamp(3.25rem,5vw,5rem)] leading-[0.9] font-[590] tracking-[-0.07em] text-white text-balance'>
            Built for Artists.
          </h2>
          <p className='max-w-[22rem] text-[1rem] leading-[1.7] font-[420] text-white/58 text-pretty'>
            Jovie keeps releases, profiles, and the audience behind them in one
            calm system.
          </p>
        </div>
      ) : null}

      <div className='auth-showcase-frame w-full'>
        <div className='auth-showcase-browser-shell'>
          <BrowserFrame>
            <div
              className='auth-showcase-screen'
              style={{ aspectRatio: showcaseAsset.aspectRatio }}
            >
              <Image
                src={showcaseAsset.src}
                alt={showcaseAsset.alt}
                fill
                priority={!compact}
                sizes={showcaseAsset.sizes}
                className={showcaseAsset.imageClassName}
              />
            </div>
          </BrowserFrame>
        </div>
      </div>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.04]'
      />
    </div>
  );
}
