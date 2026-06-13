import 'server-only';

import { notFound } from 'next/navigation';
import { isExplicitDevelopmentEnvironment } from '@/lib/security/development-only';

/** Server component/layout guard for dev-only pages. */
export function requireDevelopmentOnlyPage(): void {
  if (!isExplicitDevelopmentEnvironment()) {
    notFound();
  }
}
