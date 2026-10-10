/**
 * Customer changelog projection (JOV-6203 Wave 1).
 *
 * Invariant: deployment ≠ changelog entry. CHANGELOG.md keeps engineering
 * history; exact reviewed copy from verified publication receipts feeds
 * `/changelog`, customer feeds, and What's New. Version pages preserve the
 * technical record and dates. Unknown rollout scope never becomes GA.
 */

import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { isCustomerCopy } from './changelog-filter-rules';
import {
  type ChangelogRelease,
  type ChangelogSection,
  changelogInlineText,
  changelogVersionLabel,
  isDailyChangelogKey,
} from './changelog-parser';

export const CUSTOMER_CHANGELOG_CATEGORIES = [
  'new',
  'improved',
  'fixed',
  'removed',
] as const;

export type CustomerChangelogCategory =
  (typeof CUSTOMER_CHANGELOG_CATEGORIES)[number];

export const CUSTOMER_CHANGELOG_CATEGORY_LABELS = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
  removed: 'Removed',
} as const satisfies Record<CustomerChangelogCategory, string>;

export const CUSTOMER_CHANGELOG_PROMINENCE = [
  'featured',
  'medium',
  'small',
] as const;

export type CustomerChangelogProminence =
  (typeof CUSTOMER_CHANGELOG_PROMINENCE)[number];

export const CUSTOMER_CHANGELOG_AVAILABILITY = [
  'ga',
  'preview',
  'limited',
  'unverified',
] as const;

export type CustomerChangelogAvailability =
  (typeof CUSTOMER_CHANGELOG_AVAILABILITY)[number];

export const CustomerChangelogMediaSchema = z
  .object({
    kind: z.enum(['image', 'video']),
    src: z.string().min(1),
    alt: z.string(),
  })
  .nullable();

export const CustomerChangelogEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  date: z.string(),
  summary: z.string(),
  category: z.enum(CUSTOMER_CHANGELOG_CATEGORIES),
  capabilities: z.array(z.string()),
  surfaces: z.array(z.string()),
  availability: z.enum(CUSTOMER_CHANGELOG_AVAILABILITY),
  prerequisites: z.array(z.string()).optional(),
  action: z
    .object({
      label: z.string().min(1),
      href: z.string().min(1),
    })
    .nullable(),
  media: CustomerChangelogMediaSchema,
  technicalVersion: z.string().min(1),
  explanation: z.string(),
  supporting: z.array(z.string()),
  technical: z.array(z.string()),
  prominence: z.enum(CUSTOMER_CHANGELOG_PROMINENCE),
});

export type CustomerChangelogEntry = z.infer<
  typeof CustomerChangelogEntrySchema
>;

export const CustomerChangelogTombstoneSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  aliases: z.array(z.string().min(1)),
});

export type CustomerChangelogTombstone = z.infer<
  typeof CustomerChangelogTombstoneSchema
>;

export type CustomerChangelogProjection = {
  readonly entries: readonly CustomerChangelogEntry[];
  readonly tombstones: readonly CustomerChangelogTombstone[];
};

export type CustomerChangelogMonthGroup = {
  readonly monthKey: string;
  readonly label: string;
  readonly entries: readonly CustomerChangelogEntry[];
};

const SECTION_CATEGORY: Record<
  keyof ChangelogSection,
  CustomerChangelogCategory
> = {
  featured: 'new',
  added: 'new',
  changed: 'improved',
  fixed: 'fixed',
  removed: 'removed',
};

const SECTION_PROMINENCE: Record<
  keyof ChangelogSection,
  CustomerChangelogProminence
> = {
  featured: 'featured',
  added: 'medium',
  changed: 'small',
  fixed: 'small',
  removed: 'small',
};

const SECTION_ORDER = [
  'featured',
  'added',
  'changed',
  'fixed',
  'removed',
] as const satisfies readonly (keyof ChangelogSection)[];

const LEVEL3_TOKEN_RE =
  /\bJOV-\d+\b|\bRedis\b|\badmission\b|\bsynthetic identit(?:y|ies)\b|#\d{4,}/gi;

