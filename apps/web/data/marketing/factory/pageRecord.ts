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

/**
 * Language scope a record's copy speaks in (docs/marketing/LANGUAGE.md). The
 * values mirror MarketingCopyScope in pageContracts.ts. Scope is the page's
 * subject, never the visitor's identity.
 */
export const PAGE_COPY_SCOPES = [
  'shared',
  'music',
  'video',
  'editorial',
] as const;
export type PageCopyScope = (typeof PAGE_COPY_SCOPES)[number];

/**
 * Terms that only make sense on a music page. Music language belongs on the
 * artists record and music tools, never on a shared or other-audience page.
 * Ambiguous words (track, release, show, stream) are deliberately absent;
 * matching is case-insensitive, whole-word, with plural forms.
 */
export const MUSIC_ONLY_TERMS = [
  'music',
  'musician',
  'song',
  'album',
  'mixtape',
  'EP',
  'playlist',
  'pre-save',
  'presave',
  'setlist',
  'gig',
  'tour dates',
  'record label',
  'DSP',
  'Spotify',
  'Apple Music',
  'SoundCloud',
  'Bandcamp',
  'listener',
  'fan',
  'fanbase',
] as const;

/** Terms each scope may not use. Editorial follows its article's subject. */
export const SCOPE_FORBIDDEN_TERMS: Readonly<
  Record<PageCopyScope, readonly string[]>
> = {
  shared: MUSIC_ONLY_TERMS,
  music: [],
  video: MUSIC_ONLY_TERMS,
  editorial: [],
};

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

/** A same-origin file under public/, e.g. `/marketing/factory/hero.avif`. */
const PublicFilePath = z.string().regex(/^\/(?!\/)[^\s?#]+\.[a-z0-9]+$/u);

export const GENERATED_MEDIA_MIMES = [
  'image/avif',
  'image/webp',
  'image/png',
  'image/jpeg',
  'video/mp4',
  'video/webm',
] as const;
export type GeneratedMediaMime = (typeof GENERATED_MEDIA_MIMES)[number];

const GeneratedAssetRefSchema = z
  .strictObject({
    kind: z.literal('generated'),
    /** Public path of the rendered file. */
    id: PublicFilePath,
    alt: z.string().trim().min(1),
    mime: z.enum(GENERATED_MEDIA_MIMES),
    /** Intrinsic size; the slot reserves this aspect ratio (CLS 0). */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Content hash of the file, so a re-render is provably a new artifact. */
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    /** Still frame shown before a video plays. Required for video. */
    poster: PublicFilePath.optional(),
    /** WebVTT captions track. Required for video. */
    captions: z
      .string()
      .regex(/^\/(?!\/)[^\s?#]+\.vtt$/u)
      .optional(),
  })
  .superRefine((ref, ctx) => {
    const isVideo = ref.mime.startsWith('video/');
    for (const field of ['poster', 'captions'] as const) {
      if (isVideo && !ref[field]) {
        ctx.addIssue({
          code: 'custom',
          message: `generated video needs ${field}`,
          path: [field],
        });
      }
      if (!isVideo && ref[field]) {
        ctx.addIssue({
          code: 'custom',
          message: `only video takes ${field}`,
          path: [field],
        });
      }
    }
  });

/**
 * Section media. `generated` is a factory render (JOV-7765) and carries its
 * own size and content hash; the other kinds resolve size from their source.
 */
export const PageAssetRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum(['screenshot-registry', 'public-path']),
    id: z.string().min(1),
    alt: z.string().trim().min(1),
  }),
  GeneratedAssetRefSchema,
]);
export type PageAssetRef = z.infer<typeof PageAssetRefSchema>;
export type GeneratedPageAssetRef = Extract<
  PageAssetRef,
  { kind: 'generated' }
>;

