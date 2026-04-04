import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { cn } from '@/lib/utils';

export const PAGE_SHELL_SURFACE_CLASSNAMES = {
  workspace:
    'rounded-[22px] border border-[color-mix(in_oklab,var(--linear-app-shell-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-surface))] shadow-none',
  document:
    'rounded-[24px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_76%,transparent)] bg-[color-mix(in_oklab,var(--linear-surface-elevated)_88%,var(--linear-surface))] shadow-none',
  inspector:
    'rounded-[18px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_86%,var(--linear-surface))] shadow-none',
  emptyState:
    'rounded-[24px] border border-dashed border-[color-mix(in_oklab,var(--linear-app-shell-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_76%,transparent)] shadow-none',
  toolbarRail:
    'rounded-[14px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_90%,transparent)] shadow-none',
  metaRow:
    'rounded-full border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_74%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_88%,transparent)] shadow-none',
} as const;

export interface PageShellProps {
  readonly children: ReactNode;
  readonly toolbar?: ReactNode;
  readonly maxWidth?: 'full' | 'wide' | 'reading' | 'form';
  readonly frame?: 'none' | 'content-container';
  readonly contentPadding?: 'none' | 'compact' | 'default';
  readonly scroll?: 'panel' | 'page';
  readonly className?: string;
  readonly surfaceClassName?: string;
  readonly contentClassName?: string;
  readonly 'data-testid'?: string;
}

/**
 * PageShell - Standardized page container with rounded corners
 *
 * Provides consistent layout structure across all dashboard and admin pages:
 * - Rounded corners (8px radius)
 * - Proper background surface
 * - Full height with overflow handling
 * - Optional outer padding
 *
 * Usage Pattern:
 * ```tsx
 * <PageShell>
 *   <PageHeader title="Page Title" />
 *   <div className="flex-1 min-h-0 overflow-auto">
 *     {content}
 *   </div>
 * </PageShell>
 * ```
 *
 * @example
 * ```tsx
 * export default function MyPage() {
 *   return (
 *     <PageShell>
 *       <PageHeader
 *         title="My Page"
 *         action={<Button>Action</Button>}
 *       />
 *       <div className="flex-1 min-h-0 p-6">
 *         Page content here
 *       </div>
 *     </PageShell>
 *   );
 * }
 * ```
 */
export function PageShell({
  children,
  toolbar,
  maxWidth = 'full',
  frame = 'none',
  contentPadding = 'none',
  scroll = 'panel',
  className,
  surfaceClassName,
  contentClassName,
  'data-testid': testId,
}: PageShellProps) {
  return (
    <AppShellContentPanel
      toolbar={toolbar}
      maxWidth={maxWidth}
      frame={frame}
      contentPadding={contentPadding}
      scroll={scroll}
      className={className}
      surfaceClassName={surfaceClassName}
      contentClassName={contentClassName}
      data-testid={testId}
    >
      {children}
    </AppShellContentPanel>
  );
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly breadcrumbs?: ReactNode;
  /** Mobile sidebar trigger for dashboard pages */
  readonly mobileSidebarTrigger?: ReactNode;
  /** Desktop sidebar trigger for dashboard pages */
  readonly sidebarTrigger?: ReactNode;
  readonly className?: string;
}

/**
 * PageHeader - Standardized page header component
 *
 * Provides consistent header structure:
 * - Fixed height: 56px (h-14)
 * - Responsive padding: px-4 sm:px-6
 * - Bottom border
 * - Flexbox layout for title and actions
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Waitlist"
 *   description="Manage creator signups"
 *   action={
 *     <Button>
 *       <Plus className="h-4 w-4" />
 *       Add Creator
 *     </Button>
 *   }
 * />
 * ```
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
  mobileSidebarTrigger,
  sidebarTrigger,
  className,
}: PageHeaderProps) {
  return (
    <ContentSectionHeader
      title={
        <span className='flex min-w-0 items-center gap-2 sm:gap-3'>
          {mobileSidebarTrigger}
          {breadcrumbs}
          <span className='min-w-0 flex-1 truncate'>{title}</span>
          {sidebarTrigger}
        </span>
      }
      subtitle={
        description ? (
          <span className='max-sm:hidden truncate'>{description}</span>
        ) : undefined
      }
      actions={action}
      variant='plain'
      density='compact'
      actionsClassName='flex shrink-0 items-center gap-(--linear-app-toolbar-gap)'
      className={className}
      bodyClassName='min-w-0'
    />
  );
}

export interface PageContentProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** If true, removes default padding */
  readonly noPadding?: boolean;
}

/**
 * PageContent - Standardized scrollable content area
 *
 * Provides consistent content container:
 * - Fills remaining vertical space (flex-1)
 * - Proper overflow handling (min-h-0 overflow-auto)
 * - Optional padding (default: p-6)
 *
 * @example
 * ```tsx
 * <PageContent>
 *   <p>Your content here</p>
 * </PageContent>
 * ```
 *
 * @example Table without padding
 * ```tsx
 * <PageContent noPadding>
 *   <Table data={data} columns={columns} />
 * </PageContent>
 * ```
 */
export function PageContent({
  children,
  className,
  noPadding = false,
}: PageContentProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 min-w-0 overflow-auto overflow-x-hidden',
        !noPadding &&
          'px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)',
        className
      )}
    >
      {children}
    </div>
  );
}
