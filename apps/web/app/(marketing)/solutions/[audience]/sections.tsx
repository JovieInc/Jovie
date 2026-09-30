import { Fragment, type ReactNode } from 'react';
import { ArtistProfileCaptureSection } from '@/components/marketing/artist-profile/ArtistProfileCaptureSection';
import { ArtistProfileFaq } from '@/components/marketing/artist-profile/ArtistProfileFaq';
import { ArtistProfileFinalCta } from '@/components/marketing/artist-profile/ArtistProfileFinalCta';
import { ArtistProfileHeroAdaptiveIntro } from '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from '@/components/marketing/artist-profile/ArtistProfileHowItWorks';
import { ArtistProfileAnnotatedTruth } from '@/components/marketing/artist-profile/ArtistProfileLandingPage';
import { ArtistProfileOpinionatedSection } from '@/components/marketing/artist-profile/ArtistProfileOpinionatedSection';
import { ArtistProfileOutcomesCarousel } from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ArtistProfileReleaseCycleGallery } from '@/components/marketing/artist-profile/ArtistProfileSocialProof';
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell';
import { MarketingPlatformSpecBento } from '@/components/marketing/MarketingPlatformSpecBento';
import { MarketingShippedSitesShowcase } from '@/components/marketing/MarketingShippedSitesShowcase';
import {
  SolutionsRecordCta,
  SolutionsRecordFaq,
  SolutionsRecordFeatureSplit,
  SolutionsRecordHero,
} from '@/components/marketing/solutions/SolutionsRecordSections';
import { ARTIST_PROFILE_COPY as copy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS as testIds } from '@/data/artistProfilePageOrder';
import { HERO_CODE_BINDING_BY_VARIANT } from '@/data/marketing/factory/heroDecision';
import {
  findUnresolvedRecordClaims,
  type PageAssetRef,
  type PageCompositionSection,
  type PageRecord,
  resolvePageCopy,
} from '@/data/marketing/factory/pageRecord';
import { findMissingFactoryCopySlots } from '@/data/marketing/factory/solutionsSectionKeys';
import type { MarketingSectionId } from '@/data/marketing/sections';
import { listProductTruthClaims } from '@/data/product-truth/claims';
import type { Claim } from '@/data/product-truth/registry';
import { buildFaqSchema, buildSoftwareSchema } from '@/lib/constants/schemas';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import '@/components/marketing/artist-profile/ArtistProfileLandingPage.css';

export interface SolutionsSectionRenderer {
  /** Canonical section id the component implements (sections.ts). */
  readonly sectionId: MarketingSectionId;
  readonly render: (context: SolutionsSectionRenderContext) => ReactNode;
  readonly validate?: (context: SolutionsSectionRenderContext) => void;
}

interface FactoryCopyEntry {
  readonly slot: string;
  readonly text: string;
}

interface SolutionsSectionRenderContext {
  readonly record: PageRecord;
  readonly section: PageCompositionSection;
  readonly copy: readonly FactoryCopyEntry[];
  readonly media: PageAssetRef | null;
}

function sectionContext(
  record: PageRecord,
  section: PageCompositionSection,
  resolvedCopy: Readonly<Record<string, string>>
): SolutionsSectionRenderContext {
  const prefix = section.instanceId ? `${section.instanceId}.` : null;
  const sectionCopy = prefix
    ? Object.entries(resolvedCopy).flatMap(([key, text]) =>
        key.startsWith(prefix) ? [{ slot: key.slice(prefix.length), text }] : []
      )
    : [];
  return {
    record,
    section,
    copy: sectionCopy,
    media: section.instanceId
      ? (record.media[section.instanceId] ?? null)
      : null,
  };
}

/** Instance copy as `slot -> text` for the record-driven components. */
function copyBySlot(context: SolutionsSectionRenderContext) {
  return Object.fromEntries(
    context.copy.map(entry => [entry.slot, entry.text])
  );
}

