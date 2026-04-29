import { cn } from '@/lib/utils';

interface ArtistProfileSectionHeaderProps {
  readonly headline: string;
  readonly body?: string;
  /**
   * Optional editorial eyebrow rendered above the headline. Inside the
   * .frame-skin design layer this picks up the .frame-eyebrow style
   * (caps, 11px, 0.18em tracking, off-white at 42% opacity).
   */
  readonly eyebrow?: string;
  readonly align?: 'center' | 'left';
  readonly className?: string;
  readonly headlineClassName?: string;
  readonly bodyClassName?: string;
  readonly eyebrowClassName?: string;
}

export function ArtistProfileSectionHeader({
  headline,
  body,
  eyebrow,
  align = 'center',
  className,
  headlineClassName,
  bodyClassName,
  eyebrowClassName,
}: Readonly<ArtistProfileSectionHeaderProps>) {
  const isCentered = align === 'center';

  return (
    <div
      className={cn(
        isCentered ? 'mx-auto max-w-[46rem] text-center' : 'max-w-[42rem]',
        className
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'frame-eyebrow text-tertiary-token',
            isCentered ? 'mb-6' : 'mb-5',
            eyebrowClassName
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          'text-[clamp(2.6rem,5.1vw,4.5rem)] font-[640] leading-[0.96] tracking-[-0.07em] text-primary-token',
          headlineClassName
        )}
      >
        {headline}
      </h2>
      {body ? (
        <p
          className={cn(
            'mt-6 text-[clamp(1rem,1.55vw,1.18rem)] leading-[1.62] tracking-[-0.018em] text-secondary-token',
            isCentered ? 'mx-auto max-w-[36rem]' : null,
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
