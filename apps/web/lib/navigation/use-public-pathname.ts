'use client';

import { usePathname } from 'next/navigation';

/**
 * Next prerenders the static homepage under the internal route key "/index",
 * so server-side `usePathname()` returns "/index" while the browser hydrates
 * with "/". Any component that branches its markup on the pathname (provider
 * tree, header and footer CTAs, page-contract markers) then rendered
 * different HTML on the server than on the client: React #418 on every
 * homepage visit. Components that render on "/" must use this hook, not raw
 * `usePathname()`; `tests/unit/navigation/public-pathname-guard.test.ts`
 * enforces it.
 */
export function normalizePrerenderPathname(
  pathname: string | null
): string | null {
  return pathname === '/index' ? '/' : pathname;
}

export function usePublicPathname(): string | null {
  return normalizePrerenderPathname(usePathname());
}
