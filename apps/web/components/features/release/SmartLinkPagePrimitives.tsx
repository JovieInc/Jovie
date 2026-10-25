import Image from 'next/image';
import Link from 'next/link';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { Icon } from '@/components/atoms/Icon';
import { APP_ROUTES } from '@/constants/routes';
import { Mark } from '@/lib/brand/primitives';
import { cn } from '@/lib/utils';

interface SmartLinkAmbientGlowProps {
  readonly className?: string;
}

interface SmartLinkArtworkCardProps {
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly className?: string;
}

interface SmartLinkArtistNameProps {
  readonly name: string;
  readonly handle: string | null;
  readonly className?: string;
}

interface SmartLinkPageFrameProps {
  readonly children: React.ReactNode;
  readonly glowClassName?: string;
  readonly mainId?: string;
  /** When true, vertically centers content instead of using fixed-height scrollable layout */
  readonly centered?: boolean;
}

export function SmartLinkAmbientGlow({
  className,
}: Readonly<SmartLinkAmbientGlowProps>) {
  return (
    <div className='pointer-events-none fixed inset-0'>
      <div
        className={cn(
          'bg-foreground/5 absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]',
          className
        )}
      />
    </div>
  );
}

export function SmartLinkArtworkCard({
  title,
  artworkUrl,
  className,
}: Readonly<SmartLinkArtworkCardProps>) {
  return (
    <ArtworkFrame
      size={272}
      className={cn('aspect-square w-full bg-white/5 shadow-2xl', className)}
    >
      {artworkUrl ? (
        <Image
          src={artworkUrl}
          alt={`${title} artwork`}
          fill
          className={ARTWORK_FIT_CLASSNAME}
          sizes='272px'
          priority
        />
      ) : (
        <div className='flex h-full w-full items-center justify-center'>
          <Icon
            name='AudioLines'
            className='text-muted-foreground h-16 w-16'
            aria-hidden='true'
          />
        </div>
      )}
    </ArtworkFrame>
  );
}

export function SmartLinkArtistName({
  name,
  handle,
  className,
}: Readonly<SmartLinkArtistNameProps>) {
  const sharedClassName = cn('text-muted-foreground mt-1', className);
  const linkClassName = cn(
    sharedClassName,
    "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
  );

  if (!handle) {
    return <p className={sharedClassName}>{name}</p>;
  }

  return (
    <Link href={`/${handle}`} className={linkClassName}>
      {name}
    </Link>
  );
}

// 44px hit container (invisible) so small captions stay tappable.
const FOOTER_HIT_CONTAINER =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-full before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
// Primary: the single brand line (14px medium).
const FOOTER_BRAND_CLASSES = `${FOOTER_HIT_CONTAINER} smart-link-powered-by inline-flex items-center gap-2 text-sm font-medium text-neutral-700 transition-colors duration-subtle hover:text-neutral-950 dark:text-muted-foreground dark:hover:text-foreground/90`;
// Secondary: utility links (12px caption, regular weight).
const FOOTER_UTILITY_CLASSES = `${FOOTER_HIT_CONTAINER} inline-flex items-center text-xs font-normal text-neutral-600 transition-colors duration-subtle hover:text-neutral-950 dark:text-muted-foreground dark:hover:text-foreground/90`;

/**
 * Abuse-report entry point for a smart link. The target must identify the
 * exact page being reported: a bare slug is ambiguous across artists, so
 * callers pass the public path (`/{handle}/{slug}`).
 */
export function buildSmartLinkReportHref(reportTarget?: string | null): string {
  const base = `${APP_ROUTES.REPORT}?type=smart_link`;
  const target = reportTarget?.trim();
  return target ? `${base}&target=${encodeURIComponent(target)}` : base;
}

export function SmartLinkPoweredByFooter({
  reportTarget,
}: Readonly<{ reportTarget?: string | null }>) {
  const reportHref = buildSmartLinkReportHref(reportTarget);
  return (
    // Spacing groups on the 4/8 grid: 40px of air above the footer, brand line
    // first, 8px, then quiet utility links 24px apart. No separators.
    <footer className='shrink-0 px-5 pb-6 pt-10 text-center'>
      <Link href='/' className={FOOTER_BRAND_CLASSES}>
        <Mark size={16} className='h-4 w-4' />
        <span>Made with Jovie</span>
      </Link>
      <nav
        aria-label='Page Links'
        className='mt-2 flex items-center justify-center gap-6'
      >
        <Link
          href={APP_ROUTES.LEGAL_PRIVACY}
          className={FOOTER_UTILITY_CLASSES}
        >
          Privacy
        </Link>
        <Link href={reportHref} className={FOOTER_UTILITY_CLASSES}>
          Report
        </Link>
      </nav>
    </footer>
  );
}

export function SmartLinkPageFrame({
  children,
  glowClassName,
  mainId,
  centered = false,
}: Readonly<SmartLinkPageFrameProps>) {
  return (
    <div
      className={cn(
        'bg-base text-foreground',
        centered ? 'min-h-dvh' : 'h-dvh'
      )}
    >
      <SmartLinkAmbientGlow className={glowClassName} />

      <main
        id={mainId}
        className={cn(
          'relative z-10 flex flex-col items-center px-6',
          centered ? 'min-h-dvh' : 'h-full pt-10'
        )}
      >
        {centered && <div className='min-h-6 flex-1' />}
        <div
          className={cn(
            'w-full max-w-[17rem]',
            !centered && 'flex min-h-0 flex-1 flex-col'
          )}
        >
          {children}
        </div>
        {centered && <div className='min-h-6 flex-1' />}
        <SmartLinkPoweredByFooter />
      </main>
    </div>
  );
}