export const PageCompositionSectionSchema = z.strictObject({
  /** Renderer key: one entry in the family renderer's closed section map. */
  renderer: Slug,
  /**
   * Instance namespace for record-owned copy and media. Factory records keep
   * narrative ids here while repeated sections share one generic renderer.
   */
  instanceId: Slug.optional(),
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
      /** Language scope; unknown context uses shared language. */
      copyScope: z.enum(PAGE_COPY_SCOPES).default('shared'),
      /** Scope-forbidden terms this record may still use (named exceptions). */
      allowedTerms: z.array(z.string().trim().min(1)).default([]),
      /** Extra terms this record may not use, on top of its scope. */
      forbiddenTerms: z.array(z.string().trim().min(1)).default([]),
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
    const legacyRenderers = record.composition.sections
      .filter(section => section.instanceId === undefined)
      .map(section => section.renderer);
    if (new Set(legacyRenderers).size !== legacyRenderers.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'composition renderers must be unique',
        path: ['composition', 'sections'],
      });
    }
    const instanceIds = record.composition.sections.flatMap(section =>
      section.instanceId ? [section.instanceId] : []
    );
    if (new Set(instanceIds).size !== instanceIds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'composition instance ids must be unique',
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
    for (const violation of findPageRecordTermViolations(record)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${violation.term}" is outside the ${record.brief.copyScope} copy scope`,
        path: violation.path,
      });
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

export interface PageRecordTermPolicy {
  readonly copyScope: PageCopyScope;
  /** Terms the record's copy must not contain. */
  readonly forbidden: readonly string[];
  /** Scope-forbidden terms the brief explicitly allows. */
  readonly allowed: readonly string[];
}

type TermPolicyBrief = Pick<
  PageRecord['brief'],
  'copyScope' | 'allowedTerms' | 'forbiddenTerms'
>;

/** Derives the forbidden-term list from the brief: scope terms, minus allowed, plus extra. */
export function pageRecordTermPolicy(
  brief: TermPolicyBrief
): PageRecordTermPolicy {
  const allowed = new Set(brief.allowedTerms.map(term => term.toLowerCase()));
  const forbidden = [
    ...SCOPE_FORBIDDEN_TERMS[brief.copyScope],
    ...brief.forbiddenTerms,
  ].filter(term => !allowed.has(term.toLowerCase()));
  return {
    copyScope: brief.copyScope,
    forbidden: [...new Set(forbidden)],
    allowed: brief.allowedTerms,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive matcher for a term and its plural. */
export function termPattern(term: string): RegExp {
  const body = escapeRegExp(term).replace(/\s+/g, '\\s+');
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}(?:s|es)?(?![\\p{L}\\p{N}])`,
    'iu'
  );
}

/** Forbidden terms that appear in `text`, in policy order. */
export function findForbiddenTerms(
  text: string,
  forbidden: readonly string[]
): readonly string[] {
  return forbidden.filter(term => termPattern(term).test(text));
}

export interface PageRecordTermViolation {
  readonly path: (string | number)[];
  readonly term: string;
}

type TermScannedRecord = Pick<PageRecord, 'brief' | 'copy' | 'seo'>;

/**
 * Every record-owned string (brief job, literal copy, SEO title, description,
 * keywords, FAQ) checked against the brief's term policy. Claim-backed slots
 * resolve through `claims` when given.
 */
export function findPageRecordTermViolations(
  record: TermScannedRecord,
  claims: readonly Claim[] = []
): readonly PageRecordTermViolation[] {
  const { forbidden } = pageRecordTermPolicy(record.brief);
  if (forbidden.length === 0) return [];
  const statements = new Map(claims.map(claim => [claim.id, claim.statement]));
  const fields: [(string | number)[], string | undefined][] = [
    [['brief', 'job'], record.brief.job],
    [['brief', 'successEvent'], record.brief.successEvent],
    ...Object.entries(record.copy).map(
      ([slot, value]): [(string | number)[], string | undefined] => [
        ['copy', slot],
        'text' in value ? value.text : statements.get(value.claimRef),
      ]
    ),
    [['seo', 'title'], record.seo.title],
    [['seo', 'socialTitle'], record.seo.socialTitle],
    [['seo', 'description'], record.seo.description],
    ...record.seo.keywords.map(
      (keyword, index): [(string | number)[], string] => [
        ['seo', 'keywords', index],
        keyword,
      ]
    ),
    ...record.seo.faq.flatMap(
      (entry, index): [(string | number)[], string][] => [
        [['seo', 'faq', index, 'question'], entry.question],
        [['seo', 'faq', index, 'answer'], entry.answer],
      ]
    ),
  ];
  return fields.flatMap(([path, text]) =>
    text === undefined
      ? []
      : findForbiddenTerms(text, forbidden).map(term => ({ path, term }))
  );
}
