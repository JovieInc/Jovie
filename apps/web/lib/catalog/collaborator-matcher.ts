import { resolveCatalogCollaborator } from './collaborator-resolver';
import { normalizeCollaboratorAlias } from './normalize';
import type {
  CatalogRelease,
  CatalogSnapshot,
  CollaboratorCatalogMatch,
  CollaboratorSignalInput,
  CollaboratorSignalMatchResult,
} from './types';

const RELEASE_COLLABORATOR_CONFIDENCE = 0.94;

function releaseCreditsCollaborator(
  release: CatalogRelease,
  collaboratorName: string,
  ownerArtistName: string
): boolean {
  const normalizedCollaborator = normalizeCollaboratorAlias(collaboratorName);
  const normalizedOwner = normalizeCollaboratorAlias(ownerArtistName);

  return release.artistNames.some(artistName => {
    const normalizedArtist = normalizeCollaboratorAlias(artistName);
    return (
      normalizedArtist === normalizedCollaborator &&
      normalizedArtist !== normalizedOwner
    );
  });
}

function buildMatchReason(
  collaboratorName: string,
  releaseTitle: string
): string {
  return `${releaseTitle} is a catalog collaboration with ${collaboratorName}.`;
}

export function matchCollaboratorCatalogReleases(
  catalog: CatalogSnapshot,
  resolver: NonNullable<ReturnType<typeof resolveCatalogCollaborator>>
): readonly CollaboratorCatalogMatch[] {
  const collaboratorConfidence = resolver.confidence;

  return catalog.releases
    .filter(release =>
      releaseCreditsCollaborator(
        release,
        resolver.collaborator.name,
        catalog.ownerArtistName
      )
    )
    .map(release => ({
      collaborator: resolver.collaborator,
      release,
      confidence: Number(
        (RELEASE_COLLABORATOR_CONFIDENCE * collaboratorConfidence).toFixed(4)
      ),
      reason: buildMatchReason(resolver.collaborator.name, release.title),
    }))
    .sort((left, right) => right.confidence - left.confidence);
}

export function matchCollaboratorSignal(
  catalog: CatalogSnapshot,
  signal: CollaboratorSignalInput
): CollaboratorSignalMatchResult | null {
  const resolver = resolveCatalogCollaborator(catalog, signal);
  if (!resolver) {
    return null;
  }

  const matches = matchCollaboratorCatalogReleases(catalog, resolver);
  if (matches.length === 0) {
    return null;
  }

  return {
    resolver,
    matches,
  };
}
