'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDown, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_CINEMATIC = 420;

/**
 * InstallBanner — slim sidebar announcement card with title + description +
 * primary CTA + dismiss. Slides open/closed by collapsing `max-height` and
 * fading opacity on the cinematic shell curve, so toggling is symmetric.
 *
 * Pure presentational. Caller owns the `open` flag and the dismiss callback.
 * Defaults reproduce shell-v1's "Get Jovie for desktop" copy; consumers
 * override `title` / `description` / `cta` to surface different prompts
 * (try voice mode, claim handle, etc).
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(true);
 * <InstallBanner
 *   open={open}
 *   onDismiss={() => setOpen(false)}
 *   onCta={() => router.push('/install')}
 * />
 * ```
 */
export function InstallBanner({
  open,
  onDismiss,
  icon: Icon = Sparkles,
  title = 'Get Jovie for desktop',
  description = 'Push-to-talk in any app, native shortcuts.',
  ctaLabel = 'Install',
  ctaIcon: CtaIcon = ArrowDown,
  onCta,
  ctaDisabled = false,
  iconClassName,
  className,
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly icon?: LucideIcon;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly ctaLabel?: ReactNode;
  readonly ctaIcon?: LucideIcon | null;
  readonly onCta?: () => void;
  readonly ctaDisabled?: boolean;
  readonly iconClassName?: string;
  readonly className?: string;
}) {
  return (
    <div
      aria-hidden={!open}
      className={cn('shrink-0 overflow-hidden px-2', className)}
      style={{
        maxHeight: open ? 140 : 0,
        opacity: open ? 1 : 0,
        transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
      }}
    >
      <div className='relative rounded-xl border border-(--linear-app-shell-border) bg-(--surface-1)/60 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_18px_rgba(0,0,0,0.28)] px-3 pt-3 pb-3 mb-2'>
        <button
          type='button'
          onClick={onDismiss}
          aria-label='Dismiss prompt'
          className='absolute top-1.5 right-1.5 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-subtle ease-out'
        >
          <X className='h-3 w-3' strokeWidth={2.25} />
        </button>
        <div className='flex items-center gap-1.5 mb-1 pr-5'>
          <Icon
            className={cn(
              'h-3 w-3 shrink-0',
              iconClassName ?? 'text-cyan-300/85'
            )}
            strokeWidth={2.25}
          />
          <span className='text-[12px] font-medium text-primary-token'>
            {title}
          </span>
        </div>
        <p className='text-[11px] text-tertiary-token leading-snug mb-2.5'>
          {description}
        </p>
        <button
          type='button'
          onClick={onCta}
          disabled={ctaDisabled}
          className='w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-full text-[12px] font-medium bg-white text-black hover:brightness-110 transition-[filter,background-color,color] duration-subtle ease-out disabled:cursor-not-allowed disabled:opacity-60'
        >
          {ctaLabel}
          {CtaIcon ? <CtaIcon className='h-3 w-3' strokeWidth={2.5} /> : null}
        </button>
      </div>
    </div>
  );
}
