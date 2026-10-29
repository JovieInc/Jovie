import { lintCopy } from '@jovie/copy';
import { z } from 'zod';
import { isNavigationEligiblePath } from '@/data/marketing/featureAvailability';
import type { ContentKindDefinition } from './kind';
import {
  DEFAULT_SITE_CHROME,
  isExternalChromeHref,
} from './site-chrome.defaults';

export {
  DEFAULT_SITE_CHROME,
  isExternalChromeHref,
} from './site-chrome.defaults';
export {
  type ResolvedSiteChrome,
  toResolvedSiteChrome,
} from './site-chrome.resolve';

/**
 * Site chrome: the header navigation and the site footer as one content
 * record (`site-chrome/main`). Changing a label, a link, a column, or the
 * order of any of them is a publish, not a deploy.
 *
 * Copy field paths are stable and readable on purpose; the copy inventory
 * keys its ids on them. Every column and link has a slug `id`, and the id,
 * not the array index, is what a path names:
 *
 *   footer.<columnId>.title
 *   footer.<columnId>.<linkId>.label
 *   nav.<linkId>.label
 *
 * What is NOT data here, on purpose:
 * - Layout, spacing, and styling. The footer and header components own them.
 * - Whether a destination is public. Every internal href must clear the
 *   route availability policy (`isNavigationEligiblePath`) AND stay off the
 *   dead-end / internal list below, so a record cannot link a stub, a
 *   developer tool, or an unlaunched page.
 * - The legal row and copyright. They are legal text, owned by code.
 */

const SITE_CHROME_SCHEMA_VERSION = 1;

/**
 * Destinations that must not appear in public chrome even if they exist.
 * Each carries the reason so a rejected publish explains itself.
 */
export const CHROME_BLOCKED_PATHS: Readonly<Record<string, string>> = {
  '/card': 'Jovie Card has no live page (dead end)',
  '/demovideo': 'the product demo has no video (dead end)',
  '/compare': 'near-empty comparison index (dead end)',
  '/alternatives': 'near-empty alternatives index (dead end)',
  '/launch': 'internal release-system page',
  '/product/isrc': 'internal tooling, not a public product',
  '/product/utm-links': 'internal tooling, not a public product',
  '/product/dsp-links': 'duplicate of Smart links',
  '/product/command-palette': 'internal tooling, not a public product',
  '/cli': 'developer tooling; link Developers instead',
  '/engineering': 'internal engineering blog',
  '/ai': 'internal positioning page',
  '/artists': 'duplicate of Artist profiles',
};

const EXTERNAL_HOSTS: ReadonlySet<string> = new Set([
  'instagram.com',
  'www.instagram.com',
  'x.com',
  'www.x.com',
  'tiktok.com',
  'www.tiktok.com',
  'youtube.com',
  'www.youtube.com',
]);

/** Words that keep their capital in sentence case. */
const PROPER_NOUNS: ReadonlySet<string> = new Set([
  'Jovie',
  'Instagram',
  'TikTok',
  'YouTube',
  'Spotify',
  'Apple',
  'X',
  'DMCA',
  'FAQ',
  'API',
  'iOS',
  'macOS',
]);

const slugId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug')
  .max(32);

const label = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(value => !/[\n\r<>]/.test(value), 'Single line, no markup');

const LinkSchema = z
  .object({
    id: slugId,
    label: label(24),
    href: z.string().trim().min(1).max(200),
  })
  .strict();

const ColumnSchema = z
  .object({
    id: slugId,
    title: label(16),
    links: z.array(LinkSchema).min(2).max(8),
  })
  .strict();

export const SiteChromeSchema = z
  .object({
    nav: z
      .object({
        /** Header links, in order. */
        primary: z.array(LinkSchema).min(1).max(4),
        /** The Customers flyout in the header. */
        customers: z.array(LinkSchema).min(1).max(6),
      })
      .strict(),
    footer: z
      .object({
        columns: z.array(ColumnSchema).min(3).max(4),
        /** Quiet bottom row beside the copyright line. Privacy and Terms are required. */
        legal: z.array(LinkSchema).min(2).max(5),
      })
      .strict(),
  })
  .strict();

export type SiteChrome = z.infer<typeof SiteChromeSchema>;
export type SiteChromeLink = z.infer<typeof LinkSchema>;
export type SiteChromeColumn = z.infer<typeof ColumnSchema>;

export const SITE_CHROME_KEYS = ['main'] as const;

/** Listing gate: reviewers check that the footer links both. */
export const REQUIRED_LEGAL_HREFS = ['/legal/privacy', '/legal/terms'] as const;

