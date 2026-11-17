/**
 * Existing-relationship hold (hard gate, 2026-11-12).
 *
 * Tim writes and produces for artists through their managers, labels and
 * publishers. An artist he already works with, or one represented by a team
 * he already works with, must never receive cold outreach: no outreach-ready
 * state, no cold claim invite, no draft. A match is flagged to Tim instead.
 *
 * Unlike entity-eligibility.ts this is not warn-only. It is a checked-in
 * registry so every hold is reviewed in a PR; add an entry to hold someone,
 * remove it to release them. An organization may instead be `kind: 'note'`:
 * its artists stay eligible for outreach but carry a visible relationship tag
 * wherever Tim reviews the lead, the draft or the approval. Entries carry artist names, organization names
 * and domains, and contact names only. Never add an email address or a phone
 * number here.
 */

export type RelationshipKind = 'block' | 'note';

export interface RelationshipArtist {
  /** The artist name as their catalog shows it. */
  readonly name: string;
  /** Known handles on any platform, without the leading @. */
  readonly handles: readonly string[];
  readonly reason: string;
  /** ISO date the entry was added. */
  readonly addedAt: string;
}

export interface RelationshipOrganization {
  /** Management company, label or publisher name. */
  readonly name: string;
  /** Email domains the organization sends from. */
  readonly domains: readonly string[];
  /** Other names it appears under in bios and label data ("Armada"). */
  readonly aliases?: readonly string[];
  /**
   * `block`: its artists are held out of cold outreach. `note`: its artists
   * stay eligible and carry the `note` tag for Tim to see.
   */
  readonly kind: RelationshipKind;
  /** The tag shown for a `note` organization. */
  readonly note?: string;
  readonly addedAt: string;
}

export interface RelationshipContact {
  /** A person on the management or publishing side. Name only. */
  readonly name: string;
  readonly addedAt: string;
}

export interface ExistingRelationshipRegistry {
  readonly artists: readonly RelationshipArtist[];
  readonly organizations: readonly RelationshipOrganization[];
  readonly contacts: readonly RelationshipContact[];
}

const VIA_MANAGEMENT =
  'Existing relationship: Tim has worked with this artist via their management/publisher';

export const EXISTING_RELATIONSHIPS: ExistingRelationshipRegistry = {
  artists: [
    {
      name: 'Dannic',
      handles: ['djdannic', 'dannic'],
      reason:
        'Existing relationship: Tim has written on Dannic tracks via their management/publisher',
      addedAt: '2026-11-12',
    },
    {
      name: 'Bali Bandits',
      handles: ['balibandits'],
      reason: VIA_MANAGEMENT,
      addedAt: '2026-11-12',
    },
    {
      name: 'Orjan Nilsen',
      handles: ['orjannilsen'],
      reason: VIA_MANAGEMENT,
      addedAt: '2026-11-12',
    },
    {
      name: 'Tom Fall',
      handles: ['tomfall'],
      reason: VIA_MANAGEMENT,
      addedAt: '2026-11-12',
    },
  ],
  organizations: [
    {
      name: 'Sorted Management',
      domains: ['sortedmanagement.com'],
      kind: 'block',
      addedAt: '2026-11-12',
    },
    {
      name: 'Cloud 9 Music',
      domains: ['cloud9music.nl'],
      kind: 'block',
      addedAt: '2026-11-12',
    },
    {
      name: 'Big MGMT',
      domains: ['bigmgmt.com'],
      kind: 'block',
      addedAt: '2026-11-12',
    },
    {
      name: 'Armada Music',
      domains: ['armadamusic.com'],
      aliases: ['Armada'],
      kind: 'note',
      note: "Relationship: Armada Music, Tim's vocalist deals",
      addedAt: '2026-11-12',
    },
  ],
  contacts: [{ name: 'Gary Salzman', addedAt: '2026-11-12' }],
};

/** The line shown wherever the outbound queue or readiness lists reasons. */
export const EXISTING_RELATIONSHIP_LABEL =
  'Existing relationship: flag to Tim, no cold outreach';

export function relationshipViaReason(via: string): string {
  return `Existing relationship via ${via}: flag to Tim, no cold outreach`;
}

export interface ExistingRelationshipInput {
  readonly handle: string | null | undefined;
  readonly displayName: string | null | undefined;
  readonly contactEmail?: string | null;
  /** A second handle for the same person (e.g. Instagram). */
  readonly instagramHandle?: string | null;
  /** Public bio or management text; matched for organization and contact names. */
  readonly bio?: string | null;
  /** Label names from the lead's label or release data. */
  readonly labels?: readonly (string | null | undefined)[];
}

export type ExistingRelationshipMatch =
  | 'handle'
  | 'name'
  | 'organization_domain'
  | 'organization_name'
  | 'organization_label'
  | 'contact_name';

export interface ExistingRelationshipHold {
  readonly held: true;
  readonly reason: string;
  readonly matchedBy: ExistingRelationshipMatch;
}

