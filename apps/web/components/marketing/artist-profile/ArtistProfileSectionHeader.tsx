import { cn } from '@/lib/utils';

interface ArtistProfileSectionHeaderProps {
  readonly headline: string;
  readonly body?: string;
  readonly eyebrow?: string;
  readonly align?: 'center' | 'left';
  readonly className?: string;
  readonly headlineClassName?: string;
  readonly bodyClassName?: string;
  readonly eyebrowClassName?: string;
}

export const SHELL_H2_CLASS =
  'text-[clamp(2.25rem,4.8vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.04em] text-primary-token text-balance';

export const SHELL_EYEBROW_CLASS =
  'text-xs font-medium uppercase tracking-[0.06em] text-secondary-token';

export const SHELL_LEAD_CLASS =
  'text-[clamp(1.0625rem,1.4vw,1.25rem)] leading-[1.45] text-secondary-token text-pretty';

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
        isCentered ? 'mx-auto max-w-[46rem] text-center' : 'max-w-2xl',
        className
      )}
    >
      {eyebrow ? (
        <p className={cn(SHELL_EYEBROW_CLASS, 'mb-5', eyebrowClassName)}>
          {eyebrow}
        </p>
      ) : null}
      <h2 className={cn(SHELL_H2_CLASS, headlineClassName)}>{headline}</h2>
      {body ? (
        <p
          className={cn(
            SHELL_LEAD_CLASS,
            'mt-5 sm:mt-6',
            isCentered ? 'mx-auto max-w-[38rem]' : 'max-w-2xl',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
