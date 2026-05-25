import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
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
 * Replaces the legacy `AdminToolPage` (header-in-card) and `AdminWorkspacePage`
 * (always-on tabs) wrappers. Provides:
 * - Flat page header (title + description + actions), no `ContentSurfaceCard`
 *   wrapper — the route already lives inside the dashboard shell.
 * - Optional `hero` slot directly under the header for primary metrics.
 * - Optional `tabs` slot that delegates to `WorkspaceTabsSurface`. The parent
 *   header owns the route title/description, so the tabs surface renders
 *   headerless to avoid duplicate page titles.
 * - `space-y-6` outer rhythm matching the canonical dashboard.
 *
 * Use this for new admin pages. Existing pages can migrate incrementally — the
 * legacy `AdminToolPage`/`AdminWorkspacePage` wrappers re-export this shell.
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
    <PageShell>
      <PageContent noPadding>
        <div
          className={cn(
            'space-y-6 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)',
            className
          )}
          data-testid={testId}
        >
          <ContentSectionHeader
            title={title}
            subtitle={description}
            actions={actions}
            variant='plain'
            density='compact'
            className='min-h-0'
            actionsClassName='shrink-0'
          />

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