/** Letters the NFKD fold leaves alone ("Ørjan" must match "Orjan"). */
const LETTER_FOLDS: Readonly<Record<string, string>> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  å: 'a',
  ß: 'ss',
  đ: 'd',
  ł: 'l',
};

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[øæœåßđł]/g, letter => LETTER_FOLDS[letter] ?? letter);
}

/** Handle or name reduced to its letters and digits: "@DJ_Dannic" -> "djdannic". */
export function normalizeRelationshipKey(
  value: string | null | undefined
): string {
  return fold(value ?? '').replace(/[^a-z0-9]/g, '');
}

/** Words of a text, single-spaced, so phrases match across punctuation. */
function words(value: string | null | undefined): string {
  return fold(value ?? '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Cloud 9 Music" also matches "cloud9 music" and "Cloud9Music", as whole words. */
function mentions(text: string, name: string): boolean {
  const phrase = words(name);
  if (!phrase || !text) return false;
  // `words` leaves only [a-z0-9 ], so the phrase needs no escaping.
  return new RegExp(`(^| )${phrase.replaceAll(' ', ' ?')}( |$)`).test(text);
}

function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 0) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '');
  return domain || null;
}

function sameOrSubdomain(domain: string, registered: string): boolean {
  const target = registered.trim().toLowerCase();
  return domain === target || domain.endsWith(`.${target}`);
}

/** True when lowercased text prints the domain as a whole host, not a fragment. */
function printsDomain(textLower: string, registered: string): boolean {
  const target = registered.trim().toLowerCase();
  let from = textLower.indexOf(target);
  while (target && from >= 0) {
    const before = textLower[from - 1] ?? ' ';
    const rest = textLower.slice(from + target.length);
    if (!/[a-z0-9-]/.test(before) && !/^([a-z0-9-]|\.[a-z0-9])/.test(rest))
      return true;
    from = textLower.indexOf(target, from + 1);
  }
  return false;
}

/** How a lead matches an organization, or null. */
function organizationMatch(
  input: ExistingRelationshipInput,
  organization: RelationshipOrganization
): ExistingRelationshipMatch | null {
  const domain = emailDomain(input.contactEmail);
  const bioLower = (input.bio ?? '').toLowerCase();
  const byDomain = organization.domains.some(
    registered =>
      (domain !== null && sameOrSubdomain(domain, registered)) ||
      // A management address or site printed in the bio counts too.
      printsDomain(bioLower, registered)
  );
  if (byDomain) return 'organization_domain';
  const names = [organization.name, ...(organization.aliases ?? [])];
  const bio = words(input.bio);
  if (names.some(name => mentions(bio, name))) return 'organization_name';
  const labels = (input.labels ?? []).map(words).filter(Boolean);
  if (labels.some(label => names.some(name => mentions(label, name))))
    return 'organization_label';
  return null;
}

/**
 * The hold on an artist Tim already has a relationship with, or null.
 * Pure and deterministic; pass a registry only in tests.
 */
export function existingRelationshipHold(
  input: ExistingRelationshipInput,
  registry: ExistingRelationshipRegistry = EXISTING_RELATIONSHIPS
): ExistingRelationshipHold | null {
  const handles = [input.handle, input.instagramHandle]
    .map(normalizeRelationshipKey)
    .filter(Boolean);
  const name = normalizeRelationshipKey(input.displayName);

  for (const artist of registry.artists) {
    const artistName = normalizeRelationshipKey(artist.name);
    const artistHandles = new Set(
      [...artist.handles.map(normalizeRelationshipKey), artistName].filter(
        Boolean
      )
    );
    if (handles.some(handle => artistHandles.has(handle)))
      return { held: true, reason: artist.reason, matchedBy: 'handle' };
    if (name && name === artistName)
      return { held: true, reason: artist.reason, matchedBy: 'name' };
  }

  for (const organization of registry.organizations) {
    if (organization.kind !== 'block') continue;
    const matchedBy = organizationMatch(input, organization);
    if (matchedBy)
      return {
        held: true,
        reason: relationshipViaReason(organization.name),
        matchedBy,
      };
  }

  const text = words(input.bio);
  for (const contact of registry.contacts) {
    if (mentions(text, contact.name))
      return {
        held: true,
        reason: relationshipViaReason(contact.name),
        matchedBy: 'contact_name',
      };
  }

  return null;
}

/**
 * Relationship tags for an artist who stays eligible for outreach (`note`
 * organizations). Shown on the lead, the draft and the approval view; never
 * a hold. Empty when nothing matched.
 */
export function existingRelationshipNotes(
  input: ExistingRelationshipInput,
  registry: ExistingRelationshipRegistry = EXISTING_RELATIONSHIPS
): string[] {
  return registry.organizations
    .filter(
      organization =>
        organization.kind === 'note' &&
        organizationMatch(input, organization) !== null
    )
    .map(
      organization => organization.note ?? `Relationship: ${organization.name}`
    );
}
