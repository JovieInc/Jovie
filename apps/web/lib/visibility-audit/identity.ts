import { buildEntitySameAs } from '@/lib/entity/sameAs';
import type {
  IdentityChainStep,
  IdentitySection,
  VisibilityAuditInput,
} from './types';

function normalizeIsni(raw: string): string | null {
  const normalized = raw.replace(/[\s-]/g, '');
  return normalized.length === 16 ? normalized : null;
}

function normalizeQid(raw: string | null | undefined): string | null {
  const match = raw?.match(/Q\d+/i)?.[0];
  if (!match) return null;
  return `Q${match.slice(1)}`;
}

function qidFromLink(url: string, externalId?: string | null): string | null {
  return normalizeQid(externalId) ?? normalizeQid(url);
}

export function buildIdentitySection(
  input: VisibilityAuditInput
): IdentitySection {
  const mbid =
    input.musicbrainzId?.trim() ||
    input.identityLinks.find(
      link => link.platform.toLowerCase() === 'musicbrainz' && link.externalId
    )?.externalId ||
    null;

  let wikidataQid: string | null = null;
  const isnis: string[] = [];
  for (const link of input.identityLinks) {
    const platform = link.platform.toLowerCase();
    if (platform === 'wikidata' && !wikidataQid) {
      wikidataQid = qidFromLink(link.url, link.externalId);
    }
    if (platform === 'isni') {
      const isni = normalizeIsni(link.externalId || link.url);
      if (isni && !isnis.includes(isni)) isnis.push(isni);
    }
  }

  const sameAs = buildEntitySameAs(
    {
      musicbrainzId: mbid,
      spotifyUrl: input.spotifyUrl,
      appleMusicUrl: input.appleMusicUrl,
      youtubeUrl: input.youtubeUrl,
    },
    input.identityLinks.map(link => ({
      platform: link.platform,
      url: link.url,
      externalId: link.externalId,
    })),
    input.socialLinks.map(link => ({
      platform: link.platform,
      url: link.url,
    }))
  );

  const steps: IdentityChainStep[] = [
    {
      id: 'mbid',
      label: 'MusicBrainz MBID',
      status: mbid ? 'present' : 'missing',
      values: mbid ? [mbid] : [],
    },
    {
      id: 'wikidata',
      label: 'Wikidata QID',
      status: wikidataQid ? 'present' : 'missing',
      values: wikidataQid ? [wikidataQid] : [],
    },
    {
      id: 'isni',
      label: 'ISNI',
      status: isnis.length > 0 ? 'present' : 'missing',
      values: isnis,
    },
  ];

  return { steps, mbid, wikidataQid, isnis, sameAs };
}
