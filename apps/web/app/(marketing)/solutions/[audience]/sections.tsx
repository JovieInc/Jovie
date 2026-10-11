import Image from 'next/image';
import { Fragment, type ReactNode } from 'react';
import { HomepageEditorialFeatureSection } from '@/components/homepage/HomepageCertifiedSections';
import { ArtistProfileCaptureSection } from '@/components/marketing/artist-profile/ArtistProfileCaptureSection';
import { ArtistProfileFaq } from '@/components/marketing/artist-profile/ArtistProfileFaq';
import { ArtistProfileFinalCta } from '@/components/marketing/artist-profile/ArtistProfileFinalCta';
import { ArtistProfileHeroAdaptiveIntro } from '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from '@/components/marketing/artist-profile/ArtistProfileHowItWorks';
import { ArtistProfileAnnotatedTruth } from '@/components/marketing/artist-profile/ArtistProfileLandingPage';
import { ArtistProfileOpinionatedSection } from '@/components/marketing/artist-profile/ArtistProfileOpinionatedSection';
import { ArtistProfileOutcomesCarousel } from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ArtistProfileReleaseCycleGallery } from '@/components/marketing/artist-profile/ArtistProfileSocialProof';
import { FaqSection } from '@/components/marketing/FaqSection';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { MarketingFeatureGrid } from '@/components/marketing/MarketingFeatureGrid';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell';
import { MarketingPlatformSpecBento } from '@/components/marketing/MarketingPlatformSpecBento';
import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import { MarketingShippedSitesShowcase } from '@/components/marketing/MarketingShippedSitesShowcase';
import { MarketingTerminalCta } from '@/components/site/MarketingTerminalCta';
import { ARTIST_PROFILE_COPY as copy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS as testIds } from '@/data/artistProfilePageOrder';
import { HERO_CODE_BINDING_BY_VARIANT } from '@/data/marketing/factory/heroDecision';
import {
  findUnresolvedRecordClaims,
  type GeneratedPageAssetRef,
  type PageAssetRef,
  type PageCompositionSection,
  type PageRecord,
  resolvePageCopy,
  solutionsFactoryVariantIssue,
} from '@/data/marketing/factory/pageRecord';
import { derivePageRecordContract } from '@/data/marketing/factory/pageRecordContract';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
} from '@/data/marketing/sections';
import { listProductTruthClaims } from '@/data/product-truth/claims';
import type { Claim } from '@/data/product-truth/registry';
import { buildFaqSchema, buildSoftwareSchema } from '@/lib/constants/schemas';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
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

type FactoryRendererKey = `factory-${MarketingSectionId}`;

const REQUIRED_FACTORY_COPY_SLOTS: Partial<
  Record<MarketingSectionId, readonly string[]>
> = {
  hero: ['headline', 'subhead'],
  'feature-split': ['headline', 'body'],
  cta: ['headline'],
};

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

function slotText(
  entries: readonly FactoryCopyEntry[],
  ...names: readonly string[]
): string | undefined {
  return entries.find(entry => names.includes(entry.slot))?.text;
}

const FACTORY_MEDIA_SIZES = '(min-width: 1024px) 50vw, 100vw';

/**
 * Factory-rendered media (JOV-7765). The image or video carries the asset's
 * intrinsic width and height, which browsers map to its aspect ratio, so the
 * box is reserved before anything loads (CLS 0). Video is click-to-play
 * behind its poster, with captions, and never autoplays, which also keeps it
 * still for reduced-motion visitors. The digest attribute lets the design
 * loop prove a re-render reached the page.
 */
