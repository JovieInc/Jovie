import type { ReactNode } from 'react';
import type { WorkspaceTabOption } from '@/components/organisms/WorkspaceTabsSurface';
import { AdminPage } from './AdminPage';

interface AdminWorkspacePageProps<
  TPrimary extends string,
  TSecondary extends string = never,
> {
  readonly title: string;
  readonly description: string;
  readonly primaryParam: string;
  readonly primaryValue: TPrimary;
  readonly primaryOptions: readonly WorkspaceTabOption<TPrimary>[];
  readonly secondaryParam?: string;
  readonly secondaryValue?: TSecondary | null;
  readonly secondaryOptions?: readonly WorkspaceTabOption<TSecondary>[];
  readonly clearOnPrimaryChange?: readonly string[];
  readonly actions?: ReactNode;
  readonly testId: string;
  readonly viewTestId?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * @deprecated Use `AdminPage` from `@/components/features/admin/layout/AdminPage`
 * with the `tabs` prop instead.
 *
 * Preserved as a thin shim so the 4+ existing tabbed admin pages continue to
 * render while they migrate. New code MUST import `AdminPage` directly. The
 * deprecation ratchet
 * (`apps/web/tests/unit/admin-shell-deprecation.test.ts`) enforces that the
 * importer count of this module only decreases.
 */
export function AdminWorkspacePage<
  TPrimary extends string,
  TSecondary extends string = never,
>({
  title,
  description,
  primaryParam,
  primaryValue,
  primaryOptions,
  secondaryParam,
  secondaryValue,
  secondaryOptions,
  clearOnPrimaryChange,
  actions,
  testId,
  viewTestId,
  children,
  className,
}: Readonly<AdminWorkspacePageProps<TPrimary, TSecondary>>) {
  return (
    <AdminPage<TPrimary, TSecondary>
      title={title}
      description={description}
      actions={actions}
      testId={testId}
      viewTestId={viewTestId}
      className={className}
      tabs={{
        param: primaryParam,
        value: primaryValue,
        options: primaryOptions,
        secondaryParam,
        secondaryValue,
        secondaryOptions,
        clearOnPrimaryChange,
      }}
    >
      {children}
    </AdminPage>
  );
}
