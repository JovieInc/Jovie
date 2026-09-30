/**
 * Factory run artifacts -> JOV-7275 PageRecord (data/marketing/factory/
 * pageRecord.ts). Render writes the record with no trust score; publish
 * rewrites it with the red-team score and every stage digest. Section
 * requests, the media plan and the asset manifest have no record fields;
 * they stay in the run and are bound by their digests in `receipts`.
 *
 * Renderer keys are the narrative section instance ids. The /solutions
 * renderer map does not know them yet, so a factory record can only be
 * routed once data-driven solutions sections exist; the record stays in
 * shadow until then, and assertRenderableSolutionsRecord fails closed.
 */

import { HERO_DECISION_TABLE } from '../../data/marketing/factory/heroDecision';
import {
  type PageRecordInput,
  PageRecordSchema,
  pageRecordPath,
} from '../../data/marketing/factory/pageRecord';
import { FACTORY_STAGES } from '../../data/marketing/factory/spine';
import { MARKETING_PEN_CONTRACT_IDS } from '../../data/marketing/penContracts';
import { getMarketingExportImage } from '../../lib/screenshots/registry';
import { artifactOf, type StageContext } from './stage-kit';

const PEN_CONTRACT_BY_RECIPE: Readonly<Record<string, string>> = {
  homepage: MARKETING_PEN_CONTRACT_IDS.recipe.homepage,
  'artist-lp': MARKETING_PEN_CONTRACT_IDS.recipe.artistLp,
  feature: MARKETING_PEN_CONTRACT_IDS.recipe.feature,
};

const CAPTURE_PREFIX = 'capture:';

export function buildFactoryPageRecord(
  ctx: StageContext,
  trust: number | null
): { readonly record: unknown; readonly issues: readonly string[] } {
  const { brief } = ctx;
  const slots = artifactOf(ctx, 'copy').slots;
  const heroSection = artifactOf(ctx, 'narrative').sections[0];
  const heroSlot = (slot: string) =>
    slots.find(
      item =>
        item.sectionInstanceId === heroSection?.sectionInstanceId &&
        item.slot === slot
    )?.text ?? '';
  const refs = new Map(
    artifactOf(ctx, 'ref-sourcing').refs.map(ref => [ref.id, ref])
  );
  const captures = artifactOf(ctx, 'asset').assets.filter(asset =>
    asset.id.startsWith(CAPTURE_PREFIX)
  );
  const recipeId = artifactOf(ctx, 'layout').recipeId;

  const record = {
    id: `${brief.family}.${brief.slug}`,
    family: brief.family,
    slug: brief.slug,
    status: 'shadow',
    brief: {
      audience: brief.icp,
      job: brief.brief.businessObjective,
      successEvent: brief.brief.desiredConversion,
    },
    claims: artifactOf(ctx, 'truth').claims.map(claim => claim.id),
    composition: {
      recipeId,
      penContractId: PEN_CONTRACT_BY_RECIPE[recipeId],
      sections: artifactOf(ctx, 'narrative').sections.map(section => ({
        renderer: section.sectionInstanceId,
        sectionId: section.sectionId,
      })),
    },
    copy: Object.fromEntries(
      slots.map(slot => [
        `${slot.sectionInstanceId}.${slot.slot}`,
        { text: slot.text },
      ])
    ),
    media: Object.fromEntries(
      captures.map(asset => {
        const scenarioId = asset.id.slice(CAPTURE_PREFIX.length);
        return [
          refs.get(asset.id)?.sectionInstanceId ?? asset.id,
          {
            kind: 'screenshot-registry',
            id: scenarioId,
            alt: getMarketingExportImage(scenarioId).alt,
          },
        ];
      })
    ),
    heroVariant: HERO_DECISION_TABLE.find(
      contract => contract.penId === artifactOf(ctx, 'hero-variant').variantId
    )?.variant,
    proof: artifactOf(ctx, 'proof').items.map(item => item.registryId),
    seo: {
      title: heroSlot('headline'),
      description: heroSlot('subhead'),
      schema: brief.seo.jsonLdTypes.filter(
        type => type === 'SoftwareApplication'
      ),
      siblings: brief.seo.siblingLinks,
      hub: null,
      ogImage: captures[0]?.path ?? '/og/default.png',
    },
    receipts: FACTORY_STAGES.flatMap(stage => {
      const receipt = ctx.receipts[stage];
      return receipt ? [{ stage, digest: receipt.outputDigest }] : [];
    }),
    trust,
    updatedAt: ctx.providers.now().toISOString().slice(0, 10),
  } satisfies Record<keyof PageRecordInput, unknown>;

  const parsed = PageRecordSchema.safeParse(record);
  if (!parsed.success) {
    return {
      record,
      issues: parsed.error.issues.map(
        issue => `${issue.path.join('.') || 'record'}: ${issue.message}`
      ),
    };
  }
  const route = pageRecordPath(parsed.data);
  return {
    record: parsed.data,
    issues:
      route === brief.route
        ? []
        : [`record routes to ${route}, brief says ${brief.route}`],
  };
}
