'use client';

/**
 * Shim over `@/hooks/useJovieAuth` (Clerk → Better Auth migration, client-flip
 * commit ⑦, plan decision 7). The Clerk-era export names
 * (`useUserSafe` / `useAuthSafe` / `useSessionSafe` / `useCanRenderClerkUi` /
 * `ClerkSafeValuesProvider` / `ClerkSafeDefaultsProvider`) are preserved as
 * aliases so the ~36 consumers don't churn. New code should import from
 * `@/hooks/useJovieAuth` directly.
 *
 * The `ClerkSafeBootstrapProvider` is intentionally NOT re-exported: under
 * Better Auth the dev bypass mints REAL `ba_sessions` rows + session cookies
 * (plan commit ⑨), so `authClient.useSession()` observes bypass sessions
 * through the standard cookie path and the bootstrap provider collapses
 * into the live values provider. See `useJovieAuth.tsx` for the rationale.
 *
 * Clerk's `UseUserReturn` / `UseAuthReturn` / `UseSessionReturn` types are
 * no longer re-exported; consumers should migrate to the JovieUser-shaped
 * types from `@/lib/auth/jovie-user` or the new return types in
 `useJovieAuth`. This shim intentionally drops the old type re-exports so
 * biome/tsc surfaces the remaining consumers that depended on them.
 */

import {
  JovieAuthDefaultsProvider,
  JovieAuthValuesProvider,
  useAuthSafe,
  useCanRenderAuthUi,
  useSessionSafe,
  useUserSafe,
} from '@/hooks/useJovieAuth';

export const ClerkSafeValuesProvider = JovieAuthValuesProvider;
export const ClerkSafeDefaultsProvider = JovieAuthDefaultsProvider;

export { useAuthSafe, useSessionSafe, useUserSafe };
export const useCanRenderClerkUi = useCanRenderAuthUi;