function validateFactorySection(context: SolutionsSectionRenderContext) {
  const { record, section, copy: entries } = context;
  if (!section.instanceId) {
    throw new Error(
      `Page record ${record.id} factory section ${section.renderer} has no instanceId`
    );
  }
  const [missing] = findMissingFactoryCopySlots(
    [section],
    Object.fromEntries(
      entries.map(entry => [`${section.instanceId}.${entry.slot}`, entry.text])
    )
  );
  if (missing) {
    throw new Error(`Page record ${record.id} is missing copy slot ${missing}`);
  }
  if (
    section.sectionId === 'hero' &&
    HERO_CODE_BINDING_BY_VARIANT[record.heroVariant].sectionVariantId === null
  ) {
    throw new Error(
      `Page record ${record.id} hero variant ${record.heroVariant} has no code binding`
    );
  }
  if (section.sectionId === 'faq' && record.seo.faq.length === 0) {
    throw new Error(
      `Page record ${record.id} factory-faq needs seo.faq entries`
    );
  }
}

/**
 * Record-driven renderers (JOV-7284), one per section with a real
 * record-driven owner. Each emits only canonical registry variants; any
 * other `factory-*` key is absent from the map and fails the build gate.
 */
const FACTORY_SOLUTIONS_SECTION_RENDERERS = {
  'factory-hero': {
    sectionId: 'hero',
    render: context => (
      <SolutionsRecordHero
        heroVariant={context.record.heroVariant}
        copy={copyBySlot(context)}
        media={context.media ?? undefined}
      />
    ),
    validate: validateFactorySection,
  },
  'factory-feature-split': {
    sectionId: 'feature-split',
    render: context => (
      <SolutionsRecordFeatureSplit
        instanceId={context.section.instanceId ?? 'feature-split'}
        copy={copyBySlot(context)}
        media={context.media ?? undefined}
      />
    ),
    validate: validateFactorySection,
  },
  'factory-cta': {
    sectionId: 'cta',
    render: context => (
      <SolutionsRecordCta
        instanceId={context.section.instanceId ?? 'cta'}
        copy={copyBySlot(context)}
      />
    ),
    validate: validateFactorySection,
  },
  'factory-faq': {
    sectionId: 'faq',
    render: context => (
      <SolutionsRecordFaq
        heading={copyBySlot(context).heading}
        items={context.record.seo.faq}
      />
    ),
    validate: validateFactorySection,
  },
} as const satisfies Readonly<Record<string, SolutionsSectionRenderer>>;

/**
 * Closed map of section renderers a solutions record may compose. Records
 * name a key; anything outside this map fails the renderer test. Each entry
 * wraps an existing registry-bound section owner, never a one-off.
 */
const ARTIST_SOLUTIONS_SECTION_RENDERERS = {
  'artist-hero-adaptive-intro': {
    sectionId: 'hero',
    render: () => (
      <ArtistProfileHeroAdaptiveIntro
        hero={copy.hero}
        adaptive={copy.adaptive}
      />
    ),
  },
  'artist-outcomes': {
    sectionId: 'feature-grid',
    render: () => (
      <div data-testid={testIds.outcomes}>
        <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
      </div>
    ),
  },
  'artist-capture': {
    sectionId: 'capture',
    render: () => (
      <div data-testid={testIds.capture}>
        <ArtistProfileCaptureSection
          capture={copy.capture}
          id='capture-every-fan'
        />
      </div>
    ),
  },
  'artist-opinionated': {
    sectionId: 'feature-split',
    render: () => (
      <div data-testid={testIds.opinionated}>
        <ArtistProfileOpinionatedSection opinionated={copy.opinionated} />
      </div>
    ),
  },
  'artist-annotated-truth': {
    sectionId: 'feature-split',
    render: () => (
      <div data-testid={testIds.specWall}>
        <ArtistProfileAnnotatedTruth specWall={copy.specWall} />
      </div>
    ),
  },
  'shipped-sites-showcase': {
    sectionId: 'product-gallery',
    render: () => (
      <div data-testid={testIds.showcase}>
        <MarketingShippedSitesShowcase testId='artist-profile-shipped-sites-showcase' />
      </div>
    ),
  },
  'platform-spec-bento': {
    sectionId: 'spec-wall',
    render: () => (
      <div data-testid={testIds.specBento}>
        <MarketingPlatformSpecBento testId='artist-profile-platform-spec-bento' />
      </div>
    ),
  },
  'artist-how-it-works': {
    sectionId: 'how-it-works',
    render: () => (
      <div data-testid={testIds.howItWorks}>
        <ArtistProfileHowItWorks howItWorks={copy.howItWorks} />
      </div>
    ),
  },
  'artist-release-cycle': {
    sectionId: 'product-gallery',
    render: () => (
      <div data-testid={testIds.releaseCycle}>
        <ArtistProfileReleaseCycleGallery releaseCycle={copy.releaseCycle} />
      </div>
    ),
  },
  'artist-faq': {
    sectionId: 'faq',
    render: () =>
      ARTIST_PROFILE_FLAGS.FAQ ? (
        <div data-testid={testIds.faq}>
          <ArtistProfileFaq faq={copy.faq} />
        </div>
      ) : null,
  },
  'artist-final-cta': {
    sectionId: 'cta',
    render: () => (
      <div data-testid={testIds.finalCta}>
        <ArtistProfileFinalCta finalCta={copy.finalCta} />
      </div>
    ),
  },
} as const satisfies Readonly<Record<string, SolutionsSectionRenderer>>;

