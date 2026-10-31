import { lintCopy } from '@jovie/copy';
import { z } from 'zod';
import type { ContentKindDefinition } from './kind';
import { hrefViolation, sentenceCaseViolation } from './site-chrome';

/**
 * Page spec: a marketing page as an ordered list of design-system certified
 * sections plus meta, stored as a content record (`page-spec/<route-slug>`).
 * Content, order and section choice are data; a new section TYPE is code
 * (`components/marketing/page-spec/PageSpecSections.tsx`) and its schema here.
 *
 * The design bans live in the schema and in the one renderer, not only in
 * lint. A spec that would break one cannot be stored:
 * - no icon tiles: a feature icon is a bare glyph from an allowlist, there is
 *   no tile, badge or container option to set;
 * - no visible "Step N": step numbering, numbered titles and "first/second
 *   step" text are rejected;
 * - single-field forms are title + one microcopy line, nothing else;
 * - no stat or filler cards: numeric-only titles, thin bodies and filler
 *   words are rejected;
 * - sentence case on every title, label and question;
 * - static matte backgrounds only: `background` is an enum of two semantic
 *   surfaces, no gradient, image or motion option exists;
 * - one primary CTA per section: a section has at most one `cta` object and
 *   no secondary action field.
 *
 * Copy field paths are stable ids (`sections.<sectionId>.<field>` and
 * `sections.<sectionId>.<itemId>.<field>`); the copy inventory keys on them.
 * Prices never appear: pricing facts come from offer truth.
 */

const PAGE_SPEC_SCHEMA_VERSION = 1;

const slugId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug')
  .max(40);

const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(value => !/[\n\r<>]/.test(value), 'Single line, no markup');

const prose = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(value => !/[<>]/.test(value), 'No markup');

export const SECTION_ICONS = [
  'check',
  'link',
  'bell',
  'calendar',
  'chart',
  'credit-card',
  'globe',
  'music',
  'shield',
  'zap',
] as const;

const BACKGROUNDS = ['base', 'raised'] as const;

const Cta = z
  .object({
    label: text(28),
    href: z.string().trim().min(1).max(200),
  })
  .strict();

const ProductShot = z
  .object({
    /** Approved marketing media only. */
    src: z
      .string()
      .regex(
        /^\/(?:assets|images)\/marketing\/[a-z0-9/_.-]+\.(?:avif|webp|png|jpg)$/,
        'Use an approved marketing asset'
      ),
    alt: text(160),
  })
  .strict();

const common = {
  id: slugId,
  background: z.enum(BACKGROUNDS).default('base'),
};

const HeroSection = z
  .object({
    ...common,
    type: z.literal('hero'),
    title: text(80),
    body: prose(220),
    cta: Cta.optional(),
  })
  .strict();

const ProductShotSection = z
  .object({
    ...common,
    type: z.literal('product-shot'),
    title: text(80),
    caption: text(140).optional(),
    shot: ProductShot,
  })
  .strict();

const FeatureItem = z
  .object({
    id: slugId,
    title: text(48),
    body: prose(220, 20),
    /** A bare glyph, never a tile. */
    icon: z.enum(SECTION_ICONS).optional(),
  })
  .strict();

const FeatureListSection = z
  .object({
    ...common,
    type: z.literal('feature-list'),
    title: text(80),
    items: z.array(FeatureItem).min(2).max(6),
  })
  .strict();

const ProofQuoteSection = z
  .object({
    ...common,
    type: z.literal('proof-quote'),
    quote: prose(240, 20),
    name: text(48),
    role: text(64),
  })
  .strict();

const CtaLinkSection = z
  .object({
    ...common,
    type: z.literal('cta'),
    mode: z.literal('link'),
    title: text(80),
    body: prose(200).optional(),
    cta: Cta,
  })
  .strict();

/** Single-field form: a title and one microcopy line, nothing else. */
const CtaFormSection = z
  .object({
    ...common,
    type: z.literal('cta'),
    mode: z.literal('form'),
    title: text(80),
    microcopy: text(80),
    field: z.enum(['email', 'handle']),
    submitLabel: text(28),
  })
  .strict();

