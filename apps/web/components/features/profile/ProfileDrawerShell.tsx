'use client';

import { ChevronLeft } from 'lucide-react';
import { useId } from 'react';
import { Drawer } from 'vaul';
import type { ProfileSurfacePresentation } from '@/features/profile/contracts';

type ProfileDrawerNavigationLevel = 'root' | 'secondary';

interface ProfileDrawerShellProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly navigationLevel?: ProfileDrawerNavigationLevel;
  readonly children: React.ReactNode;
  /** @deprecated Prefer uniform styling. Only use for edge cases. */
  readonly contentClassName?: string;
  /** @deprecated Prefer uniform styling. Only use for edge cases. */
  readonly bodyClassName?: string;
  readonly dataTestId?: string;
  readonly presentation?: ProfileSurfacePresentation;
}

export function ProfileDrawerShell({
  open,
  onOpenChange,
  title,
  subtitle,
  onBack,
  navigationLevel = 'root',
  children,
  contentClassName,
  bodyClassName,
  dataTestId,
  presentation = 'standalone',
}: ProfileDrawerShellProps) {
  const titleId = useId();
  const subtitleId = useId();
  const accessibleDescriptionId = useId();
  const accessibleDescription = subtitle ?? 'Profile menu and actions.';
  const showBackButton = navigationLevel === 'secondary' && Boolean(onBack);
  // Shell height is a single `min(fixed, viewport%)` envelope so the body's
  // min-height can never exceed the shell's max-height on short viewports.
  // --profile-drawer-height-max caps the sheet; the body's min-height is a
  // derived `calc()` that subtracts the header so the layout stays stable
  // across view swaps without clipping tall views.
  const drawerHeightStyle = {
    ['--profile-drawer-height-max' as string]: 'min(86dvh, 720px)',
    ['--profile-drawer-header' as string]: '72px',
  } as React.CSSProperties;
  const contentClasses = `relative flex max-h-[var(--profile-drawer-height-max)] w-full flex-col overflow-hidden rounded-t-[var(--profile-drawer-radius-mobile)] border-t border-white/[0.08] bg-[color:var(--profile-drawer-bg)] text-primary-token shadow-[0_-8px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl md:max-w-(--profile-shell-max-width) md:rounded-t-[var(--profile-drawer-radius-desktop)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent)] ${contentClassName ?? ''}`;
  const bodyClasses = `relative z-10 min-h-[calc(var(--profile-drawer-height-max)_-_var(--profile-drawer-header))] overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] pt-3 ${bodyClassName ?? ''}`;

  const header = (
    <>
      <div className='pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.1]' />

      <div className='relative z-10 shrink-0 px-5 pb-2.5 pt-3'>
        <div className='absolute inset-x-0 top-3 flex justify-center'>
          <div className='h-[5px] w-10 rounded-full bg-white/[0.22]' />
        </div>

        <div className='grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2.5 pt-5'>
          {showBackButton ? (
            <button
              type='button'
              onClick={onBack}
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-white/44 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
              aria-label='Back'
              data-testid='profile-drawer-back-button'
            >
              <ChevronLeft className='h-3.5 w-3.5' />
            </button>
          ) : (
            <span
              aria-hidden='true'
              className='block h-8 w-8 shrink-0'
              data-testid='profile-drawer-back-placeholder'
            />
          )}

          <div
            className='min-h-[2.625rem] min-w-0 py-px'
            data-testid='profile-drawer-title-slot'
          >
            <h2
              id={titleId}
              className='truncate text-[15px] font-[590] leading-[1.08] tracking-[-0.018em] text-primary-token'
            >
              {title}
            </h2>
            <div className='mt-0.5 min-h-[0.9rem]'>
              {subtitle ? (
                <p
                  id={subtitleId}
                  className='truncate text-3xs font-[440] leading-[1.1] tracking-[-0.01em] text-white/46'
                >
                  {subtitle}
                </p>
              ) : (
                <span
                  aria-hidden='true'
                  className='block h-[0.9rem] w-full'
                  data-testid='profile-drawer-subtitle-placeholder'
                />
              )}
            </div>
          </div>

          <span
            aria-hidden='true'
            className='block h-8 w-8 shrink-0'
            data-testid='profile-drawer-right-placeholder'
          />
        </div>
      </div>

      <div className='mx-5 h-px bg-white/[0.06]' />
    </>
  );

  const body = <div className={bodyClasses}>{children}</div>;

  if (presentation === 'embedded') {
    if (!open) {
      return null;
    }

    return (
      <>
        <button
          type='button'
          aria-label='Close drawer overlay'
          className='fixed inset-0 z-10 bg-black/48 backdrop-blur-sm'
          onClick={() => onOpenChange(false)}
        />
        <div
          className='absolute inset-x-0 bottom-0 z-20'
          data-testid={dataTestId}
          role='dialog'
          aria-describedby={accessibleDescriptionId}
          aria-labelledby={titleId}
          style={drawerHeightStyle}
        >
          <div
            className={`relative flex max-h-[var(--profile-drawer-height-max)] w-full flex-col overflow-hidden rounded-t-[var(--profile-drawer-radius-desktop)] border-t border-white/[0.08] bg-[color:var(--profile-drawer-bg)] text-primary-token shadow-[0_-16px_52px_rgba(0,0,0,0.5)] backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent)] ${contentClassName ?? ''}`}
          >
            <span id={accessibleDescriptionId} className='sr-only'>
              {accessibleDescription}
            </span>
            {header}
            {body}
          </div>
        </div>
      </>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className='fixed inset-0 z-40 bg-black/60 backdrop-blur-sm' />
        <div className='fixed inset-x-0 bottom-0 z-50 flex justify-center'>
          <Drawer.Content
            className={contentClasses}
            style={drawerHeightStyle}
            data-testid={dataTestId}
            aria-labelledby={titleId}
            aria-describedby={accessibleDescriptionId}
          >
            <Drawer.Title asChild>
              <span className='sr-only'>{title}</span>
            </Drawer.Title>
            <Drawer.Description asChild>
              <span id={accessibleDescriptionId} className='sr-only'>
                {accessibleDescription}
              </span>
            </Drawer.Description>
            {header}
            {body}
          </Drawer.Content>
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
