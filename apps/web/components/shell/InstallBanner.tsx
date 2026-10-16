'use client';

import { Button, IconButton } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * InstallBanner — slim sidebar announcement card with title + description +
 * primary CTA + dismiss. Slides open/closed by collapsing `max-height` and
 * fading opacity on the normal shell curve, so toggling is symmetric.
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
      inert={!open || undefined}
      className={cn('shrink-0 overflow-hidden', className)}
      style={{
        maxHeight: open ? 140 : 0,
        opacity: open ? 1 : 0,
        transition:
          'max-height var(--duration-normal) var(--ease-out), opacity var(--duration-normal) var(--ease-out)',
      }}
    >
      <div className='relative rounded-md border border-subtle bg-sidebar p-2'>
        <IconButton
          size='sm'
          onClick={onDismiss}
          ariaLabel='Dismiss Prompt'
          className='absolute right-1 top-1'
        >
          <X className='h-3 w-3' strokeWidth={2.25} />
        </IconButton>
        <div className='flex items-center gap-1.5 mb-1 pr-7'>
          <Icon
            className={cn(
              'h-3 w-3 shrink-0',
              iconClassName ?? 'text-secondary-token'
            )}
            strokeWidth={2.25}
          />
          <span className='text-xs font-medium text-primary-token'>
            {title}
          </span>
        </div>
        <p className='text-2xs text-tertiary-token leading-snug mb-2.5'>
          {description}
        </p>
        <Button
          size='sm'
          variant='secondary'
          onClick={onCta}
          disabled={ctaDisabled}
          className='w-full'
        >
          {ctaLabel}
          {CtaIcon ? <CtaIcon className='h-3 w-3' strokeWidth={2.5} /> : null}
        </Button>
      </div>
    </div>
  );
}
