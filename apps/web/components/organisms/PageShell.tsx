import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { cn } from '@/lib/utils';

export interface PageShellProps
  extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
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
  ...sectionProps
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
      {...sectionProps}
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
  readonly titleClassName?: string;
  readonly subtitleClassName?: string;
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
  titleClassName,
  subtitleClassName,
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
      titleClassName={titleClassName}
      subtitleClassName={subtitleClassName}
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
