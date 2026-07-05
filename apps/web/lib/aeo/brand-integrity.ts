/**
 * AEO Brand Integrity — Same-name entity disambiguation
 *
 * Detects same-name entity collisions and enforces disambiguating attributes
 * so the correct artist resolves in answer engines.
 *
 * "Same-name entity collision": two real-world artists share a name but have
 * different KB identities. Without KB anchors (MusicBrainz, Wikidata, ISNI)
 * and disambiguating attributes (origin, genre, foundingDate, distinct image),
 * engines may cite the wrong entity.
 *
 * Pure function — no DB access.
 */

import { computeRatePercent } from '@/lib/analytics/metrics';

/** Minimal artist profile fields needed for brand integrity checks */
export interface BrandIntegrityProfile {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly location?: string | null;
  readonly hometown?: string | null;
  readonly genres?: string[] | null;
  readonly active_since_year?: number | null;
  readonly image_url?: string | null;
  readonly musicbrainzId?: string | null;
}

/** A stored KB identity link used for integrity checking */
export interface BrandIntegrityIdentityLink {
  readonly platform: string;
  readonly url: string;
  readonly externalId?: string | null;
}

/** Severity of a brand integrity issue */
export type BrandIssueSeverity = 'critical' | 'warning' | 'info';

/** A single brand integrity issue with a remediation action */
export interface BrandIssue {
  readonly code: string;
  readonly severity: BrandIssueSeverity;
  readonly title: string;
  readonly description: string;
  /** What the user should do to fix this */
  readonly remediation: string;
  /** Which schema.org field this maps to */
  readonly schemaField?: string;
}

/** Same-name collision risk assessment */
export interface SameNameCollisionRisk {
  /** Whether a collision risk was detected */
  readonly atRisk: boolean;
  /** Number of KB identifiers anchoring this entity */
  readonly kbAnchorCount: number;
  /** Platforms that provide KB anchoring */
  readonly kbPlatforms: string[];
  /** Human-readable risk level */
  readonly level: 'high' | 'medium' | 'low';
  /** Explanation of the risk level */
  readonly rationale: string;
}

/** Full brand integrity report for one artist */
export interface BrandIntegrityReport {
  readonly profileId: string;
  readonly artistName: string;
  readonly issues: readonly BrandIssue[];
  readonly sameNameCollisionRisk: SameNameCollisionRisk;
  /** Disambiguating checklist — items that should be filled in */
  readonly disambiguatingChecklist: readonly DisambiguatingItem[];
  /** Overall integrity score (0–100). Higher = better. */
  readonly score: number;
}

/** A single disambiguating attribute item in the checklist */
export interface DisambiguatingItem {
  readonly attribute: string;
  /** schema.org property this maps to */
  readonly schemaProperty: string;
  readonly present: boolean;
  readonly value: string | null;
  readonly description: string;
}

/** KB platforms that anchor an entity to a unique identity */
const KB_PLATFORMS = new Set(['musicbrainz', 'wikidata', 'isni']);

function hasKbIdentifier(identityLinks: BrandIntegrityIdentityLink[]): {
  platforms: string[];
  count: number;
} {
  const kbPlatforms = identityLinks
    .filter(link => KB_PLATFORMS.has(link.platform.toLowerCase()))
    .map(link => link.platform.toLowerCase());
  const unique = [...new Set(kbPlatforms)];
  return { platforms: unique, count: unique.length };
}

function hasMusicBrainzId(
  profile: BrandIntegrityProfile,
  identityLinks: BrandIntegrityIdentityLink[]
): boolean {
  if (profile.musicbrainzId) return true;
  return identityLinks.some(l => l.platform.toLowerCase() === 'musicbrainz');
}

function hasWikidataId(identityLinks: BrandIntegrityIdentityLink[]): boolean {
  return identityLinks.some(l => l.platform.toLowerCase() === 'wikidata');
}

function hasIsni(identityLinks: BrandIntegrityIdentityLink[]): boolean {
  return identityLinks.some(l => l.platform.toLowerCase() === 'isni');
}

function getOrigin(profile: BrandIntegrityProfile): string | null {
  return profile.hometown?.trim() || profile.location?.trim() || null;
}

/**
 * Build the disambiguating attribute checklist.
 * Each item maps to a schema.org field that helps engines distinguish
 * this entity from a same-name entity.
 */
