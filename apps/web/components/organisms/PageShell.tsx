import { cn } from '@/lib/utils';

export interface PageShellProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  /** If true, removes the outer padding (useful when parent already has padding) */
  readonly noPadding?: boolean;
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
  className,
  noPadding = false,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'bg-surface-1 shadow-sm h-full overflow-hidden flex flex-col',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly breadcrumbs?: React.ReactNode;
  /** Mobile sidebar trigger for dashboard pages */
  readonly mobileSidebarTrigger?: React.ReactNode;
  /** Desktop sidebar trigger for dashboard pages */
  readonly sidebarTrigger?: React.ReactNode;
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
    <header
      className={cn(
        'h-14 shrink-0 border-b border-subtle px-4 sm:px-6',
        'flex items-center justify-between gap-4',
        className
      )}
    >
      <div className='flex items-center gap-3 min-w-0'>
        {mobileSidebarTrigger}
        {breadcrumbs}
        <div className='min-w-0'>
          <h1 className='text-sm font-semibold text-primary-token truncate'>
            {title}
          </h1>
          {description && (
            <p className='text-xs text-secondary-token truncate'>
              {description}
            </p>
          )}
        </div>
        {sidebarTrigger}
      </div>
      {action && <div className='shrink-0'>{action}</div>}
    </header>
  );
}

export interface PageContentProps {
  readonly children: React.ReactNode;
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
        'flex-1 min-h-0 overflow-auto',
        !noPadding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
