/**
 * General entity resolver contract (JOV-6746 / JOV-7821).
 *
 * The music resolver is the first producer behind this contract, not its
 * boundary. Entity kinds, identifier namespaces and sources are open lists so
 * products/merch, social and web identities, and people can be added as new
 * sources without changing the outcome shape every surface (public API, CLI,
 * MCP, product) already consumes.
 *
 * Invariants every source and surface keeps:
 * - abstain rather than guess: `ambiguous`/`no_match` with candidates and
 *   negative evidence are first-class outcomes, never a low-confidence pick;
 * - every asserted fact carries provenance (source, method, observedAt) and a
 *   calibrated confidence; identity confidence is separate from completeness;
 * - a source declares the uses its terms permit (display, retain, resell,
 *   train); a surface may only expose a fact whose source permits that use;
 * - corrections feed back: owner confirmations/rejections, false-link alarms
 *   and benchmark regressions are recorded as feedback events keyed to the
 *   entity and source, so the loop can re-weight sources and re-run benchmarks.
 */

import type { InHouseResolution } from '@/lib/music-resolver/in-house-contracts';

export const ENTITY_RESOLVER_CONTRACT = 'jovie.entity-resolver/v1' as const;

/** Open union: add kinds; never repurpose one. */
export type EntityKind =
  | 'artist'
  | 'person'
  | 'organization'
  | 'release'
  | 'recording'
  | 'work'
  | 'product'
  | 'social_account'
  | 'web_identity'
  | (string & { readonly __entityKind?: never });

/** e.g. isrc, upc, iswc, isni, mbid, spotify, gtin, sku, domain, handle:instagram */
export type IdentifierNamespace = string;

export interface Identifier {
  readonly namespace: IdentifierNamespace;
  readonly value: string;
}

export type SourceUse = 'display' | 'retain' | 'resell' | 'train';

export interface SourceCapability {
  readonly sourceId: string;
  readonly kinds: readonly EntityKind[];
  readonly inputs: readonly ('identifier' | 'url' | 'name' | 'attributes')[];
  /** Uses the source's terms permit. Unlisted uses are forbidden. */
  readonly permittedUses: readonly SourceUse[];
  /** Upstream the source shares with others; agreement across them is not independence. */
  readonly upstream: string;
}

export interface Provenance {
  readonly sourceId: string;
  readonly method: string;
  readonly observedAt: string | null;
}

export interface ResolvedLink {
  readonly destination: string;
  readonly url: string;
  readonly confidence: number;
  readonly provenance: Provenance;
}

export interface EntityResolution {
  readonly contract: typeof ENTITY_RESOLVER_CONTRACT;
  readonly kind: EntityKind;
  readonly status: 'resolved' | 'ambiguous' | 'no_match' | 'upstream_error';
  readonly displayName: string | null;
  readonly identifiers: readonly Identifier[];
  readonly links: readonly ResolvedLink[];
  /** Identity assurance only; completeness is reported separately. */
  readonly confidence: number;
  readonly candidates: readonly {
    readonly displayName: string;
    readonly url: string;
  }[];
  readonly negativeEvidence: readonly string[];
}

export type FeedbackSignal =
  | 'owner_confirmed'
  | 'owner_rejected'
  | 'false_link_alarm'
  | 'benchmark_regression'
  | 'user_correction';

export interface ResolverFeedbackEvent {
  readonly signal: FeedbackSignal;
  readonly kind: EntityKind;
  readonly sourceId: string;
  readonly subject: Identifier;
  readonly observedAt: string;
}

/** Project the music producer's outcome onto the general contract. */
export function fromInHouseResolution(
  result: InHouseResolution,
  observedAt: string | null = null
): EntityResolution {
  const identifiers: Identifier[] = [];
  if (result.isrc) identifiers.push({ namespace: 'isrc', value: result.isrc });
  if (result.upc) identifiers.push({ namespace: 'upc', value: result.upc });
  if (result.mbid) identifiers.push({ namespace: 'mbid', value: result.mbid });
  const kind: EntityKind =
    result.kind === 'track'
      ? 'recording'
      : result.kind === 'album'
        ? 'release'
        : 'artist';
  return {
    contract: ENTITY_RESOLVER_CONTRACT,
    kind,
    status: result.status,
    displayName: result.title ?? result.artist,
    identifiers,
    links: result.links.map(link => ({
      destination: link.provider,
      url: link.url,
      confidence: link.confidence,
      provenance: {
        sourceId: link.provider,
        method: link.provenance,
        observedAt,
      },
    })),
    confidence: result.confidence,
    candidates: result.candidates.map(candidate => ({
      displayName: candidate.artist
        ? `${candidate.artist} - ${candidate.title}`
        : candidate.title,
      url: candidate.url,
    })),
    negativeEvidence:
      result.status === 'resolved'
        ? []
        : [`${result.status}:candidates=${result.candidateCount}`],
  };
}
