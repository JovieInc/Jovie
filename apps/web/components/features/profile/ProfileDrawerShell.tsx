'use client';

import { ChevronLeft, X } from 'lucide-react';
import { Drawer } from 'vaul';
import { useDrawerContainer } from '@/features/profile/DrawerContainerContext';
import { cn } from '@/lib/utils';

interface ProfileDrawerShellProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly children: React.ReactNode;
  /** When provided, the drawer portals into this element and uses absolute positioning (for desktop card containment) */
  readonly container?: HTMLElement | null;
  /** @deprecated Prefer uniform styling. Only use for edge cases. */
  readonly contentClassName?: string;
  /** @deprecated Prefer uniform styling. Only use for edge cases. */
  readonly bodyClassName?: string;
  readonly dataTestId?: string;
}

const OVERLAY_BASE = 'inset-0 z-40 bg-black/60 backdrop-blur-sm';
const WRAPPER_BASE = 'inset-x-0 bottom-0 z-50 flex justify-center';

export function ProfileDrawerShell({
  open,
  onOpenChange,
  title,
  subtitle,
  onBack,
  children,
  container,
  contentClassName,
  bodyClassName,
  dataTestId,
}: ProfileDrawerShellProps) {
  const contextContainer = useDrawerContainer();
  const resolvedContainer = container ?? contextContainer;
  const useContained = Boolean(resolvedContainer);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal container={resolvedContainer ?? undefined}>
        <Drawer.Overlay
          className={cn(OVERLAY_BASE, useContained ? 'absolute' : 'fixed')}
        />
        <div className={cn(WRAPPER_BASE, useContained ? 'absolute' : 'fixed')}>
          <Drawer.Content
            className={`flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-[24px] border-t border-white/[0.08] bg-[color:var(--profile-drawer-bg)] text-primary-token shadow-[0_-8px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl md:max-w-[430px] md:rounded-t-[20px] ${contentClassName ?? ''}`}
            data-testid={dataTestId}
            aria-describedby={undefined}
          >
            {/* Highlight line */}
            <div className='pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.1]' />

            {/* Header */}
            <div className='relative z-10 flex shrink-0 items-start gap-3 px-5 pb-4 pt-3'>
              {/* Drag handle */}
              <div className='absolute inset-x-0 top-3 flex justify-center'>
                <div className='h-[5px] w-9 rounded-full bg-white/[0.16]' />
              </div>

              {/* Back button — optional */}
              {onBack ? (
                <button
                  type='button'
                  onClick={onBack}
                  className='mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-white/50 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                  aria-label='Back'
                >
                  <ChevronLeft className='h-3.5 w-3.5' />
                </button>
              ) : null}

              {/* Title block — left-aligned */}
              <div className='min-w-0 flex-1 pt-5'>
                <Drawer.Title className='text-[15px] font-[590] tracking-[-0.01em] text-primary-token'>
                  {title}
                </Drawer.Title>
                {subtitle ? (
                  <p className='mt-0.5 text-[12px] leading-[1.4] text-white/45'>
                    {subtitle}
                  </p>
                ) : null}
              </div>

              {/* Close */}
              <button
                type='button'
                onClick={() => onOpenChange(false)}
                className='mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-white/50 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                aria-label='Close'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            </div>

            {/* Separator */}
            <div className='mx-5 h-px bg-white/[0.06]' />

            {/* Body */}
            <div
              className={`relative z-10 min-h-[200px] overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 ${bodyClassName ?? ''}`}
            >
              {children}
            </div>
          </Drawer.Content>
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