export const FOOTER_LINK_BUDGET = { min: 8, max: 16 } as const;

export function sentenceCaseViolation(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  for (const [index, word] of words.entries()) {
    const bare = word.replace(/[^A-Za-z0-9]/g, '');
    if (!bare || PROPER_NOUNS.has(bare) || /^I(?:['\u2019]|$)/.test(word)) {
      continue;
    }
    if (index === 0) {
      if (/^[a-z]/.test(bare)) return 'start with a capital letter';
      continue;
    }
    if (/^[A-Z]/.test(bare)) {
      return `"${bare}" is capitalised mid-label (sentence case)`;
    }
  }
  return null;
}

export function hrefViolation(href: string): string | null {
  if (isExternalChromeHref(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return 'is not a valid URL';
    }
    if (url.protocol !== 'https:') return 'external links must use https';
    if (!EXTERNAL_HOSTS.has(url.hostname)) {
      return `external host "${url.hostname}" is not an approved social profile`;
    }
    return null;
  }
  if (!href.startsWith('/') || href.startsWith('//')) {
    return 'must be an absolute path or an https social link';
  }
  const path = href.split(/[?#]/u)[0]?.replace(/\/+$/, '') || '/';
  const blocked = CHROME_BLOCKED_PATHS[path];
  if (blocked) return `${path} is not allowed in site chrome: ${blocked}`;
  if (!isNavigationEligiblePath(path)) {
    return `${path} is not navigable under the feature availability policy`;
  }
  return null;
}

function linkViolations(
  link: SiteChromeLink,
  path: string,
  seenHrefs: Set<string>
): string[] {
  const errors: string[] = [];
  const casing = sentenceCaseViolation(link.label);
  if (casing) errors.push(`${path}.label: ${casing}`);
  const lint = lintCopy(link.label, { register: 'jovie-marketing' });
  for (const finding of lint.blocking) {
    errors.push(`${path}.label: ${finding.rule}: ${finding.message}`);
  }
  const bad = hrefViolation(link.href);
  if (bad) errors.push(`${path}.href: ${bad}`);
  if (seenHrefs.has(link.href)) {
    errors.push(`${path}.href: ${link.href} appears twice in the footer`);
  }
  seenHrefs.add(link.href);
  return errors;
}

export function siteChromeViolations(chrome: SiteChrome): string[] {
  const errors: string[] = [];
  const navHrefs = new Set<string>();
  for (const group of ['primary', 'customers'] as const) {
    chrome.nav[group].forEach(link => {
      errors.push(...linkViolations(link, `nav.${link.id}`, navHrefs));
    });
  }

  const footerHrefs = new Set<string>();
  const columnIds = new Set<string>();
  let total = 0;
  for (const column of chrome.footer.columns) {
    if (columnIds.has(column.id)) {
      errors.push(`footer.${column.id}: column id appears twice`);
    }
    columnIds.add(column.id);
    const titleCasing = sentenceCaseViolation(column.title);
    if (titleCasing) errors.push(`footer.${column.id}.title: ${titleCasing}`);
    const ids = new Set<string>();
    for (const link of column.links) {
      if (ids.has(link.id)) {
        errors.push(`footer.${column.id}.${link.id}: link id appears twice`);
      }
      ids.add(link.id);
      total += 1;
      errors.push(
        ...linkViolations(link, `footer.${column.id}.${link.id}`, footerHrefs)
      );
    }
  }
  const legalHrefs = new Set<string>();
  for (const link of chrome.footer.legal) {
    errors.push(...linkViolations(link, `footer.legal.${link.id}`, legalHrefs));
  }
  for (const required of REQUIRED_LEGAL_HREFS) {
    if (!legalHrefs.has(required)) {
      errors.push(
        `footer.legal: must link ${required} (marketplace listing requirement)`
      );
    }
  }
  if (total < FOOTER_LINK_BUDGET.min || total > FOOTER_LINK_BUDGET.max) {
    errors.push(
      `footer: ${total} links; keep it between ${FOOTER_LINK_BUDGET.min} and ${FOOTER_LINK_BUDGET.max}`
    );
  }
  return errors;
}

export const SITE_CHROME_KIND: ContentKindDefinition<SiteChrome> = {
  kind: 'site-chrome',
  schemaVersion: SITE_CHROME_SCHEMA_VERSION,
  schema: SiteChromeSchema,
  keys: SITE_CHROME_KEYS,
  defaultRecord: () => DEFAULT_SITE_CHROME,
  validate: chrome => siteChromeViolations(chrome),
  // The chrome renders on every marketing page through the shared shell, so
  // revalidate the layout tree rather than naming routes.
  livePaths: () => ['/'],
};
