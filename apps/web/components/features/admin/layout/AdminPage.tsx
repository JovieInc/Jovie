import type { ReactNode } from 'react';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table/molecules/PageToolbar';
import {
  type WorkspaceTabOption,
  WorkspaceTabsSurface,
} from '@/components/organisms/WorkspaceTabsSurface';
import { cn } from '@/lib/utils';

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
  readonly description?: string;
  /**
   * Hero slot renders flush above the first section, no card wrapper. Use for
   * "default alive" metrics (MRR, paying customers, runway, etc.) that should
   * lead the page.
   */
  readonly hero?: ReactNode;
  readonly tabs?: AdminPageTabsConfig<TPrimary, TSecondary>;
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
 * - Optional `tabs` slot that delegates to `WorkspaceTabsSurface`. The parent
 *   owns the route title in the shell breadcrumb, so the tabs surface renders
 *   headerless to avoid duplicate page titles.
 * - `space-y-6` outer rhythm matching the canonical dashboard.
 */
export function AdminPage<
  TPrimary extends string = string,
  TSecondary extends string = never,
>({
  title,
  description,
  hero,
  tabs,
  actions,
  testId,
  viewTestId,
  children,
  className,
}: Readonly<AdminPageProps<TPrimary, TSecondary>>) {
  const tabsHeaderless = Boolean(tabs);

  return (
    <PageShell frame='none' contentPadding='none'>
      <PageContent noPadding>
        <div
          className={cn(
            'space-y-6 px-(--app-shell-content-padding-x) py-(--app-shell-content-padding-y)',
            className
          )}
          data-testid={testId}
        >
          {actions ? (
            <PageToolbar
              start={null}
              end={actions}
              data-testid='admin-page-toolbar'
            />
          ) : null}

          {hero ? <div data-testid='admin-page-hero'>{hero}</div> : null}

          {tabs ? (
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
              headerless={tabsHeaderless}
            >
              <div className='space-y-4' data-testid={viewTestId}>
                {children}
              </div>
            </WorkspaceTabsSurface>
          ) : (
            <div className='space-y-4' data-testid={viewTestId}>
              {children}
            </div>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
