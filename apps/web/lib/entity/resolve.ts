/**
 * Entity ID resolution pipeline.
 *
 * Identity resolution ladder (long-tail artists without Wikipedia sitelinks):
 *   1. Spotify connect → DSP discovery → MusicBrainz MBID (auto-confirm or human review)
 *   2. MBID → MusicBrainz url-rels → Wikidata QID (works without a Wikipedia sitelink)
 *   3. MBID → MusicBrainz ISNI list → ISNI.org identifiers
 *   4. Missing MB/Wikidata nodes → human-in-loop creation (not auto-published here)
 *   5. buildEntitySameAs() renders the dense sameAs array from stored IDs
 *
 * Given a profile with a known MusicBrainz MBID, fetches the full MB artist
 * record (url-rels + ISNI list) and stores resolved Wikidata QID and ISNI
 * identifiers into artist_identity_links.
 *
 * Human-in-loop: this stores data; it does NOT auto-publish to social_links.
 * A separate publish/review step promotes entries as needed.
 */

import 'server-only';

import type { DbOrTransaction } from '@/lib/db';
import { getMusicBrainzArtist } from '@/lib/dsp-enrichment/providers/musicbrainz';
import type { MusicBrainzArtist } from '@/lib/dsp-enrichment/types';
import { storeRawIdentityLinks } from '@/lib/identity/store';
import { logger } from '@/lib/utils/logger';

const SOURCE = 'musicbrainz_entity_resolution';

/** Extract the Wikidata QID from MB url-rels (relation type "wikidata") */
function extractWikidataFromRelations(
  artist: MusicBrainzArtist
): { qid: string; url: string } | null {
  for (const rel of artist.relations ?? []) {
    if (rel.type === 'wikidata' && rel.url?.resource) {
      const match = rel.url.resource.match(/wikidata\.org\/wiki\/(Q\d+)/i);
      if (match) {
        return { qid: match[1], url: rel.url.resource };
      }
    }
  }
  return null;
}

/**
 * Resolve entity identifiers for an artist that already has an MBID stored.
 *
 * Fetches the MB artist record, extracts Wikidata QID and ISNIs, and stores
 * them in artist_identity_links. Safe to call repeatedly (upsert semantics).
 *
 * @returns  summary of what was stored, or null when MBID is absent/unresolvable
 */
export async function resolveEntityIds(
  tx: DbOrTransaction,
  profileId: string,
  mbid: string,
  spotifyUrl: string
): Promise<{ wikidata: string | null; isnis: string[] } | null> {
  let artist: MusicBrainzArtist | null;
  try {
    artist = await getMusicBrainzArtist(mbid);
  } catch (err) {
    logger.warn('Entity resolution: MusicBrainz lookup failed', {
      profileId,
      mbid,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!artist) return null;

  const links = [];

  // ── Wikidata ────────────────────────────────────────────────────────────
  const wikidata = extractWikidataFromRelations(artist);
  if (wikidata) {
    links.push({
      platform: 'wikidata',
      url: wikidata.url,
      externalId: wikidata.qid,
      rawPayload: { qid: wikidata.qid, source: 'mb_url_rel' },
    });
  }

  // ── ISNIs ───────────────────────────────────────────────────────────────
  const isnis = (artist.isnis ?? []).filter(Boolean);
  for (const isni of isnis) {
    const normalized = isni.replace(/[\s\-]/g, '');
    if (normalized.length === 16) {
      links.push({
        platform: 'isni',
        url: `https://isni.org/isni/${normalized}`,
        externalId: normalized,
        rawPayload: { isni: normalized, source: 'mb_isni' },
      });
    }
  }

  if (links.length > 0) {
    await storeRawIdentityLinks(tx, profileId, SOURCE, spotifyUrl, links);
    logger.info('Entity resolution: stored identity links', {
      profileId,
      mbid,
      wikidata: wikidata?.qid ?? null,
      isniCount: isnis.length,
    });
  }

  return { wikidata: wikidata?.qid ?? null, isnis };
}
