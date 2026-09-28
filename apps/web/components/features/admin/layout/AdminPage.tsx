import { Activity } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  type WorkspaceTabOption,
  WorkspaceTabsSurface,
} from '@/components/organisms/WorkspaceTabsSurface';
import { APP_ROUTES } from '@/constants/routes';
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
 * - Description + actions only when needed. Route title lives in the shell
 *   breadcrumb (`DashboardHeader`) — never re-rendered here (avoids the
 *   double-"Ops" regression class).
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
  // Breadcrumb owns the page title; only surface description + actions here.
  const showMetaHeader = true;

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
          {showMetaHeader ? (
            <div
              className='flex min-w-0 items-start justify-between gap-2'
              data-testid='admin-page-meta'
            >
              {description ? (
                <p className='min-w-0 flex-1 text-2xs leading-[15px] text-tertiary-token'>
                  {description}
                </p>
              ) : (
                <span className='min-w-0 flex-1' aria-hidden='true' />
              )}
              {actions ? (
                <div className='ml-auto flex shrink-0 items-center justify-end gap-1'>
                  {actions}
                </div>
              ) : null}
              <Link
                href={APP_ROUTES.ADMIN_ACTIVITY}
                className='inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-2xs font-medium text-secondary-token transition-colors hover:text-primary-token'
                aria-label='Open Company Timeline'
              >
                <Activity className='h-3.5 w-3.5' aria-hidden='true' />
                Timeline
              </Link>
            </div>
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