function FactoryGeneratedMedia({
  media,
}: Readonly<{ media: GeneratedPageAssetRef }>) {
  return (
    <div
      className='min-w-0 overflow-hidden rounded-xl border border-subtle bg-surface-0'
      data-factory-media={media.id}
      data-factory-media-digest={media.digest}
    >
      {media.mime.startsWith('video/') ? (
        <video
          className='block h-auto w-full'
          width={media.width}
          height={media.height}
          controls
          playsInline
          preload='none'
          poster={media.poster}
          aria-label={media.alt}
        >
          <source src={media.id} type={media.mime} />
          <track
            kind='captions'
            src={media.captions}
            srcLang='en'
            label='English'
            default
          />
        </video>
      ) : (
        <Image
          src={media.id}
          alt={media.alt}
          width={media.width}
          height={media.height}
          sizes={FACTORY_MEDIA_SIZES}
          className='block h-auto w-full'
        />
      )}
    </div>
  );
}

function FactorySectionMedia({
  media,
}: Readonly<{ media: PageAssetRef | null }>) {
  if (!media) return null;
  if (media.kind === 'generated')
    return <FactoryGeneratedMedia media={media} />;

  return (
    <div
      className='relative aspect-video min-w-0 overflow-hidden rounded-xl border border-subtle bg-surface-0'
      data-factory-media={media.id}
    >
      {media.kind === 'screenshot-registry' ? (
        <MarketingScreenshot
          scenarioId={media.id}
          altOverride={media.alt}
          className='h-full w-full object-contain'
        />
      ) : (
        <Image
          src={media.id}
          alt={media.alt}
          fill
          sizes={FACTORY_MEDIA_SIZES}
          className='object-contain'
        />
      )}
    </div>
  );
}

interface CopyPair {
  readonly title: string;
  readonly description: string;
}

function pairedCopy(
  entries: readonly FactoryCopyEntry[],
  first: 'title' | 'question',
  second: 'description' | 'answer'
): readonly CopyPair[] {
  const pairs = new Map<
    string,
    Partial<Record<typeof first | typeof second, string>>
  >();
  for (const entry of entries) {
    const match = entry.slot.match(
      new RegExp(`^(?:item[.-])?(\\d+)[.-](${first}|${second})$`, 'u')
    );
    if (!match?.[1] || !match[2]) continue;
    const pair = pairs.get(match[1]) ?? {};
    pair[match[2] as typeof first | typeof second] = entry.text;
    pairs.set(match[1], pair);
  }
  const directFirst = slotText(entries, first);
  const directSecond = slotText(entries, second);
  if (directFirst && directSecond) {
    pairs.set('0', { [first]: directFirst, [second]: directSecond });
  }
  return [...pairs.values()].flatMap(pair => {
    const title = pair[first];
    const description = pair[second];
    return title && description ? [{ title, description }] : [];
  });
}