const FaqItem = z
  .object({
    id: slugId,
    question: text(120),
    answer: prose(400, 20),
  })
  .strict();

const FaqSection = z
  .object({
    ...common,
    type: z.literal('faq'),
    title: text(80),
    items: z.array(FaqItem).min(2).max(8),
  })
  .strict();

export const PageSpecSectionSchema = z.union([
  HeroSection,
  ProductShotSection,
  FeatureListSection,
  ProofQuoteSection,
  CtaLinkSection,
  CtaFormSection,
  FaqSection,
]);

export type PageSpecSection = z.infer<typeof PageSpecSectionSchema>;
export type PageSpecIcon = (typeof SECTION_ICONS)[number];

export const PageSpecSchema = z
  .object({
    meta: z
      .object({
        title: text(60),
        description: text(160),
      })
      .strict(),
    sections: z.array(PageSpecSectionSchema).min(1).max(12),
  })
  .strict();

export type PageSpec = z.infer<typeof PageSpecSchema>;

/**
 * Routes served from a page spec, keyed by record key (route slug). A route
 * joins this map in the PR that migrates it, together with its seeded
 * default in `PAGE_SPEC_DEFAULTS`. Empty until the first migration.
 */
export const PAGE_SPEC_ROUTES: Readonly<Record<string, string>> = {};
export const PAGE_SPEC_DEFAULTS: Readonly<Record<string, PageSpec>> = {};

const STEP_PATTERN =
  /\bstep\s*(?:\d+|one|two|three|four|five)\b|^\s*\d+[.):]\s|\b(?:first|second|third|fourth) step\b/i;
const FILLER_PATTERN =
  /\blorem\b|\bipsum\b|\bplaceholder\b|\bcoming soon\b|\btbd\b|\bto be announced\b|\band more\b/i;
const NUMERIC_ONLY = /^[\s$€£]*\d[\d,.]*\s*(?:%|k|m|x|\+|\/\w+)?\s*$/i;
const PRICE_PATTERN =
  /[$€£¥]|\b\d+(?:\.\d+)?\s*(?:usd|eur|gbp)\b|\/\s*(?:mo|month|yr|year)\b|\bper\s+(?:month|year)\b|\bfree\s+trial\b/i;

interface Slot {
  readonly path: string;
  readonly value: string;
  /** Headings, labels and questions: sentence case applies. */
  readonly sentence: boolean;
  readonly headline: boolean;
}

function slotsOf(section: PageSpecSection): Slot[] {
  const at = `sections.${section.id}`;
  const slot = (
    field: string,
    value: string | undefined,
    sentence: boolean,
    headline = false
  ): Slot[] =>
    value === undefined
      ? []
      : [{ path: `${at}.${field}`, value, sentence, headline }];
  switch (section.type) {
    case 'hero':
      return [
        ...slot('title', section.title, true, true),
        ...slot('body', section.body, false),
        ...slot('cta.label', section.cta?.label, true),
      ];
    case 'product-shot':
      return [
        ...slot('title', section.title, true, true),
        ...slot('caption', section.caption, false),
        ...slot('shot.alt', section.shot.alt, false),
      ];
    case 'feature-list':
      return [
        ...slot('title', section.title, true, true),
        ...section.items.flatMap(item => [
          ...slot(`${item.id}.title`, item.title, true),
          ...slot(`${item.id}.body`, item.body, false),
        ]),
      ];
    case 'proof-quote':
      return [
        ...slot('quote', section.quote, false),
        ...slot('name', section.name, false),
        ...slot('role', section.role, false),
      ];
    case 'cta':
      return section.mode === 'link'
        ? [
            ...slot('title', section.title, true, true),
            ...slot('body', section.body, false),
            ...slot('cta.label', section.cta.label, true),
          ]
        : [
            ...slot('title', section.title, true, true),
            ...slot('microcopy', section.microcopy, false),
            ...slot('submitLabel', section.submitLabel, true),
          ];
    case 'faq':
      return [
        ...slot('title', section.title, true, true),
        ...section.items.flatMap(item => [
          ...slot(`${item.id}.question`, item.question, true),
          ...slot(`${item.id}.answer`, item.answer, false),
        ]),
      ];
  }
}

