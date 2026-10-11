import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { cn } from '@/lib/utils';

/**
 * Public-profile mode card (Pen D14lo6 Listen, NdEbB Events, GTSIc Stay
 * close, QZvG7 Payments). A neutral ink card whose background carries exactly
 * one rotating accent (`profile-mode-card` in design-system.css), assigned by
 * `lib/profile/mode-card-accent.ts`. Eyebrow at the top, the subject anchored
 * to the bottom, and a reserved minimum height so state swaps never shift the
 * page.
 */
export interface ProfileModeCardProps {
  readonly accent: ProfileCardAccentAssignment;
  /** Short neutral label at the top of the card (e.g. "Events"). */
  readonly eyebrow: string;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  /** Optional centered media (artwork) between the eyebrow and the subject. */
  readonly media?: ReactNode;
  /** Controls and CTAs, rendered under the title and description. */
  readonly children?: ReactNode;
  /** Right side of the eyebrow row (e.g. a quiet dismiss control). */
  readonly eyebrowAside?: ReactNode;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly dataTestId?: string;
}

export function ProfileModeCard({
  accent,
  eyebrow,
  title,
  description,
  media,
  children,
  eyebrowAside,
  ariaLabel,
  className,
  dataTestId,
}: Readonly<ProfileModeCardProps>) {
  return (
    <section
      aria-label={ariaLabel ?? eyebrow}
      className={cn('profile-mode-card flex flex-col p-4', className)}
      data-accent={accent.accent}
      data-accent-strength={accent.strength}
      data-testid={dataTestId}
    >
      <div className='flex min-h-6 items-center justify-between gap-2'>
        <span className='block min-w-0 truncate text-app leading-5 text-(--profile-mode-card-muted)'>
          {eyebrow}
        </span>
        {eyebrowAside}
      </div>

      {media ? <div className='mt-2 flex justify-center'>{media}</div> : null}

      <div className='mt-auto flex min-w-0 flex-col pt-3'>
        {title ? (
          <h2 className='min-w-0 truncate text-2xl font-normal leading-8 tracking-tight text-(--profile-mode-card-fg)'>
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className='mt-1 min-w-0 text-mid leading-6 text-(--profile-mode-card-muted)'>
            {description}
          </p>
        ) : null}
        {children ? <div className='mt-2 min-w-0'>{children}</div> : null}
      </div>
    </section>
  );
}

type ProfileModeCardActionProps = Readonly<{
  children: ReactNode;
  href: string;
  external?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  ariaLabel?: string;
  dataTestId?: string;
}>;

const ACTION_HIT_CLASS_NAME =
  'group flex h-11 w-full touch-manipulation items-center focus-visible:outline-none';
const ACTION_FACE_CLASS_NAME =
  'flex h-7 w-full items-center justify-center gap-1.5 rounded-full bg-(--profile-mode-card-cta-bg) px-4 text-mid font-medium leading-none text-(--profile-mode-card-cta-fg) transition-opacity duration-subtle group-hover:opacity-90 group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-transparent';

/**
 * The card's primary CTA: a neutral high-contrast pill link. The visual face
 * is 28px; the full-width hit area is 44px. Form submits stay with the flow
 * that owns the form.
 */
export function ProfileModeCardAction({
  children,
  href,
  external,
  onClick,
  ariaLabel,
  dataTestId,
}: ProfileModeCardActionProps) {
  const face = <span className={ACTION_FACE_CLASS_NAME}>{children}</span>;

  if (href.startsWith('/')) {
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={onClick}
        aria-label={ariaLabel}
        className={ACTION_HIT_CLASS_NAME}
        data-testid={dataTestId}
      >
        {face}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={ACTION_HIT_CLASS_NAME}
      data-testid={dataTestId}
    >
      {face}
    </a>
  );
}