function FactoryFeatureGrid({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const items = pairedCopy(context.copy, 'title', 'description');
  if (items.length === 0) {
    throw new Error(
      `Page record ${context.record.id} feature-grid ${context.section.instanceId} needs at least one title/description pair`
    );
  }

  const heading = slotText(context.copy, 'headline', 'title');
  const variantId = context.section.variantId;
  if (!variantId) {
    throw new Error(
      `Page record ${context.record.id} feature-grid ${context.section.instanceId} has no selected variantId`
    );
  }
  return (
    <section
      data-testid='marketing-section-feature-grid'
      data-marketing-section='feature-grid'
      data-marketing-owner='apps/web/app/(marketing)/solutions/[audience]/sections.tsx'
      data-marketing-variant={variantId}
      className='section-spacing-linear'
    >
      <MarketingContainer width='page'>
        {heading ? (
          <h2
            data-wrap='editorial-title'
            className='text-balance text-3xl font-semibold tracking-tight text-primary-token sm:text-4xl'
          >
            {heading}
          </h2>
        ) : null}
        <MarketingFeatureGrid items={items} />
        <FactorySectionMedia media={context.media} />
      </MarketingContainer>
    </section>
  );
}

function FactoryFaq({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const items = pairedCopy(context.copy, 'question', 'answer').map(item => ({
    question: item.title,
    answer: item.description,
  }));
  if (items.length === 0) {
    throw new Error(
      `Page record ${context.record.id} FAQ ${context.section.instanceId} needs at least one question/answer pair`
    );
  }
  const variantId = context.section.variantId;
  if (!variantId) {
    throw new Error(
      `Page record ${context.record.id} FAQ ${context.section.instanceId} has no selected variantId`
    );
  }

  return (
    <FaqSection
      sectionVariant={variantId}
      heading={slotText(context.copy, 'headline', 'title')}
      items={items}
    />
  );
}

function FactoryHero({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const binding = HERO_CODE_BINDING_BY_VARIANT[context.record.heroVariant];
  const variantId = context.section.variantId;
  if (!binding.sectionVariantId || !variantId) {
    throw new Error(
      `Page record ${context.record.id} hero variant ${context.record.heroVariant} has no selected MarketingHero binding`
    );
  }
  if (binding.sectionVariantId !== variantId) {
    throw new Error(
      `Page record ${context.record.id} hero section variant ${variantId} does not match ${context.record.heroVariant} binding ${binding.sectionVariantId}`
    );
  }
  if (variantId === 'left-none' && context.media) {
    throw new Error(
      `Page record ${context.record.id} hero ${context.section.instanceId} variant left-none cannot render media; choose a split hero variant`
    );
  }
  const contract = derivePageRecordContract(context.record);

  return (
    <MarketingHero
      headline={slotText(context.copy, 'headline') ?? ''}
      subtitle={slotText(context.copy, 'subhead') ?? ''}
      primaryCta={{
        label:
          slotText(context.copy, 'primary-cta', 'cta-label') ??
          contract.primaryCta.label,
        href: contract.primaryCta.href,
      }}
      media={
        variantId === 'split-screenshot-right' && context.media ? (
          <FactorySectionMedia media={context.media} />
        ) : undefined
      }
      logos={false}
      align={
        variantId === 'left-none' || variantId === 'split-screenshot-right'
          ? 'left'
          : 'center'
      }
      sectionVariant={variantId}
      sectionOwner='apps/web/app/(marketing)/solutions/[audience]/sections.tsx'
      testId='marketing-section-hero'
    />
  );
}

function FactoryCta({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const contract = derivePageRecordContract(context.record);
  return (
    <MarketingTerminalCta
      sectionVariant={context.section.variantId}
      title={slotText(context.copy, 'headline', 'title') ?? ''}
      body={slotText(context.copy, 'subhead', 'body')}
      ctaLabel={
        slotText(context.copy, 'primary-cta', 'cta-label') ??
        contract.primaryCta.label
      }
      ctaHref={contract.primaryCta.href}
      testId='marketing-section-cta'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.cta}
      decoration={
        context.media ? (
          <FactorySectionMedia media={context.media} />
        ) : undefined
      }
    />
  );
}

function FactoryFeatureSplit({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const { section, media } = context;
  const headline = slotText(context.copy, 'headline');
  const body = slotText(context.copy, 'body');
  if (!section.instanceId || !headline || !body) {
    throw new Error(
      `Page record ${context.record.id} feature-split ${section.instanceId ?? '(missing instance)'} requires headline and body copy`
    );
  }
  if (!media || media.kind !== 'screenshot-registry') {
    throw new Error(
      `Page record ${context.record.id} feature-split ${section.instanceId} requires a screenshot-registry capture`
    );
  }
  const preview = getMarketingExportImage(media.id);

  if (section.variantId === 'editorial') {
    return (
      <HomepageEditorialFeatureSection
        section={{ id: section.instanceId, headline, body }}
        previews={[{ image: preview }]}
      />
    );
  }
  if (section.variantId === 'phone-right') {
    return (
      <ArtistProfileOpinionatedSection
        opinionated={{ headline, body }}
        preview={preview}
        sectionOccurrence={section.instanceId}
      />
    );
  }
  throw new Error(
    `Page record ${context.record.id} has no certified feature-split renderer for variant ${section.variantId ?? '(missing)'}`
  );
}

function FactoryCanonicalSection({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  switch (context.section.sectionId) {
    case 'hero':
      return <FactoryHero context={context} />;
    case 'feature-grid':
      return <FactoryFeatureGrid context={context} />;
    case 'feature-split':
      return <FactoryFeatureSplit context={context} />;
    case 'faq':
      return <FactoryFaq context={context} />;
    case 'cta':
      return <FactoryCta context={context} />;
    default:
      throw new Error(
        `Page record ${context.record.id} has no certified solutions renderer for ${context.section.sectionId}/${context.section.variantId ?? '(missing variant)'}`
      );
  }
}

function validateFactorySection(context: SolutionsSectionRenderContext) {
  const { record, section, copy: entries } = context;
  if (!section.instanceId) {
    throw new Error(
      `Page record ${record.id} factory section ${section.renderer} has no instanceId`
    );
  }
  if (!section.variantId) {
    throw new Error(
      `Page record ${record.id} factory section ${section.renderer} has no persisted variantId`
    );
  }
  const variantIssue = solutionsFactoryVariantIssue(
    section.sectionId,
    section.variantId
  );
  if (variantIssue) {
    throw new Error(`Page record ${record.id}: ${variantIssue}`);
  }
  if (entries.length === 0) {
    throw new Error(
      `Page record ${record.id} section ${section.instanceId} has no copy slots`
    );
  }
  const required = REQUIRED_FACTORY_COPY_SLOTS[section.sectionId] ?? [];
  const slots = new Set(entries.map(entry => entry.slot));
  for (const slot of required) {
    if (!slots.has(slot)) {
      throw new Error(
        `Page record ${record.id} is missing copy slot ${section.instanceId}.${slot}`
      );
    }
  }
  if (section.sectionId === 'hero') {
    const expectedVariant =
      HERO_CODE_BINDING_BY_VARIANT[record.heroVariant].sectionVariantId;
    if (!expectedVariant || expectedVariant !== section.variantId) {
      throw new Error(
        `Page record ${record.id} hero section variant ${section.variantId} does not match ${record.heroVariant} code binding ${expectedVariant ?? '(unbound)'}`
      );
    }
    if (section.variantId === 'left-none' && context.media) {
      throw new Error(
        `Page record ${record.id} hero ${section.instanceId} variant left-none cannot render media; choose a split hero variant`
      );
    }
    if (section.variantId === 'split-screenshot-right') {
      if (!context.media || context.media.kind !== 'screenshot-registry') {
        throw new Error(
          `Page record ${record.id} hero ${section.instanceId} requires a screenshot-registry capture for split-screenshot-right`
        );
      }
      getMarketingExportImage(context.media.id);
    }
  }
  if (section.sectionId === 'feature-split') {
    if (!context.media || context.media.kind !== 'screenshot-registry') {
      throw new Error(
        `Page record ${record.id} feature-split ${section.instanceId} requires a screenshot-registry capture`
      );
    }
    getMarketingExportImage(context.media.id);
  }
  if (section.sectionId === 'feature-grid') {
    if (pairedCopy(entries, 'title', 'description').length === 0) {
      throw new Error(
        `Page record ${record.id} feature-grid ${section.instanceId} needs at least one title/description pair`
      );
    }
  }
  if (section.sectionId === 'faq') {
    if (pairedCopy(entries, 'question', 'answer').length === 0) {
      throw new Error(
        `Page record ${record.id} FAQ ${section.instanceId} needs at least one question/answer pair`
      );
    }
  }
}

const FACTORY_SOLUTIONS_SECTION_RENDERERS = Object.fromEntries(
  MARKETING_SECTION_IDS.map(sectionId => [
    `factory-${sectionId}`,
    {
      sectionId,
      render: (context: SolutionsSectionRenderContext) => (
        <FactoryCanonicalSection context={context} />
      ),
      validate: validateFactorySection,
    },
  ])
) as Readonly<Record<FactoryRendererKey, SolutionsSectionRenderer>>;

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
        logoPlacement={{ page: '/solutions/artists' }}
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
