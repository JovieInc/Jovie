import 'server-only';

import { notFound } from 'next/navigation';
import { isExplicitDevelopmentEnvironment } from '@/lib/security/development-only';

interface RequireDevelopmentOnlyPageOptions {
  readonly allowLocalDevelopmentAutomation?: boolean;
}

/** Server component/layout guard for dev-only pages. */
export function requireDevelopmentOnlyPage(
  options: RequireDevelopmentOnlyPageOptions = {}
): void {
  if (
    !isExplicitDevelopmentEnvironment() &&
    options.allowLocalDevelopmentAutomation !== true
  ) {
    notFound();
  }
}
