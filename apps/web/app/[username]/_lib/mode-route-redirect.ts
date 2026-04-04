import { redirect } from 'next/navigation';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileModeHref } from '@/features/profile/registry';

type RouteParams = Promise<{
  readonly username: string;
}>;

type RouteSearchParams = Promise<{
  readonly source?: string | string[];
}>;

function normalizeSource(
  source: string | string[] | undefined
): string | undefined {
  if (typeof source === 'string' && source.length > 0) {
    return source;
  }

  if (Array.isArray(source)) {
    return source.find(value => value.length > 0);
  }

  return undefined;
}

export async function redirectToProfileMode(
  params: RouteParams,
  searchParams: RouteSearchParams | undefined,
  mode: Exclude<ProfileMode, 'profile'>
) {
  const [{ username }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const source = normalizeSource(resolvedSearchParams?.source);
  const searchSuffix = source
    ? `source=${encodeURIComponent(source)}`
    : undefined;

  redirect(getProfileModeHref(username, mode, searchSuffix));
}