function buildDisambiguatingChecklist(
  profile: BrandIntegrityProfile,
  identityLinks: BrandIntegrityIdentityLink[]
): DisambiguatingItem[] {
  const origin = getOrigin(profile);
  const genres = (profile.genres ?? []).filter(Boolean);
  const hasImage = Boolean(profile.image_url?.trim());

  return [
    {
      attribute: 'Origin / Location',
      schemaProperty: 'foundingLocation',
      present: Boolean(origin),
      value: origin,
      description:
        'Artist origin or current location (hometown or city). Helps engines disambiguate artists with the same name from different regions.',
    },
    {
      attribute: 'Genre',
      schemaProperty: 'genre',
      present: genres.length > 0,
      value: genres.length > 0 ? genres.join(', ') : null,
      description:
        'Music genre(s). Critical for disambiguation — two artists named "Alex" in different genres resolve to different entities.',
    },
    {
      attribute: 'Active Since Year',
      schemaProperty: 'foundingDate',
      present: Boolean(profile.active_since_year),
      value: profile.active_since_year
        ? String(profile.active_since_year)
        : null,
      description:
        'Year the artist became active. Used as foundingDate in MusicGroup schema, helping establish a unique timeline.',
    },
    {
      attribute: 'Profile Image',
      schemaProperty: 'image',
      present: hasImage,
      value: hasImage ? profile.image_url! : null,
      description:
        'Distinct artist photo. Engines use images to visually confirm entity identity. A missing or generic image increases hallucination risk.',
    },
    {
      attribute: 'MusicBrainz ID',
      schemaProperty: 'sameAs (MusicBrainz)',
      present: hasMusicBrainzId(profile, identityLinks),
      value: profile.musicbrainzId ?? null,
      description:
        'MusicBrainz MBID in sameAs. The strongest KB anchor — uniquely identifies this entity globally.',
    },
    {
      attribute: 'Wikidata ID',
      schemaProperty: 'sameAs (Wikidata)',
      present: hasWikidataId(identityLinks),
      value:
        identityLinks.find(l => l.platform === 'wikidata')?.externalId ?? null,
      description:
        'Wikidata QID in sameAs. Second strongest KB anchor. Also gates knowledge panel eligibility in Google.',
    },
    {
      attribute: 'ISNI',
      schemaProperty: 'sameAs (ISNI)',
      present: hasIsni(identityLinks),
      value: identityLinks.find(l => l.platform === 'isni')?.externalId ?? null,
      description:
        'International Standard Name Identifier. Used by music publishers and libraries to distinguish creators.',
    },
  ];
}

/**
 * Assess the risk of a same-name entity collision.
 *
 * Risk is determined by how well the artist is anchored to a unique KB entity:
 * - 0 KB anchors + common-sounding name = HIGH
 * - 1 KB anchor = MEDIUM
 * - 2+ KB anchors = LOW
 */
export function assessSameNameCollisionRisk(
  profile: BrandIntegrityProfile,
  identityLinks: BrandIntegrityIdentityLink[]
): SameNameCollisionRisk {
  const { platforms, count } = hasKbIdentifier(identityLinks);

  if (count >= 2) {
    return {
      atRisk: false,
      kbAnchorCount: count,
      kbPlatforms: platforms,
      level: 'low',
      rationale: `${count} KB identifiers (${platforms.join(', ')}) uniquely anchor this entity. Collision risk is low.`,
    };
  }

  if (count === 1) {
    return {
      atRisk: true,
      kbAnchorCount: count,
      kbPlatforms: platforms,
      level: 'medium',
      rationale: `Only 1 KB identifier (${platforms[0] ?? 'unknown'}). Add a second (e.g. Wikidata) for strong disambiguation.`,
    };
  }

  return {
    atRisk: true,
    kbAnchorCount: 0,
    kbPlatforms: [],
    level: 'high',
    rationale:
      `No KB identifiers (MusicBrainz, Wikidata, ISNI) found for ${profile.name}. ` +
      'Engines may cite another artist with the same name. Connect a MusicBrainz MBID to resolve.',
  };
}

/**
 * Validate disambiguating attributes and produce issues.
 * Issues are ordered by severity.
 */
