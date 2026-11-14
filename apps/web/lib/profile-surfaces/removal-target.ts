import type { PresenceRemovalTarget } from '@/components/features/presence/types';
import { canonicalizeSurfaceUrl } from './contracts';

export interface RemovalSource {
  readonly surfaceId: string;
  readonly sourceType: string;
  readonly sourceRefId: string;
}

export interface RemovalLink {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly url: string;
  readonly version: number;
  readonly isActive: boolean | null;
  readonly state: string;
}

/** Provenance identifies the row to remove; URL equivalence only validates it. */
export function resolvePresenceRemovalTarget(
  surface: { readonly id: string; readonly kind: string; readonly url: string },
  profileId: string,
  sources: readonly RemovalSource[],
  links: readonly RemovalLink[]
): PresenceRemovalTarget | undefined {
  if (surface.kind === 'jovie' || surface.id.startsWith('preview:')) return;
  const ids = new Set(
    sources
      .filter(
        source =>
          source.surfaceId === surface.id && source.sourceType === 'social_link'
      )
      .map(source => source.sourceRefId)
  );
  if (ids.size !== 1) return;
  const link = links.find(candidate => ids.has(candidate.id));
  if (
    !link ||
    link.creatorProfileId !== profileId ||
    !link.isActive ||
    link.state !== 'active' ||
    !Number.isSafeInteger(link.version) ||
    link.version < 1
  )
    return;
  const canonical = canonicalizeSurfaceUrl(surface.url);
  if (!canonical || canonicalizeSurfaceUrl(link.url)?.url !== canonical.url)
    return;
  return { linkId: link.id, url: link.url, version: link.version };
}
