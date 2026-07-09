import { isValidElement, type ReactNode } from 'react';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import AuthSlotDefault from './default';

/**
 * Layout for the `@auth` parallel slot (Clerk → Better Auth migration,
 * client-flip commit ⑦).
 *
 * Under Clerk this layout resolved the publishable key and rendered an
 * `AuthUnavailableCard` when Clerk was misconfigured. Under Better Auth
 * there is no provider to mount and no publishable key to resolve —
 * `AuthClientProviders` mounts `JovieAuthValuesProvider` (aliased as
 * `ClerkSafeValuesProvider`) and the intercepted modal renders its own
 * auth surface.
 *
 * We intentionally do NOT use `export const dynamic = 'force-dynamic'` here —
 * this layout renders on every route including static marketing pages, and
 * force-dynamic would cause per-request nonce headers to be emitted for those
 * routes, violating the static-marketing rule (.claude/rules/ui.md, JOV-2040).
 *
 * We intentionally do NOT wrap in `<main>` here — the intercepted modal is
 * positioned over the page's existing `<main>`, and an extra landmark would
 * confuse a11y.
 */
function isInactiveAuthSlot(children: ReactNode): boolean {
  if (children == null || children === false) {
    return true;
  }

  // Next renders `default.tsx` as a component node (truthy), not literal `null`.
  // Treat that fallback the same as an empty slot so ISR routes never call
  // headers() from this layout.
  return isValidElement(children) && children.type === AuthSlotDefault;
}

export default async function AuthSlotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Default @auth slot is null on ISR/marketing/profile routes. Skip entirely
  // so we never call headers() on statically generated pages.
  if (isInactiveAuthSlot(children)) {
    return null;
  }

  return <AuthClientProviders>{children}</AuthClientProviders>;
}
