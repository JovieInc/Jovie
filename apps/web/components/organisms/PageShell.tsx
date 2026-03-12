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
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden overflow-x-hidden bg-transparent text-(--linear-text-primary)',
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
        'flex min-h-[var(--linear-app-header-height)] shrink-0 items-center justify-between gap-3 border-b border-(--linear-border-subtle) bg-transparent px-[var(--linear-app-header-padding-x)] py-1.5',
        className
      )}
    >
      <div className='flex min-w-0 items-center gap-2 sm:gap-3'>
        {mobileSidebarTrigger}
        {breadcrumbs}
        <div className='min-w-0 flex-1'>
          <h1 className='truncate text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
            {title}
          </h1>
          {description && (
            <p className='hidden truncate text-[12px] leading-[18px] text-(--linear-text-secondary) sm:block'>
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
        'flex-1 min-h-0 min-w-0 overflow-auto overflow-x-hidden',
        !noPadding &&
          'px-[var(--linear-app-content-padding-x)] py-[var(--linear-app-content-padding-y)]',
        className
      )}
    >
      {children}
    </div>
  );
}
