import { cn } from '@/lib/utils';
import './ArtistProfileSectionHeader.css';

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
  'ap-shell-h2 font-bold text-primary-token text-balance';

export const SHELL_EYEBROW_CLASS =
  'ap-shell-eyebrow text-xs font-medium uppercase text-secondary-token';

export const SHELL_LEAD_CLASS =
  'ap-shell-lead text-secondary-token text-pretty';

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
        isCentered
          ? 'ap-shell-header--centered mx-auto text-center'
          : 'max-w-2xl',
        className
      )}
    >
      {eyebrow ? (
        <p className={cn(SHELL_EYEBROW_CLASS, 'mb-5', eyebrowClassName)}>
          {eyebrow}
        </p>
      ) : null}
      {/* ui-casing-allow: marketing display headline */}
      <h2 className={cn(SHELL_H2_CLASS, headlineClassName)}>{headline}</h2>
      {body ? (
        <p
          className={cn(
            SHELL_LEAD_CLASS,
            'mt-5 sm:mt-6',
            isCentered
              ? 'ap-shell-header__body--centered mx-auto'
              : 'max-w-2xl',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
