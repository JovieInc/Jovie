import { z } from 'zod';
import type { Claim } from '@/data/product-truth/registry';
import {
  MARKETING_PEN_CONTRACT_IDS,
  type MarketingPenContractId,
} from '../penContracts';
import { MARKETING_RECIPE_IDS, type RecipeId } from '../recipes';
import { MARKETING_SECTION_IDS, type MarketingSectionId } from '../sections';
import { HERO_VARIANT_NAMES } from './heroDecision';

/**
 * Factory page records (plan §4, JOV-7275). A record is the single source a
 * family route renders from: composition, copy slots, media, SEO, and ramp
 * state. Records live at `content/pages/<family>/<slug>.ts` and export
 * `definePage(...)`, which validates at import so a bad record fails the
 * build rather than the page.
 */

export const PAGE_RECORD_FAMILIES = ['solutions'] as const;
export type PageRecordFamily = (typeof PAGE_RECORD_FAMILIES)[number];

/**
 * Ramp states. `shadow` records are not routed; `noindex` records render
 * with robots noindex; only `indexed` records enter the sitemap; `pruned`
 * records are kept for history but never routed.
 */
export const PAGE_RECORD_STATUSES = [
  'shadow',
  'noindex',
  'indexed',
  'pruned',
] as const;
export type PageRecordStatus = (typeof PAGE_RECORD_STATUSES)[number];

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const ClaimId = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);
const RoutePath = z.string().regex(/^\/[a-z0-9\-/]*$/u);
const PEN_CONTRACT_ID_VALUES = Object.values(
  MARKETING_PEN_CONTRACT_IDS
).flatMap(group => Object.values(group)) as MarketingPenContractId[];

/** Copy slot: literal text, or a product-truth claim id resolved at build. */
export const PageCopyValueSchema = z.union([
  z.strictObject({ text: z.string().trim().min(1) }),
  z.strictObject({ claimRef: ClaimId }),
]);
export type PageCopyValue = z.infer<typeof PageCopyValueSchema>;

export const PageAssetRefSchema = z.strictObject({
  kind: z.enum(['screenshot-registry', 'public-path']),
  id: z.string().min(1),
  alt: z.string().trim().min(1),
});
export type PageAssetRef = z.infer<typeof PageAssetRefSchema>;

export const PageCompositionSectionSchema = z.strictObject({
  /** Renderer key: one entry in the family renderer's closed section map. */
  renderer: Slug,
  /** Canonical section id (sections.ts) the renderer implements. */
  sectionId: z.enum(MARKETING_SECTION_IDS as [MarketingSectionId]),
});
export type PageCompositionSection = z.infer<
  typeof PageCompositionSectionSchema
>;

export const PageCompositionSchema = z.strictObject({
  recipeId: z.enum(MARKETING_RECIPE_IDS as [RecipeId]),
  penContractId: z.enum(PEN_CONTRACT_ID_VALUES as [MarketingPenContractId]),
  /** Page-scoped class hook on MarketingPageShell. */
  shellClassName: z.string().min(1).optional(),
  sections: z.array(PageCompositionSectionSchema).min(1),
});

export const PageSeoSchema = z.strictObject({
  title: z.string().trim().min(1),
  /** Open Graph and Twitter title; defaults to `title`. */
  socialTitle: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).default([]),
  /** schema.org types emitted as JSON-LD. */
  schema: z.array(z.enum(['SoftwareApplication'])).min(1),
  /** FAQ entries also rendered on the page; empty when the page has none. */
  faq: z
    .array(
      z.strictObject({
        question: z.string().trim().min(1),
        answer: z.string().trim().min(1),
      })
    )
    .default([]),
  siblings: z.array(RoutePath).default([]),
  hub: RoutePath.nullable(),
  ogImage: z.string().startsWith('/'),
});

export const PageReceiptSchema = z.strictObject({
  stage: z.string().min(1),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
});

