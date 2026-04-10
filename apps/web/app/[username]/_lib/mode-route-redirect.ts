import { redirect } from 'next/navigation';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileModeHref } from '@/features/profile/registry';

type RouteParams = Promise<{
  readonly username: string;
}>;

type RouteSearchParams = Promise<{
  readonly source?: string | string[];
}>;

type RedirectSourceSearchParams = {
  readonly source?: string | string[];
};

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

export function getProfileModeRedirectHref(
  username: string,
  searchParams: RedirectSourceSearchParams | undefined,
  mode: Exclude<ProfileMode, 'profile'>
) {
  const source = normalizeSource(searchParams?.source);
  const searchSuffix = source
    ? `source=${encodeURIComponent(source)}`
    : undefined;

  return getProfileModeHref(username, mode, searchSuffix);
}

export function getRouteRedirectSearchParams(searchParams: URLSearchParams) {
  const sourceValues = searchParams.getAll('source').filter(Boolean);

  if (sourceValues.length === 0) {
    return undefined;
  }

  return {
    source: sourceValues.length === 1 ? sourceValues[0] : sourceValues,
  } satisfies RedirectSourceSearchParams;
}

export async function redirectToProfileMode(
  params: RouteParams,
  searchParamsOrMode:
    | RouteSearchParams
    | Exclude<ProfileMode, 'profile'>
    | undefined,
  maybeMode?: Exclude<ProfileMode, 'profile'>
) {
  const mode =
    typeof searchParamsOrMode === 'string' ? searchParamsOrMode : maybeMode;

  if (!mode) {
    throw new Error('redirectToProfileMode requires a profile mode');
  }

  if (typeof searchParamsOrMode === 'string' || searchParamsOrMode == null) {
    const { username } = await params;
    redirect(getProfileModeHref(username, mode));
  }

  const [{ username }, resolvedSearchParams] = await Promise.all([
    params,
    searchParamsOrMode,
  ]);

  redirect(getProfileModeRedirectHref(username, resolvedSearchParams, mode));
}
