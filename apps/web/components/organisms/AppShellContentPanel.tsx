import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';

export interface AppShellContentPanelProps
  extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
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
  wide: 'max-w-(--app-shell-content-max-wide)',
  reading: 'max-w-(--app-shell-content-max-reading)',
  form: 'max-w-(--app-shell-content-max-form)',
} as const;

const PANEL_OUTER_INSET_CLASSNAME = 'px-2.5 py-2.5 sm:px-3 sm:py-3';

const PANEL_CONTENT_PADDING_CLASSNAME = {
  none: '',
  compact: 'px-3 py-3 sm:px-3.5 sm:py-3.5',
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
  ...sectionProps
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
      {...sectionProps}
    >
      <div
        className={cn(
          'mx-auto flex min-h-0 w-full flex-1 flex-col',
          PANEL_MAX_WIDTH_CLASSNAME[maxWidth],
          PANEL_OUTER_INSET_CLASSNAME,
          panelScrollClassName,
          surfaceClassName
        )}
      >
        {toolbar ? <div className='shrink-0'>{toolbar}</div> : null}
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
    </section>
  );
}
