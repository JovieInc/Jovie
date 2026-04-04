'use client';

import { X } from 'lucide-react';
import { Drawer } from 'vaul';
import { DRAWER_OVERLAY_CLASS } from '@/features/profile/drawer-overlay-styles';

interface ProfileDrawerShellProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
  readonly contentClassName?: string;
  readonly bodyClassName?: string;
  readonly dataTestId?: string;
}

export function ProfileDrawerShell({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  contentClassName,
  bodyClassName,
  dataTestId,
}: ProfileDrawerShellProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className={DRAWER_OVERLAY_CLASS} />
        <Drawer.Content
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] w-full max-w-full flex-col overflow-hidden rounded-t-[28px] border-t text-primary-token ${contentClassName ?? ''}`}
          style={{
            background: 'var(--liquid-glass-bg)',
            backdropFilter: 'blur(var(--liquid-glass-blur-intense))',
            WebkitBackdropFilter: 'blur(var(--liquid-glass-blur-intense))',
            borderColor: 'var(--liquid-glass-border)',
            boxShadow: 'var(--liquid-glass-shadow-elevated)',
          }}
          data-testid={dataTestId}
          aria-describedby={undefined}
        >
          <div
            className='pointer-events-none absolute inset-0 rounded-t-[28px] opacity-50'
            style={{
              background: 'var(--liquid-glass-highlight)',
              mixBlendMode: 'plus-lighter',
            }}
          />
          <div className='pointer-events-none absolute inset-x-0 top-0 h-px bg-white/16' />

          <div className='relative z-10 flex items-start justify-between gap-4 px-5 pb-3 pt-3 md:px-6'>
            <div className='flex-1'>
              <div className='mx-auto h-1.5 w-14 rounded-full bg-white/30' />
              <div className='pt-4 text-center'>
                <Drawer.Title className='text-[1.125rem] font-[590] tracking-[-0.03em] text-primary-token'>
                  {title}
                </Drawer.Title>
                {subtitle ? (
                  <p className='mt-1 text-sm text-secondary-token'>
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type='button'
              onClick={() => onOpenChange(false)}
              className='mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] text-secondary-token shadow-[var(--profile-pearl-shadow)] transition-[background-color,border-color,color] hover:bg-[var(--profile-pearl-bg-hover)] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
              aria-label='Close'
            >
              <X className='h-4 w-4' />
            </button>
          </div>

          <div
            className={`relative z-10 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-6 ${bodyClassName ?? ''}`}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
