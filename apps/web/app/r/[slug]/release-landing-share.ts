import { buildReleaseShareContext } from '@/lib/share/context';
import {
  type PartialUTMParams,
  resolveSmartLinkOutboundUtmParams,
} from '@/lib/utm';

export function resolveReleaseUtmParams(
  defaultParams: PartialUTMParams
): PartialUTMParams {
  if (globalThis.window === undefined) {
    return defaultParams;
  }

  return resolveSmartLinkOutboundUtmParams(
    new URLSearchParams(globalThis.location.search),
    defaultParams
  );
}

export function getReleaseSharePathname(
  artistHandle: string | null,
  shareSlug: string
): string | undefined {
  if (artistHandle) {
    return `/${artistHandle}/${shareSlug}`;
  }

  if (shareSlug === 'release') {
    return undefined;
  }

  return `/r/${shareSlug}`;
}

export function createReleaseShareContext({
  artistHandle,
  artistName,
  releaseTitle,
  artworkUrl,
  shareSlug,
  sharePathname,
}: Readonly<{
  artistHandle: string | null;
  artistName: string;
  releaseTitle: string;
  artworkUrl: string | null;
  shareSlug: string;
  sharePathname: string | undefined;
}>) {
  return buildReleaseShareContext({
    username: artistHandle ?? 'release',
    slug: shareSlug,
    title: releaseTitle,
    artistName,
    artworkUrl,
    pathname: sharePathname,
    storyQueryParams: artistHandle
      ? undefined
      : {
          slug: shareSlug,
          title: releaseTitle,
          artistName,
          pathname: sharePathname ?? `/r/${shareSlug}`,
          artworkUrl,
        },
  });
}
