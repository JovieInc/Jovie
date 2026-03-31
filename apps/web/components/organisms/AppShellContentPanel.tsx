import type { ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';

export interface AppShellContentPanelProps {
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
  readonly maxWidth?: 'full' | 'wide' | 'reading' | 'form';
  readonly frame?: 'none' | 'content-container';
  readonly contentPadding?: 'none' | 'compact' | 'default';
  readonly scroll?: 'panel' | 'page';
  readonly className?: string;
  readonly surfaceClassName?: string;
  readonly contentClassName?: string;
  readonly 'data-testid'?: string;
}

const PANEL_MAX_WIDTH_CLASSNAME = {
  full: 'max-w-none',
  wide: 'max-w-[88rem]',
  reading: 'max-w-[56rem]',
  form: 'max-w-[52rem]',
} as const;

const PANEL_OUTER_INSET_CLASSNAME = {
  'content-container': 'px-3 py-3 sm:px-4 sm:py-4 lg:px-5',
  none: 'px-4 py-4 sm:px-5 sm:py-5 lg:px-6',
} as const;

const PANEL_CONTENT_PADDING_CLASSNAME = {
  none: '',
  compact: 'px-3 py-3 sm:px-4 sm:py-4',
  default:
    'px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)',
} as const;

export function AppShellContentPanel({
  toolbar,
  children,
  maxWidth = 'full',
  frame = 'content-container',
  contentPadding = 'default',
  scroll = 'panel',
  className,
  surfaceClassName,
  contentClassName,
  'data-testid': testId,
}: Readonly<AppShellContentPanelProps>) {
  const panelScrollClassName =
    scroll === 'panel' ? 'min-h-0 overflow-hidden' : 'overflow-visible';

  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col text-primary-token',
        panelScrollClassName,
        className
      )}
      data-testid={testId}
    >
      {toolbar ? <div className='shrink-0'>{toolbar}</div> : null}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          panelScrollClassName,
          surfaceClassName
        )}
      >
        <div
          className={cn(
            'mx-auto flex min-h-0 w-full flex-1 flex-col',
            PANEL_MAX_WIDTH_CLASSNAME[maxWidth],
            PANEL_OUTER_INSET_CLASSNAME[frame]
          )}
        >
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              frame === 'content-container' &&
                cn(LINEAR_SURFACE.contentContainer, 'overflow-hidden')
            )}
          >
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col',
                panelScrollClassName,
                PANEL_CONTENT_PADDING_CLASSNAME[contentPadding],
                contentClassName
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
