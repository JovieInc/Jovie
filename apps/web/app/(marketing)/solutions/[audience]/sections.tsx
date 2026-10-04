import Image from 'next/image';
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
  'feature-split': ['body'],
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
 * Factory-rendered media (JOV-7765). The frame takes the asset's own aspect
 * ratio from the record, so nothing shifts while it loads. Video is
 * click-to-play behind its poster, with captions, and never autoplays, which also keeps it
 * still for reduced-motion visitors. The digest attribute lets the design
 * loop prove a re-render reached the page.
 */
function FactoryGeneratedMedia({
  media,
}: Readonly<{ media: GeneratedPageAssetRef }>) {
  return (
    <div
      className='relative min-w-0 overflow-hidden rounded-xl border border-subtle bg-surface-0'
      style={{ aspectRatio: `${media.width} / ${media.height}` }}
      data-factory-media={media.id}
      data-factory-media-digest={media.digest}
    >
      {media.mime.startsWith('video/') ? (
        <video
          className='h-full w-full object-cover'
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
          fill
          sizes={FACTORY_MEDIA_SIZES}
          className='object-cover'
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

function FactoryCopyLines({
  entries,
  omit = [],
}: Readonly<{
  entries: readonly FactoryCopyEntry[];
  omit?: readonly string[];
}>) {
  return entries
    .filter(entry => !omit.includes(entry.slot))
    .map(entry => (
      <p
        key={entry.slot}
        data-copy-slot={entry.slot}
        className='text-base leading-relaxed text-secondary-token'
      >
        {entry.text}
      </p>
    ));
}

function FactoryGenericSection({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const { section, copy: entries, media } = context;
  const headline = slotText(entries, 'headline', 'title');
  const omitted = headline
    ? entries.filter(entry => entry.text === headline).map(entry => entry.slot)
    : [];
  const headingId = `${section.instanceId}-heading`;

  return (
    <section
      aria-labelledby={headline ? headingId : undefined}
      data-testid={`marketing-section-${section.sectionId}`}
      data-marketing-section={section.sectionId}
      data-marketing-owner='apps/web/app/(marketing)/solutions/[audience]/sections.tsx'
      data-marketing-variant='factory-record'
      className='section-spacing-linear'
    >
      <MarketingContainer width='page'>
        <div
          className={
            media
              ? 'grid items-center gap-10 lg:grid-cols-2 lg:gap-16'
              : 'mx-auto flex max-w-prose-canonical flex-col gap-4'
          }
        >
          <div className='flex min-w-0 flex-col gap-4'>
            {headline ? (
              <h2
                id={headingId}
                data-wrap='editorial-title'
                data-copy-slot={omitted[0]}
                className='text-balance text-3xl font-semibold tracking-tight text-primary-token sm:text-4xl'
              >
                {headline}
              </h2>
            ) : null}
            <FactoryCopyLines entries={entries} omit={omitted} />
          </div>
          <FactorySectionMedia media={media} />
        </div>
      </MarketingContainer>
    </section>
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
  if (items.length === 0) return <FactoryGenericSection context={context} />;

  const heading = slotText(context.copy, 'headline', 'title');
  return (
    <section
      data-testid='marketing-section-feature-grid'
      data-marketing-section='feature-grid'
      data-marketing-owner='apps/web/app/(marketing)/solutions/[audience]/sections.tsx'
      data-marketing-variant='two-column-text'
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
  if (items.length === 0) return <FactoryGenericSection context={context} />;

  return (
    <FaqSection
      sectionVariant='objection-handler' /* copy-lint-allow: objection -- canonical registry variant id */
      heading={slotText(context.copy, 'headline', 'title')}
      items={items}
    />
  );
}

function FactoryHero({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const binding = HERO_CODE_BINDING_BY_VARIANT[context.record.heroVariant];
  if (!binding.sectionVariantId) return null;
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
        context.media ? (
          <FactorySectionMedia media={context.media} />
        ) : undefined
      }
      logos={false}
      align={binding.sectionVariantId === 'left-none' ? 'left' : 'center'}
      sectionVariant={binding.sectionVariantId}
      sectionOwner='apps/web/app/(marketing)/solutions/[audience]/sections.tsx'
      testId='marketing-section-hero'
    />
  );
}

function FactoryCta({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  const contract = derivePageRecordContract(context.record);
  const copyScope = contract.copyScope;
  return (
    <MarketingTerminalCta
      sectionVariant={
        copyScope === 'music' ? 'final-single-claim' : 'final-dual-path'
      }
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

function FactoryCanonicalSection({
  context,
}: Readonly<{ context: SolutionsSectionRenderContext }>) {
  switch (context.section.sectionId) {
    case 'hero':
      return <FactoryHero context={context} />;
    case 'feature-grid':
      return <FactoryFeatureGrid context={context} />;
    case 'faq':
      return <FactoryFaq context={context} />;
    case 'cta':
      return <FactoryCta context={context} />;
    default:
      return <FactoryGenericSection context={context} />;
  }
}

function validateFactorySection(context: SolutionsSectionRenderContext) {
  const { record, section, copy: entries } = context;
  if (!section.instanceId) {
    throw new Error(
      `Page record ${record.id} factory section ${section.renderer} has no instanceId`
    );
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
  if (
    section.sectionId === 'hero' &&
    HERO_CODE_BINDING_BY_VARIANT[record.heroVariant].sectionVariantId === null
  ) {
    throw new Error(
      `Page record ${record.id} hero variant ${record.heroVariant} has no code binding`
    );
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