function sectionViolations(section: PageSpecSection): string[] {
  const errors: string[] = [];
  const at = `sections.${section.id}`;
  for (const slot of slotsOf(section)) {
    if (STEP_PATTERN.test(slot.value)) {
      errors.push(`${slot.path}: no visible step numbering ("Step N")`);
    }
    if (FILLER_PATTERN.test(slot.value)) {
      errors.push(`${slot.path}: filler or dead-end wording`);
    }
    if (PRICE_PATTERN.test(slot.value)) {
      errors.push(
        `${slot.path}: prices and plan terms come from offer truth, not page copy`
      );
    }
    if (slot.sentence) {
      const casing = sentenceCaseViolation(slot.value.replace(/[?.!]+$/, ''));
      if (casing) errors.push(`${slot.path}: ${casing}`);
    }
    const lint = lintCopy(slot.value, {
      register: 'jovie-marketing',
      headline: slot.headline,
    });
    for (const finding of lint.blocking) {
      errors.push(`${slot.path}: ${finding.rule}: ${finding.message}`);
    }
  }
  if (section.type === 'feature-list') {
    const ids = new Set<string>();
    for (const item of section.items) {
      if (ids.has(item.id))
        errors.push(`${at}.${item.id}: item id appears twice`);
      ids.add(item.id);
      if (NUMERIC_ONLY.test(item.title) || /^\d/.test(item.title)) {
        errors.push(`${at}.${item.id}.title: stat cards are not allowed`);
      }
    }
  }
  if (section.type === 'faq') {
    for (const item of section.items) {
      if (!item.question.endsWith('?')) {
        errors.push(`${at}.${item.id}.question: end the question with "?"`);
      }
    }
  }
  const cta =
    section.type === 'hero'
      ? section.cta
      : section.type === 'cta' && section.mode === 'link'
        ? section.cta
        : undefined;
  if (cta) {
    const bad = hrefViolation(cta.href);
    if (bad) errors.push(`${at}.cta.href: ${bad}`);
  }
  return errors;
}

export function pageSpecViolations(spec: PageSpec): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  spec.sections.forEach((section, index) => {
    if (ids.has(section.id))
      errors.push(`sections.${section.id}: id appears twice`);
    ids.add(section.id);
    errors.push(...sectionViolations(section));
    if (section.type === 'hero' && index !== 0) {
      errors.push(`sections.${section.id}: the hero must come first`);
    }
    if (section.type === 'cta' && index !== spec.sections.length - 1) {
      errors.push(`sections.${section.id}: the closing cta must be last`);
    }
  });
  if (spec.sections.filter(s => s.type === 'hero').length > 1) {
    errors.push('sections: only one hero per page');
  }
  if (spec.sections.filter(s => s.type === 'cta').length > 1) {
    errors.push('sections: only one closing cta per page');
  }
  const metaLint = lintCopy(spec.meta.title, { register: 'jovie-marketing' });
  for (const finding of metaLint.blocking) {
    errors.push(`meta.title: ${finding.rule}: ${finding.message}`);
  }
  return errors;
}

export const PAGE_SPEC_KEYS: readonly string[] = Object.keys(PAGE_SPEC_ROUTES);

export const PAGE_SPEC_KIND: ContentKindDefinition<PageSpec> = {
  kind: 'page-spec',
  schemaVersion: PAGE_SPEC_SCHEMA_VERSION,
  schema: PageSpecSchema,
  keys: PAGE_SPEC_KEYS,
  defaultRecord: key => {
    const seeded = PAGE_SPEC_DEFAULTS[key];
    if (!seeded) throw new Error(`No default page spec for ${key}`);
    return seeded;
  },
  validate: spec => pageSpecViolations(spec),
  livePaths: key => {
    const path = PAGE_SPEC_ROUTES[key];
    return path ? [path] : [];
  },
};
