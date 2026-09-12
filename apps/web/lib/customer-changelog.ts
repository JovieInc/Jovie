/**
 * Customer changelog projection (JOV-6203 Wave 1).
 *
 * Invariant: deployment ≠ changelog entry. CHANGELOG.md remains the
 * engineering release log. This module projects public bullets into
 * customer-outcome objects for `/changelog`. Version pages + RSS/JSON
 * keep the raw release parser.
 *
 * Schema fields seed later RSS/JSON / in-app What’s new parity. Wave 1
 * does not rewire those surfaces.
 */

import { z } from 'zod';
import {
  type ChangelogRelease,
  type ChangelogSection,
  changelogInlineText,
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
  title: z.string().min(1),
  slug: z.string().min(1),
  date: z.string(),
  summary: z.string(),
  category: z.enum(CUSTOMER_CHANGELOG_CATEGORIES),
  capabilities: z.array(z.string()),
  surfaces: z.array(z.string()),
  availability: z.enum(CUSTOMER_CHANGELOG_AVAILABILITY),
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

function slugify(title: string, version: string, index: number): string {
  const base =
    title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 48) || 'update';
  return `${base}-v${version.replaceAll('.', '-')}-${index}`;
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
  const versionLabel = `v${version}`;
  return formattedDate ? `${formattedDate} · ${versionLabel}` : versionLabel;
}

export function projectCustomerChangelog(
  releases: readonly ChangelogRelease[]
): CustomerChangelogEntry[] {
  const entries: CustomerChangelogEntry[] = [];

  for (const release of releases) {
    let index = 0;
    for (const section of SECTION_ORDER) {
      for (const bullet of release.sections[section]) {
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
            title,
            slug: slugify(title, release.version, index),
            date: release.date,
            summary,
            category: SECTION_CATEGORY[section],
            capabilities: inferCapabilities(haystack),
            surfaces: inferSurfaces(haystack),
            availability: 'ga',
            media: null,
            technicalVersion: release.version,
            explanation,
            supporting: [],
            technical,
            prominence: SECTION_PROMINENCE[section],
          })
        );
        index += 1;
      }
    }
  }

  return entries;
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