export const PageRecordSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u),
    family: z.enum(PAGE_RECORD_FAMILIES),
    slug: Slug,
    status: z.enum(PAGE_RECORD_STATUSES),
    brief: z.strictObject({
      audience: z.string().trim().min(1),
      job: z.string().trim().min(1),
      successEvent: z.string().trim().min(1),
    }),
    claims: z.array(ClaimId).min(1),
    composition: PageCompositionSchema,
    copy: z.record(z.string().min(1), PageCopyValueSchema).default({}),
    media: z.record(z.string().min(1), PageAssetRefSchema).default({}),
    heroVariant: z.enum(HERO_VARIANT_NAMES),
    /** Proof registry ids (data/product-truth/proof.ts). */
    proof: z.array(z.string().min(1)).default([]),
    seo: PageSeoSchema,
    receipts: z.array(PageReceiptSchema).default([]),
    /** Trust score from stage 11; null until the record has been scored. */
    trust: z.number().min(0).max(1).nullable(),
    updatedAt: z.iso.date(),
  })
  .superRefine((record, ctx) => {
    if (record.id !== `${record.family}.${record.slug}`) {
      ctx.addIssue({
        code: 'custom',
        message: `id must be "${record.family}.${record.slug}"`,
        path: ['id'],
      });
    }
    const [first] = record.composition.sections;
    if (first?.sectionId !== 'hero') {
      ctx.addIssue({
        code: 'custom',
        message: 'composition must open with the hero section',
        path: ['composition', 'sections', 0],
      });
    }
    const renderers = record.composition.sections.map(s => s.renderer);
    if (new Set(renderers).size !== renderers.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'composition renderers must be unique',
        path: ['composition', 'sections'],
      });
    }
    const claimSet = new Set(record.claims);
    for (const [slot, value] of Object.entries(record.copy)) {
      if ('claimRef' in value && !claimSet.has(value.claimRef)) {
        ctx.addIssue({
          code: 'custom',
          message: `copy slot ${slot} references ${value.claimRef}, which is not in claims[]`,
          path: ['copy', slot],
        });
      }
    }
  });

export type PageRecordInput = z.input<typeof PageRecordSchema>;
export type PageRecord = z.infer<typeof PageRecordSchema>;

/** Validates a record at import time. Throws with every issue listed. */
export function definePage(input: PageRecordInput): PageRecord {
  const parsed = PageRecordSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid page record ${String(input.id)}: ${issues}`);
  }
  return parsed.data;
}

export function pageRecordPath(record: PageRecord): string {
  return `/${record.family}/${record.slug}`;
}

/** Shadow and pruned records are never routed. */
export function isRoutedPageRecord(record: PageRecord): boolean {
  return record.status === 'noindex' || record.status === 'indexed';
}

export function isIndexedPageRecord(record: PageRecord): boolean {
  return record.status === 'indexed';
}

/** Claim ids in `record.claims` that the product-truth registry lacks. */
export function findUnresolvedRecordClaims(
  record: PageRecord,
  claims: readonly Claim[]
): readonly string[] {
  const known = new Set(claims.map(claim => claim.id));
  return record.claims.filter(id => !known.has(id));
}

/**
 * Resolves every copy slot to text. Claim references read the registry
 * statement, so a product fact is written once. Throws on an unknown claim.
 */
export function resolvePageCopy(
  record: PageRecord,
  claims: readonly Claim[]
): Readonly<Record<string, string>> {
  const byId = new Map(claims.map(claim => [claim.id, claim.statement]));
  const resolved: Record<string, string> = {};
  for (const [slot, value] of Object.entries(record.copy)) {
    if ('text' in value) {
      resolved[slot] = value.text;
      continue;
    }
    const statement = byId.get(value.claimRef);
    if (statement === undefined) {
      throw new Error(
        `Page record ${record.id} copy slot ${slot} references unknown claim ${value.claimRef}`
      );
    }
    resolved[slot] = statement;
  }
  return resolved;
}
