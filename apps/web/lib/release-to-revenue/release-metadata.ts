import 'server-only';

import { getReleaseForProfileById } from '@/lib/discography/queries';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import type {
  ManualReleaseTriggerInput,
  ReleaseToRevenueProviderLink,
  ReleaseToRevenueReleaseMetadata,
} from './types';

function normalizeLinks(
  links: readonly ReleaseToRevenueProviderLink[] | undefined
): ReleaseToRevenueProviderLink[] {
  if (!links || links.length === 0) {
    return [];
  }

  return links
    .filter(link => link.url.trim().length > 0)
    .map(link => ({
      providerId: link.providerId,
      url: link.url.trim(),
      ...(link.label ? { label: link.label } : {}),
    }));
}

export async function resolveReleaseMetadataFromCatalog(input: {
  readonly creatorProfileId: string;
  readonly creatorUsername: string;
  readonly releaseId: string;
}): Promise<ReleaseToRevenueReleaseMetadata | null> {
  const release = await getReleaseForProfileById(
    input.creatorProfileId,
    input.releaseId,
    { includeDrafts: true }
  );

  if (!release) {
    return null;
  }

  const slug = release.slug;

  return {
    releaseId: release.id,
    title: release.title,
    artworkUrl: release.artworkUrl ?? null,
    slug,
    smartLinkPath: buildSmartLinkPath(input.creatorUsername, slug),
    links: release.providerLinks.map(link => ({
      providerId: link.providerId,
      url: link.url,
    })),
  };
}

export function resolveReleaseMetadataFromManual(
  input: ManualReleaseTriggerInput,
  creatorUsername: string
): ReleaseToRevenueReleaseMetadata {
  const slug = input.slug?.trim();
  const smartLinkPath =
    slug && slug.length > 0
      ? buildSmartLinkPath(creatorUsername, slug)
      : undefined;

  return {
    title: input.title.trim(),
    artworkUrl: input.artworkUrl ?? null,
    ...(slug ? { slug } : {}),
    ...(smartLinkPath ? { smartLinkPath } : {}),
    links: normalizeLinks(input.links),
  };
}