const LEVEL3_PAREN_RE = /\s*\((?:JOV-\d+|\s*#\d{4,})[^)]*\)/g;

const SURFACE_HINTS = [
  { match: /\biphone\b|\bios\b/i, surface: 'ios' },
  { match: /\bmac\b|\bmacos\b/i, surface: 'macos' },
  { match: /\bweb\b/i, surface: 'web' },
] as const;

const CAPABILITY_HINTS = [
  { match: /\blibrary\b/i, capability: 'library' },
  { match: /\bchat\b/i, capability: 'chat' },
  { match: /\bprofile/i, capability: 'profiles' },
  { match: /\bpresence\b/i, capability: 'presence' },
  { match: /\binbox\b|\bbrand deal/i, capability: 'inbox' },
  { match: /\baudience\b/i, capability: 'audience' },
] as const;

function uniqueHints(
  text: string,
  hints: readonly { readonly match: RegExp; readonly value: string }[]
): string[] {
  const found: string[] = [];
  for (const hint of hints) {
    if (hint.match.test(text) && !found.includes(hint.value)) {
      found.push(hint.value);
    }
  }
  return found;
}

export function extractCustomerChangelogTechnical(text: string): {
  readonly clean: string;
  readonly technical: readonly string[];
} {
  const technical = [
    ...new Set(
      [...text.matchAll(LEVEL3_TOKEN_RE)]
        .map(match => match[0] ?? '')
        .filter(Boolean)
    ),
  ];
  const clean = text
    .replaceAll(LEVEL3_PAREN_RE, '')
    .replaceAll(/\s{2,}/g, ' ')
    .trim();
  return { clean: clean || text.trim(), technical };
}

export function splitCustomerChangelogOutcome(entry: string): {
  readonly title: string;
  readonly explanation: string;
} {
  const text = changelogInlineText(entry).trim();
  const colon = /^(.+?):\s+(.+)$/s.exec(text);
  if (colon?.[1] && colon[2] && colon[1].length <= 140) {
    return { title: colon[1].trim(), explanation: colon[2].trim() };
  }
  const dash = /^(.+?)\s+[—–]\s+(.+)$/s.exec(text);
  if (dash?.[1] && dash[2] && dash[1].length <= 140) {
    return { title: dash[1].trim(), explanation: dash[2].trim() };
  }
  return { title: text, explanation: '' };
}

function inferCapabilities(text: string): string[] {
  return uniqueHints(
    text,
    CAPABILITY_HINTS.map(hint => ({
      match: hint.match,
      value: hint.capability,
    }))
  );
}

function inferSurfaces(text: string): string[] {
  return uniqueHints(
    text,
    SURFACE_HINTS.map(hint => ({ match: hint.match, value: hint.surface }))
  );
}

function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const date = new Date(`${match[1]}-${match[2]}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatCustomerChangelogDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatCustomerChangelogTertiary(
  date: string,
  version: string
): string {
  const formattedDate = formatCustomerChangelogDate(date);
  // A daily digest is already dated by its key; no version suffix.
  if (isDailyChangelogKey(version)) return formattedDate || version;
  const versionLabel = changelogVersionLabel(version);
  return formattedDate ? `${formattedDate} · ${versionLabel}` : versionLabel;
}

export function projectCustomerChangelog(
  releases: readonly ChangelogRelease[]
): CustomerChangelogEntry[] {
  return [...projectCustomerChangelogArchive(releases).entries];
}

function publicationQueueKey(section: keyof ChangelogSection, summary: string) {
  return `${section}\u0000${summary}`;
}

function assertUniqueCustomerPermalinks(
  entries: readonly CustomerChangelogEntry[],
  tombstones: readonly CustomerChangelogTombstone[]
): void {
  const identities = new Set<string>();
  const fragments = new Map<string, string>();

  for (const item of [...entries, ...tombstones]) {
    if (identities.has(item.id)) {
      throw new Error(`Customer changelog identity collision: ${item.id}`);
    }
    identities.add(item.id);
    for (const fragment of [item.slug, ...item.aliases]) {
      const owner = fragments.get(fragment);
      if (owner) {
        throw new Error(
          `Customer changelog permalink collision: ${fragment} (${owner}, ${item.id})`
        );
      }
      fragments.set(fragment, item.id);
    }
  }
}

export function projectCustomerChangelogArchive(
  releases: readonly ChangelogRelease[]
): CustomerChangelogProjection {
  const entries: CustomerChangelogEntry[] = [];
  const tombstones: CustomerChangelogTombstone[] = [];

  for (const release of releases) {
    const publications = release.customerOutcomes ?? [];
    const queues = new Map<
      string,
      NonNullable<ChangelogRelease['customerOutcomes']>
    >();
    for (const publication of publications) {
      const key = publicationQueueKey(publication.section, publication.summary);
      const queue = queues.get(key) ?? [];
      queue.push(publication);
      queues.set(key, queue);
    }
    const projected = new Set<string>();

    for (const section of SECTION_ORDER) {
      for (const bullet of release.sections[section]) {
        const publication = queues
          .get(publicationQueueKey(section, bullet))
          ?.shift();
        // The technical release log is not a customer-publication authority.
        if (!publication || !isCustomerCopy(bullet)) {
          continue;
        }
        projected.add(publication.entryId);
        const { title: rawTitle, explanation: rawExplanation } =
          splitCustomerChangelogOutcome(bullet);
        const titleParts = extractCustomerChangelogTechnical(rawTitle);
        const explanationParts =
          extractCustomerChangelogTechnical(rawExplanation);
        const title = titleParts.clean;
        if (!title) continue;

        const technical = [
          ...new Set([...titleParts.technical, ...explanationParts.technical]),
        ];
        const explanation = explanationParts.clean;
        const summary = explanation || title;
        const haystack = `${title} ${explanation}`;

        entries.push(
          CustomerChangelogEntrySchema.parse({
            id: publication.entryId,
            title,
            slug: publication.slug,
            aliases: publication.aliases,
            date: release.date,
            summary,
            category: SECTION_CATEGORY[section],
            capabilities: inferCapabilities(haystack),
            surfaces: inferSurfaces(haystack),
            availability: publication.availability,
            prerequisites: publication.prerequisites,
            action: publication.action ?? null,
            media: null,
            technicalVersion: release.version,
            explanation,
            supporting: publication.supporting ?? [],
            technical,
            prominence: SECTION_PROMINENCE[section],
          })
        );
      }
    }

    for (const publication of publications) {
      if (projected.has(publication.entryId)) continue;
      tombstones.push(
        CustomerChangelogTombstoneSchema.parse({
          id: publication.entryId,
          slug: publication.slug,
          aliases: publication.aliases,
        })
      );
    }
  }

  assertUniqueCustomerPermalinks(entries, tombstones);
  return { entries, tombstones };
}

function normalizeCustomerFragment(fragment: string): string {
  const value = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveCustomerChangelogFragment(
  projection: CustomerChangelogProjection,
  fragment: string
):
  | { readonly status: 'published'; readonly entry: CustomerChangelogEntry }
  | {
      readonly status: 'unpublished';
      readonly tombstone: CustomerChangelogTombstone;
    }
  | { readonly status: 'not-found' } {
  const normalized = normalizeCustomerFragment(fragment);
  const entry = projection.entries.find(item =>
    [item.slug, ...item.aliases].includes(normalized)
  );
  if (entry) return { status: 'published', entry };
  const tombstone = projection.tombstones.find(item =>
    [item.slug, ...item.aliases].includes(normalized)
  );
  return tombstone
    ? { status: 'unpublished', tombstone }
    : { status: 'not-found' };
}

export function customerChangelogEntryPath(
  entry: Pick<CustomerChangelogEntry, 'slug'>
): string {
  return `${APP_ROUTES.CHANGELOG}#${encodeURIComponent(entry.slug)}`;
}

export function groupCustomerChangelogByMonth(
  entries: readonly CustomerChangelogEntry[]
): CustomerChangelogMonthGroup[] {
  const groups = new Map<string, CustomerChangelogEntry[]>();

  for (const entry of entries) {
    const monthKey = /^\d{4}-\d{2}/.test(entry.date)
      ? entry.date.slice(0, 7)
      : 'undated';
    const list = groups.get(monthKey) ?? [];
    list.push(entry);
    groups.set(monthKey, list);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, monthEntries]) => ({
      monthKey,
      label: formatMonthLabel(monthKey),
      entries: monthEntries,
    }));
}
