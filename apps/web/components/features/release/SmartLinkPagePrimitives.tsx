import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
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
    <div
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-lg bg-surface-1/30 shadow-2xl ring-1 ring-white/[0.08]',
        className
      )}
    >
      {artworkUrl ? (
        <Image
          src={artworkUrl}
          alt={`${title} artwork`}
          fill
          className='object-cover'
          sizes='272px'
          priority
        />
      ) : (
        <div className='flex h-full w-full items-center justify-center'>
          <Icon
            name='Disc3'
            className='text-muted-foreground h-16 w-16'
            aria-hidden='true'
          />
        </div>
      )}
    </div>
  );
}

export function SmartLinkArtistName({
  name,
  handle,
  className,
}: Readonly<SmartLinkArtistNameProps>) {
  const sharedClassName = cn('text-muted-foreground mt-1', className);

  if (!handle) {
    return <p className={sharedClassName}>{name}</p>;
  }

  return (
    <Link href={`/${handle}`} className={sharedClassName}>
      {name}
    </Link>
  );
}

export function SmartLinkPoweredByFooter() {
  return (
    <footer className='shrink-0 pb-5 pt-3 text-center'>
      <Link
        href='/'
        className='text-muted-foreground/70 hover:text-foreground/90 inline-flex items-center gap-1 text-2xs uppercase tracking-widest transition-colors'
      >
        <span>Powered by</span>
        <span className='font-semibold'>Jovie</span>
      </Link>
    </footer>
  );
}
