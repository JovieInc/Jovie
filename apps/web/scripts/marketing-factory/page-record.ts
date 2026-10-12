/**
 * Factory run artifacts -> JOV-7275 PageRecord (data/marketing/factory/
 * pageRecord.ts). Render writes the record with no trust score; publish
 * rewrites it with the red-team score and every stage digest. Section
 * requests, the media plan and the asset manifest have no record fields;
 * they stay in the run and are bound by their digests in `receipts`.
 *
 * Renderer keys come from the /solutions renderer map (via the data-only
 * SOLUTIONS_SECTION_KEYS), one per canonical section, and the
 * record is held to the same checks as assertRenderableSolutionsRecord:
 * claims resolve, copy resolves, and every section has a renderer. Narrative
 * ids stay in `instanceId`, the namespace for record-owned copy and media, so
 * repeated canonical sections share a renderer without sharing content.
 */

import { HERO_DECISION_TABLE } from '../../data/marketing/factory/heroDecision';
import {
  findUnresolvedRecordClaims,
  type PageRecordInput,
  PageRecordSchema,
  pageRecordPath,
  resolvePageCopy,
} from '../../data/marketing/factory/pageRecord';
import { assignSolutionsSectionKeys } from '../../data/marketing/factory/solutionsSectionKeys';
import { FACTORY_STAGES } from '../../data/marketing/factory/spine';
import { MARKETING_PEN_CONTRACT_IDS } from '../../data/marketing/penContracts';
import { listProductTruthClaims } from '../../data/product-truth/claims';
import { getMarketingExportImage } from '../../lib/screenshots/registry';
import { generatedFactoryMedia } from './generated-media';
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
  const generated = generatedFactoryMedia(ctx);
  const recipeId = artifactOf(ctx, 'layout').recipeId;
  const layoutSections = artifactOf(ctx, 'layout').sections;
  const sections = artifactOf(ctx, 'narrative').sections;
  const rendererKeys = assignSolutionsSectionKeys(
    sections.map(section => section.sectionId)
  );
  const layoutIssues: string[] = [];
  if (layoutSections.length !== sections.length) {
    layoutIssues.push(
      `layout has ${layoutSections.length} sections but narrative has ${sections.length}`
    );
  }
  sections.forEach((section, index) => {
    const selected = layoutSections[index];
    if (!selected) return;
    if (selected.sectionInstanceId !== section.sectionInstanceId) {
      layoutIssues.push(
        `layout section ${index} instance ${selected.sectionInstanceId ?? '(missing)'} does not match narrative instance ${section.sectionInstanceId}`
      );
    }
    if (selected.sectionId !== section.sectionId) {
      layoutIssues.push(
        `layout section ${index} id ${selected.sectionId} does not match narrative section ${section.sectionId}`
      );
    }
  });
  const unrendered = sections
    .filter((_, index) => rendererKeys[index] === null)
    .map(section => `no solutions renderer for ${section.sectionId}`);

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
      sections: sections.map((section, index) => {
        const selected = layoutSections[index];
        return {
          renderer: rendererKeys[index] ?? section.sectionInstanceId,
          instanceId: section.sectionInstanceId,
          sectionId: section.sectionId,
          ...(selected?.variantId ? { variantId: selected.variantId } : {}),
        };
      }),
    },
    copy: Object.fromEntries(
      slots.map(slot => [
        `${slot.sectionInstanceId}.${slot.slot}`,
        { text: slot.text },
      ])
    ),
    media: {
      ...generated.media,
      ...Object.fromEntries(
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
    },
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
      issues: [
        ...parsed.error.issues.map(
          issue => `${issue.path.join('.') || 'record'}: ${issue.message}`
        ),
        ...layoutIssues,
        ...unrendered,
        ...generated.issues,
      ],
    };
  }
  // Same checks as assertRenderableSolutionsRecord, the build gate.
  const claims = listProductTruthClaims();
  const issues = [
    ...layoutIssues,
    ...unrendered,
    ...generated.issues,
    ...findUnresolvedRecordClaims(parsed.data, claims).map(
      id => `unknown claim ${id}`
    ),
  ];
  try {
    resolvePageCopy(parsed.data, claims);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const route = pageRecordPath(parsed.data);
  if (route !== brief.route) {
    issues.push(`record routes to ${route}, brief says ${brief.route}`);
  }
  return { record: parsed.data, issues };
}
