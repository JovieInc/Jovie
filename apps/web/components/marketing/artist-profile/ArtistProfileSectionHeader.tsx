import { cn } from '@/lib/utils';

interface ArtistProfileSectionHeaderProps {
  readonly headline: string;
  readonly body?: string;
  readonly align?: 'center' | 'left';
  readonly className?: string;
  readonly headlineClassName?: string;
  readonly bodyClassName?: string;
}

export function ArtistProfileSectionHeader({
  headline,
  body,
  align = 'center',
  className,
  headlineClassName,
  bodyClassName,
}: Readonly<ArtistProfileSectionHeaderProps>) {
  const isCentered = align === 'center';

  return (
    <div
      className={cn(
        isCentered ? 'mx-auto max-w-[44rem] text-center' : 'max-w-[40rem]',
        className
      )}
    >
      <h2
        className={cn(
          'text-[clamp(2.7rem,5.25vw,4.6rem)] font-[650] leading-[0.94] tracking-[-0.072em] text-primary-token',
          headlineClassName
        )}
      >
        {headline}
      </h2>
      {body ? (
        <p
          className={cn(
            'mt-5 text-[clamp(1rem,1.55vw,1.16rem)] leading-[1.65] tracking-[-0.02em] text-secondary-token',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