export const SOLUTIONS_SECTION_RENDERERS = {
  ...ARTIST_SOLUTIONS_SECTION_RENDERERS,
  ...FACTORY_SOLUTIONS_SECTION_RENDERERS,
} as const satisfies Readonly<Record<string, SolutionsSectionRenderer>>;

export type SolutionsSectionRendererKey =
  keyof typeof SOLUTIONS_SECTION_RENDERERS;

export function getSolutionsSectionRenderer(
  key: string
): SolutionsSectionRenderer | null {
  return Object.hasOwn(SOLUTIONS_SECTION_RENDERERS, key)
    ? SOLUTIONS_SECTION_RENDERERS[key as SolutionsSectionRendererKey]
    : null;
}

/** JSON-LD from `record.seo`: the declared schema types plus FAQ entries. */
export function SolutionsRecordJsonLd({
  record,
}: Readonly<{ record: PageRecord }>) {
  const { seo } = record;
  return (
    <>
      {seo.schema.includes('SoftwareApplication') ? (
        <script type='application/ld+json'>
          {buildSoftwareSchema(seo.description)}
        </script>
      ) : null}
      {seo.faq.length > 0 ? (
        <script type='application/ld+json'>{buildFaqSchema(seo.faq)}</script>
      ) : null}
    </>
  );
}

/** Page body for a solutions record: the page shell plus composed sections. */
export function SolutionsRecordBody({
  record,
}: Readonly<{ record: PageRecord }>) {
  const resolvedCopy = resolvePageCopy(record, listProductTruthClaims());
  return (
    <MarketingPageShell
      className={record.composition.shellClassName}
      penContractId={record.composition.penContractId}
    >
      {record.composition.sections.map(section => (
        <Fragment key={section.instanceId ?? section.renderer}>
          {getSolutionsSectionRenderer(section.renderer)?.render(
            sectionContext(record, section, resolvedCopy)
          )}
        </Fragment>
      ))}
    </MarketingPageShell>
  );
}

/**
 * Build-time record gate: every claim id and claim-backed copy slot must
 * resolve against the product-truth registry, and every composed section
 * must exist in the renderer map. A failure breaks the build, not the page.
 */
export function assertRenderableSolutionsRecord(
  record: PageRecord,
  claims: readonly Claim[] = listProductTruthClaims()
) {
  const unresolved = findUnresolvedRecordClaims(record, claims);
  if (unresolved.length > 0) {
    throw new Error(
      `Page record ${record.id} references unknown claims: ${unresolved.join(', ')}`
    );
  }
  const resolvedCopy = resolvePageCopy(record, claims);
  for (const section of record.composition.sections) {
    const renderer = getSolutionsSectionRenderer(section.renderer);
    if (renderer?.sectionId !== section.sectionId) {
      throw new Error(
        `Page record ${record.id} section ${section.renderer} does not render ${section.sectionId}`
      );
    }
    renderer.validate?.(sectionContext(record, section, resolvedCopy));
  }
}
