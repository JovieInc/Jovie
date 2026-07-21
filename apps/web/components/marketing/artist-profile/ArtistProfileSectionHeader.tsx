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

export const SHELL_H2_CLASS = 'system-b-artist-profile-shell-h2';

export const SHELL_EYEBROW_CLASS = 'system-b-artist-profile-shell-eyebrow';

export const SHELL_LEAD_CLASS = 'system-b-artist-profile-shell-lead';

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
        isCentered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl',
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
            isCentered ? 'mx-auto max-w-xl' : 'max-w-2xl',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
