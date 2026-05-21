import type { ReactNode } from 'react';
import { AdminPage } from './AdminPage';

interface AdminToolPageProps {
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly testId: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * @deprecated Use `AdminPage` from `@/components/features/admin/layout/AdminPage` instead.
 *
 * `AdminToolPage` is preserved as a thin shim so the 17+ existing admin pages
 * continue to render while they migrate. New code MUST import `AdminPage`
 * directly. The deprecation ratchet
 * (`apps/web/tests/unit/admin-shell-deprecation.test.ts`) enforces that the
 * importer count of this module only decreases.
 */
export function AdminToolPage({
  title,
  description,
  actions,
  testId,
  children,
  className,
}: AdminToolPageProps) {
  return (
    <AdminPage
      title={title ?? ''}
      description={description}
      actions={actions}
      testId={testId}
      className={className}
    >
      {children}
    </AdminPage>
  );
}