function buildIssues(
  profile: BrandIntegrityProfile,
  identityLinks: BrandIntegrityIdentityLink[],
  checklist: DisambiguatingItem[]
): BrandIssue[] {
  const issues: BrandIssue[] = [];
  const origin = getOrigin(profile);
  const genres = (profile.genres ?? []).filter(Boolean);

  if (!hasMusicBrainzId(profile, identityLinks)) {
    issues.push({
      code: 'missing_musicbrainz_id',
      severity: 'critical',
      title: 'No MusicBrainz identifier',
      description:
        'Without a MusicBrainz MBID, answer engines cannot unambiguously identify this entity. ' +
        'Same-name artists from different eras or regions may be conflated.',
      remediation:
        'Link a MusicBrainz MBID via the Entity Identity section. Run the identity resolver once the MBID is set.',
      schemaField: 'sameAs',
    });
  }

  if (!hasWikidataId(identityLinks)) {
    issues.push({
      code: 'missing_wikidata_id',
      severity: 'warning',
      title: 'No Wikidata identifier',
      description:
        'Wikidata QIDs are used by Google and others to build knowledge panels. ' +
        'Without one, the artist may not surface in AI-generated entity cards.',
      remediation:
        'Run the MusicBrainz entity resolver — it auto-extracts the Wikidata QID from url-rels when available.',
      schemaField: 'sameAs',
    });
  }

  if (!origin) {
    issues.push({
      code: 'missing_origin',
      severity: 'warning',
      title: 'Origin / location not set',
      description:
        'Origin is a key disambiguating attribute. Two artists named "Alex" from different cities resolve differently.',
      remediation: 'Set hometown or location on the artist profile.',
      schemaField: 'foundingLocation',
    });
  }

  if (genres.length === 0) {
    issues.push({
      code: 'missing_genre',
      severity: 'warning',
      title: 'No genre set',
      description:
        'Genre is the second most important disambiguating attribute after location. ' +
        'It distinguishes same-name artists across musical contexts.',
      remediation: 'Add at least one genre to the artist profile.',
      schemaField: 'genre',
    });
  }

  if (!profile.active_since_year) {
    issues.push({
      code: 'missing_founding_date',
      severity: 'info',
      title: 'Active since year not set',
      description:
        'foundingDate in MusicGroup schema establishes a unique timeline, which helps resolve collisions ' +
        'between a current artist and a historical artist with the same name.',
      remediation: "Set 'Active Since Year' on the artist profile.",
      schemaField: 'foundingDate',
    });
  }

  if (!profile.image_url?.trim()) {
    issues.push({
      code: 'missing_image',
      severity: 'info',
      title: 'No profile image',
      description:
        'Engines use images to visually confirm entity identity. A missing image increases hallucination risk.',
      remediation: 'Upload a distinct artist photo to the profile.',
      schemaField: 'image',
    });
  }

  return issues;
}

/**
 * Compute an integrity score (0–100) from the checklist.
 *
 * Weights:
 * - MusicBrainz ID: 30
 * - Wikidata ID: 20
 * - Genre: 20
 * - Origin: 15
 * - foundingDate: 10
 * - Image: 5
 */
const CHECKLIST_WEIGHTS: Record<string, number> = {
  'MusicBrainz ID': 30,
  'Wikidata ID': 20,
  Genre: 20,
  'Origin / Location': 15,
  'Active Since Year': 10,
  'Profile Image': 5,
};

function computeIntegrityScore(checklist: DisambiguatingItem[]): number {
  const totalWeight = Object.values(CHECKLIST_WEIGHTS).reduce(
    (sum, w) => sum + w,
    0
  );
  let earned = 0;
  for (const item of checklist) {
    if (item.present) {
      earned += CHECKLIST_WEIGHTS[item.attribute] ?? 0;
    }
  }
  return computeRatePercent(earned, totalWeight, 0);
}

/**
 * Run a full brand integrity check for an artist.
 *
 * Returns issues, a same-name collision risk assessment, a disambiguating
 * checklist, and a composite score — all suitable for the dashboard tile.
 */
export function checkBrandIntegrity(
  profile: BrandIntegrityProfile,
  identityLinks: BrandIntegrityIdentityLink[]
): BrandIntegrityReport {
  const checklist = buildDisambiguatingChecklist(profile, identityLinks);
  const issues = buildIssues(profile, identityLinks, checklist);
  const sameNameCollisionRisk = assessSameNameCollisionRisk(
    profile,
    identityLinks
  );
  const score = computeIntegrityScore(checklist);

  return {
    profileId: profile.id,
    artistName: profile.name,
    issues,
    sameNameCollisionRisk,
    disambiguatingChecklist: checklist,
    score,
  };
}

/**
 * Summarise how many critical, warning, and info issues exist.
 * Useful for compact badge rendering in the tile.
 */
export function countIssuesBySeverity(report: BrandIntegrityReport): {
  critical: number;
  warning: number;
  info: number;
} {
  return {
    critical: report.issues.filter(i => i.severity === 'critical').length,
    warning: report.issues.filter(i => i.severity === 'warning').length,
    info: report.issues.filter(i => i.severity === 'info').length,
  };
}
