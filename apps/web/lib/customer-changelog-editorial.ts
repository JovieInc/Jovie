/**
 * Editorial overlay for the customer changelog.
 *
 * Publication receipts in CHANGELOG.md stay the authority for what shipped and
 * for the approved sentence. This overlay only adds what a receipt cannot
 * carry: a short outcome headline, an optional lead when the approved sentence
 * went stale, a withdrawal switch, and one feature visual. It is keyed by the
 * permanent `entryId`, applied inside the projection, so the page, the feeds,
 * date pages and What's New read the same headline.
 */

import { z } from 'zod';
import overlaySource from '@/data/customer-changelog-editorial.json';

export const CUSTOMER_CHANGELOG_HEADLINE_MAX = 60;

const TITLE_CASE_MIN_WORDS = 4;

/**
 * Sentence case: a capital (or digit) first, and the rest not Title Case.
 * Proper nouns and acronyms are fine; a headline whose words are mostly
 * capitalised is not.
 */
export function isSentenceCaseHeadline(headline: string): boolean {
  if (!/^[\p{Lu}\p{N}]/u.test(headline)) return false;
  const rest = headline
    .split(/\s+/)
    .slice(1)
    .filter(word => /^\p{L}/u.test(word) && !/^\p{Lu}+$/u.test(word));
  if (rest.length + 1 < TITLE_CASE_MIN_WORDS) return true;
  const capitalised = rest.filter(word => /^\p{Lu}/u.test(word)).length;
  return capitalised * 2 <= rest.length;
}

/** Every reason a headline breaks the rule; empty when it is compliant. */
export function customerChangelogHeadlineProblems(headline: string): string[] {
  const problems: string[] = [];
  if (!headline.trim()) return ['is empty'];
  if (headline !== headline.trim()) problems.push('has surrounding whitespace');
  if (headline.length > CUSTOMER_CHANGELOG_HEADLINE_MAX) {
    problems.push(
      `is ${headline.length} characters (max ${CUSTOMER_CHANGELOG_HEADLINE_MAX})`
    );
  }
  if (/[.!:;,]$/.test(headline.trim())) {
    problems.push('ends with punctuation');
  }
  if (/[\r\n<>]/.test(headline)) problems.push('contains markup or a newline');
  if (!isSentenceCaseHeadline(headline.trim())) {
    problems.push('is not sentence case');
  }
  return problems;
}

const HeadlineSchema = /* @__PURE__ */ (() =>
  z.string().superRefine((value, context) => {
    for (const problem of customerChangelogHeadlineProblems(value)) {
      context.addIssue({ code: 'custom', message: `headline ${problem}` });
    }
  }))();

export const CustomerChangelogEditorialEntrySchema = /* @__PURE__ */ (() =>
  z
    .object({
      headline: HeadlineSchema.optional(),
      lead: z
        .string()
        .min(1)
        .max(400)
        .regex(/^[\p{Lu}\p{N}]/u, 'lead starts with a capital')
        .regex(/^[^\r\n<>]+$/, 'lead is one plain line')
        .optional(),
      hide: z.literal(true).optional(),
      /** Why an entry was withdrawn. A maintainer note; never rendered. */
      reason: z.string().min(1).max(200).optional(),
      media: z
        .object({
          kind: z.enum(['image', 'video']),
          src: z
            .string()
            .regex(
              /^\/images\/changelog\/[a-z0-9][a-z0-9/_-]*\.(?:png|jpg|webp|avif|mp4|webm)$/,
              'media lives under /images/changelog/'
            ),
          alt: z.string().min(1).max(200),
        })
        .strict()
        .optional(),
    })
    .strict()
    .refine(entry => entry.hide === true || Boolean(entry.headline), {
      message: 'an entry needs a headline or hide: true',
    })
    .refine(
      entry =>
        entry.hide === true
          ? Boolean(entry.reason) &&
            !entry.headline &&
            !entry.lead &&
            !entry.media
          : !entry.reason,
      { message: 'a hidden entry carries a reason and nothing else' }
    ))();

export type CustomerChangelogEditorialEntry = z.infer<
  typeof CustomerChangelogEditorialEntrySchema
>;

export const CustomerChangelogEditorialSchema = /* @__PURE__ */ (() =>
  z
    .object({
      schema: z.literal('customer-changelog-editorial/v1'),
      entries: z.record(
        z.string().min(1),
        CustomerChangelogEditorialEntrySchema
      ),
    })
    .strict())();

export type CustomerChangelogEditorial = Readonly<
  Record<string, CustomerChangelogEditorialEntry>
>;

let parsed: CustomerChangelogEditorial | null = null;

/** The committed overlay, validated once. A malformed file fails the build. */
export function readCustomerChangelogEditorial(): CustomerChangelogEditorial {
  parsed ??= Object.freeze(
    CustomerChangelogEditorialSchema.parse(overlaySource).entries
  );
  return parsed;
}

/** The overlay every customer surface applies. */
export function resolveCustomerChangelogEditorial(): CustomerChangelogEditorial {
  return readCustomerChangelogEditorial();
}
