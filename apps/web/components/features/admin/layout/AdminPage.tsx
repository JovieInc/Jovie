import type { ReactNode } from 'react';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { PageToolbar } from '@/components/organisms/table/molecules/PageToolbar';
import {
  type WorkspaceTabOption,
  WorkspaceTabsSurface,
} from '@/components/organisms/WorkspaceTabsSurface';
import type { AdminViewGroupId } from '@/constants/admin-navigation';
import { cn } from '@/lib/utils';
import { AdminQueryTabsSelect } from './AdminQueryTabsSelect';
import { AdminRouteViews } from './AdminRouteViews';

export interface AdminPageTabsConfig<
  TPrimary extends string,
  TSecondary extends string = never,
> {
  readonly param: string;
  readonly value: TPrimary;
  readonly options: readonly WorkspaceTabOption<TPrimary>[];
  readonly secondaryParam?: string;
  readonly secondaryValue?: TSecondary | null;
  readonly secondaryOptions?: readonly WorkspaceTabOption<TSecondary>[];
  readonly clearOnPrimaryChange?: readonly string[];
}

export interface AdminPageProps<
  TPrimary extends string = string,
  TSecondary extends string = never,
> {
  /**
   * Route title. Used for tab aria labels and as a semantic page name for
   * callers — **not** rendered as a visible page heading. The shell
   * `DashboardHeader` breadcrumb is the single visible title source (JOV-3527).
   */
  readonly title: string;
  /** Workspaces constrain task regions to the viewport; reports scroll as documents. */
  readonly layout?: 'workspace' | 'document';
  readonly description?: string;
  /**
   * Hero slot renders flush above the first section, no card wrapper. Use for
   * "default alive" metrics (MRR, paying customers, runway, etc.) that should
   * lead the page.
   */
  readonly hero?: ReactNode;
  /**
   * Query-param views inside this one destination (filters of the same
   * data). Separate routes use `views` instead. A page has one tab row:
   * when `views` is also set, these tabs render as a toolbar select.
   */
  readonly tabs?: AdminPageTabsConfig<TPrimary, TSecondary>;
  /**
   * Route views behind this page's sidebar destination (Shipping: Pipeline,
   * Product, Timeline). Rendered as the only tab row in the page toolbar.
   * Pages never render sub-navigation markup themselves.
   */
  readonly views?: AdminViewGroupId;
  readonly actions?: ReactNode;
  readonly testId: string;
  readonly viewTestId?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Canonical shell for every admin page.
 *
 * Provides:
 * - Route title lives in the shell breadcrumb (`DashboardHeader`) and actions
 *   live in the page toolbar. Descriptions remain metadata unless a page has
 *   a specific disclosure need.
 * - Optional `hero` slot for primary metrics.
 * - Optional `tabs` slot. Alone, it delegates to `WorkspaceTabsSurface`
 *   (headerless, because the shell breadcrumb owns the title). With `views`,
 *   the same tabs render as a `PageToolbarSelect` at the end of the toolbar
 *   so the page keeps one tab row.
 * - Explicit viewport workspace or scrolling document composition.
 */
export function AdminPage<
  TPrimary extends string = string,
  TSecondary extends string = never,
>({
  title,
  layout = 'document',
  description,
  hero,
  tabs,
  views,
  actions,
  testId,
  viewTestId,
  children,
  className,
}: Readonly<AdminPageProps<TPrimary, TSecondary>>) {
  const workspace = layout === 'workspace';
  const contentClassName = workspace
    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
    : 'space-y-4';
  const content = (
    <div className={contentClassName} data-testid={viewTestId}>
      {children}
    </div>
  );
  const queryTabsSelect =
    views && tabs ? (
      <AdminQueryTabsSelect
        param={tabs.param}
        value={tabs.value}
        options={tabs.options}
        clearOnChange={tabs.clearOnPrimaryChange}
      />
    ) : null;

  return (
    <AppShellContentPanel frame='none' contentPadding='none'>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-(--app-shell-content-padding-x) py-(--app-shell-content-padding-y)',
          workspace ? 'overflow-hidden' : 'overflow-auto',
          className
        )}
        data-testid={testId}
        data-admin-layout={layout}
      >
        {actions || views ? (
          <PageToolbar
            start={views ? <AdminRouteViews group={views} /> : null}
            end={
              queryTabsSelect || actions ? (
                <>
                  {queryTabsSelect}
                  {actions}
                </>
              ) : undefined
            }
            data-testid='admin-page-toolbar'
          />
        ) : null}

        {hero ? (
          <div className='shrink-0' data-testid='admin-page-hero'>
            {hero}
          </div>
        ) : null}

        {tabs && !views ? (
          <WorkspaceTabsSurface
            title={title}
            description={description ?? ''}
            primaryParam={tabs.param}
            primaryValue={tabs.value}
            primaryOptions={tabs.options}
            secondaryParam={tabs.secondaryParam}
            secondaryValue={tabs.secondaryValue}
            secondaryOptions={tabs.secondaryOptions}
            clearOnPrimaryChange={tabs.clearOnPrimaryChange}
            headerless
            layout={layout}
          >
            {content}
          </WorkspaceTabsSurface>
        ) : (
          content
        )}
      </div>
    </AppShellContentPanel>
  );
}
