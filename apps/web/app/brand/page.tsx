import { Button, type ButtonSize, type ButtonVariant } from '@jovie/ui';
import {
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
} from '@jovie/ui/atoms/button-contract';
import {
  DOMINANT_DELIGHT_LIMITS,
  MOTION_POLICY,
} from '@jovie/ui/theme/motion-policy';
import {
  accent,
  borders,
  radii,
  spacing,
  surfaces,
  text,
  typography,
} from '@jovie/ui/theme/tokens';
import { Check, CircleDot, Download, Music2, Share2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { MARKETING_SPEC_VERSION } from '@/data/marketing/composition';
import { MARKETING_RECIPES } from '@/data/marketing/recipes';
import release from '@/design/system-release.json';
import { Lockup, Mark, TokenSwatch, Wordmark } from '@/lib/brand';
import {
  PUBLIC_ACCESSIBILITY_RULES,
  PUBLIC_BRAND_ASSETS,
  PUBLIC_BRAND_MANIFEST,
  PUBLIC_DENSITY_MODES,
  PUBLIC_DO_DONT,
  PUBLIC_ICON_RULES,
  PUBLIC_IMAGERY_RULES,
  PUBLIC_LOGO_RULES,
  PUBLIC_MEDIA_FIELDS,
  PUBLIC_MEDIA_POLICY,
  PUBLIC_SCREENSHOT_RULES,
  PUBLIC_SYSTEM_CONSUMERS,
  PUBLIC_VOICE_RULES,
} from '@/lib/brand/public-system';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const BRAND_PAGE_TITLE = 'Jovie Brand System';
const BRAND_PAGE_DESCRIPTION =
  'The public, versioned source for building Jovie product and marketing work with canonical assets, tokens, components, voice, and accessibility rules.';

export const metadata: Metadata = {
  title: BRAND_PAGE_TITLE,
  description: BRAND_PAGE_DESCRIPTION,
  openGraph: {
    title: BRAND_PAGE_TITLE,
    description: BRAND_PAGE_DESCRIPTION,
    url: `${BASE_URL}/brand`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_PAGE_TITLE,
    description: BRAND_PAGE_DESCRIPTION,
  },
  alternates: { canonical: `${BASE_URL}/brand` },
  robots: { index: true, follow: true },
};

const BRAND_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: BRAND_PAGE_TITLE,
  description: BRAND_PAGE_DESCRIPTION,
  url: `${BASE_URL}/brand`,
  isPartOf: { '@type': 'WebSite', name: APP_NAME, url: BASE_URL },
  dateModified: release.releasedAt,
};

const PROVEN_RECIPES = MARKETING_RECIPES.filter(
  recipe => recipe.status === 'proven'
);

const COLOR_TOKEN_GROUPS = [
  { label: 'Surface', tokens: surfaces },
  { label: 'Text', tokens: text },
  { label: 'Border', tokens: borders },
  { label: 'Accent', tokens: accent },
] as const;

const sectionShell = 'system-b-brand-section';
const sectionHeading = 'system-b-brand-section-title';
const prose = 'system-b-brand-copy';
const proseStrong = 'system-b-brand-copy system-b-brand-copy--strong';
const smallText = 'system-b-brand-small';

function formatName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[-_]/g, ' ')
    .replace(/^./, character => character.toUpperCase());
}

function formatContentSectionRange(
  index: number,
  upperBound: number | null
): string {
  const priorUpperBound =
    index > 0
      ? (DOMINANT_DELIGHT_LIMITS[index - 1]?.content_sections_max ?? 0)
      : 0;
  const lowerBound = priorUpperBound + 1;
  return upperBound === null
    ? `${String(lowerBound)}+ content sections`
    : `${String(lowerBound)}–${String(upperBound)} content sections`;
}

export default function BrandPage() {
  return (
    <div className='system-b-brand-page'>
      <script type='application/ld+json'>
        {safeJsonLdStringify(BRAND_SCHEMA)}
      </script>
      <HeroSection />
      <SystemSection />
      <LogoSection />
      <TypographySection />
      <ColorSection />
      <SpacingDensitySection />
      <SurfacesSection />
      <ControlsSection />
      <IconsSection />
      <ImagerySection />
      <ScreenshotsSection />
      <MotionSection />
      <AccessibilitySection />
      <VoiceSection />
      <ArchetypesSection />
      <DoDontSection />
      <DownloadsSection />
      <ChangelogSection />
    </div>
  );
}

function HeroSection() {
  return (
    <section id='hero' className='system-b-brand-hero'>
      <div className='system-b-brand-hero-grid'>
        <div className='system-b-brand-hero-copy'>
          <p className='system-b-brand-kicker'>Public Brand System</p>
          <h1 className='system-b-brand-title'>Build Jovie From The Source.</h1>
          <div className='system-b-brand-hero-body'>
            <p className={proseStrong}>
              Assets, tokens, components, composition, voice, and release
              history—compiled from the same system that ships the product.
            </p>
            <p className={prose}>
              Use this page for vendor handoffs and agent work. When this guide
              disagrees with the downloadable manifest, stop: the drift gate
              should have failed.
            </p>
          </div>
          <div className='system-b-brand-actions'>
            <Button asChild size='lg'>
              <Link href='#downloads' data-primary-action='true'>
                <Download aria-hidden='true' />
                Download Brand System
              </Link>
            </Button>
            <Button asChild size='lg' variant='secondary'>
              <Link href='#system'>How the system works</Link>
            </Button>
          </div>
        </div>
        <div className='system-b-brand-hero-mark'>
          <Mark size={240} title='Jovie mark' />
        </div>
      </div>
    </section>
  );
}

function SystemSection() {
  return (
    <Section id='system' title='One system. Four surfaces.'>
      <p className={proseStrong}>
        Product and marketing share type, color, icons, symbols, radii,
        controls, and button sizes. Marketing changes composition and spacing,
        not the foundation.
      </p>
      <div className='system-b-brand-version'>
        <span>Design System</span>
        <strong>v{release.version}</strong>
        <span>{release.releasedAt}</span>
      </div>
      <div className='system-b-brand-contract-grid'>
        {PUBLIC_SYSTEM_CONSUMERS.map(consumer => (
          <article key={consumer.name} className='system-b-brand-contract-card'>
            <h3>{consumer.name}</h3>
            <p>{consumer.relationship}</p>
          </article>
        ))}
      </div>
      <p className={smallText}>
        Named exceptions are versioned, justified, and founder-approved. The
        current release records {release.exceptions.length} exception.
      </p>
    </Section>
  );
}

function LogoSection() {
  return (
    <Section id='logos' title='Logo assets'>
      <p className={proseStrong}>
        The mark, drawn wordmark, and lockup come from one geometry source and
        one checksummed asset pipeline.
      </p>
      <div className='system-b-brand-logo-stage'>
        <Mark size={128} title='Jovie mark' />
        <Wordmark height={52} title='Jovie wordmark' />
        <Lockup height={54} title='Jovie horizontal lockup' />
      </div>
      <RuleList rules={PUBLIC_LOGO_RULES} />
    </Section>
  );
}

function TypographySection() {
  return (
    <Section id='typography' title='Typography roles'>
      <p className={prose}>
        Family names, role assignments, and token references below come from the
        shared typography registry.
      </p>
      <div className='system-b-brand-type-stack'>
        {Object.entries(typography.roles).map(([role, contract]) => (
          <article key={role} className='system-b-brand-type-role'>
            <p
              className={`system-b-brand-type-sample system-b-brand-type-sample--${role}`}
            >
              {contract.family}
            </p>
            <div>
              <h3>{formatName(role)}</h3>
              <p>{contract.use}</p>
              <code>{contract.token}</code>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function ColorSection() {
  return (
    <Section id='color' title='Color & semantic tokens'>
      <p className={proseStrong}>
        Choose a semantic role, never a sampled color. The JSON manifest is the
        copy-pasteable export for tools that cannot consume the repository.
      </p>
      {COLOR_TOKEN_GROUPS.map(group => (
        <div key={group.label} className='system-b-brand-token-group'>
          <h3>{group.label}</h3>
          <ul className='system-b-brand-token-grid'>
            {Object.entries(group.tokens).map(([name, value]) => (
              <TokenSwatch
                key={name}
                label={`${group.label}.${name}`}
                value={value}
              />
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function SpacingDensitySection() {
  return (
    <Section id='spacing-density' title='Spacing & density'>
      <p className={proseStrong}>
        One spacing scale supports two composition modes. Editorial is more
        spacious; it is not a separate design system.
      </p>
      <div className='system-b-brand-contract-grid'>
        {PUBLIC_DENSITY_MODES.map(mode => (
          <article key={mode.name} className='system-b-brand-contract-card'>
            <h3>{mode.name}</h3>
            <p>{mode.summary}</p>
          </article>
        ))}
      </div>
      <TokenList title='Canonical spacing scale' tokens={spacing} />
    </Section>
  );
}

function SurfacesSection() {
  return (
    <Section id='surfaces' title='Radii & surfaces'>
      <p className={prose}>
        Layer surfaces by semantic elevation. Use the shared radius scale and
        concentric pairs for nested containers; do not invent one-off corners.
      </p>
      <ul className='system-b-brand-surface-stack' aria-label='Surface Ladder'>
        {Object.entries(surfaces)
          .slice(0, 5)
          .map(([name, value]) => (
            <TokenSwatch key={name} label={`Surface.${name}`} value={value} />
          ))}
      </ul>
      <TokenList title='Canonical radius scale' tokens={radii} />
    </Section>
  );
}

function ControlsSection() {
  return (
    <Section id='controls' title='Buttons & controls'>
      <p className={proseStrong}>
        These are the real shared Button component—not redrawn specimens. Labels
        describe outcomes and control sizes stay canonical across product and
        marketing.
      </p>
      <SpecimenGroup title='Variants'>
        {BUTTON_VARIANT_NAMES.map(variant => (
          <ControlSpecimen key={variant} label={variant}>
            <Button variant={variant as ButtonVariant}>Continue</Button>
          </ControlSpecimen>
        ))}
      </SpecimenGroup>
      <SpecimenGroup title='Sizes'>
        {BUTTON_SIZE_NAMES.map(size => (
          <ControlSpecimen key={size} label={size}>
            <Button
              size={size as ButtonSize}
              variant='secondary'
              aria-label={size === 'icon' ? 'Download example' : undefined}
            >
              {size === 'icon' ? <Download aria-hidden='true' /> : 'Continue'}
            </Button>
          </ControlSpecimen>
        ))}
      </SpecimenGroup>
      <p className={smallText}>
        Repository contributors consume the shared workspace component. It is
        not a public npm dependency; external vendors use these rendered
        references and the versioned manifest.
      </p>
    </Section>
  );
}

function IconsSection() {
  return (
    <Section id='icons' title='Icons & symbols'>
      <div className='system-b-brand-icon-specimens'>
        <IconSpecimen label='Interface Action'>
          <Share2 aria-hidden='true' />
        </IconSpecimen>
        <IconSpecimen label='Music Entity'>
          <Music2 aria-hidden='true' />
        </IconSpecimen>
        <IconSpecimen label='Brand Symbol'>
          <CircleDot aria-hidden='true' />
        </IconSpecimen>
      </div>
      <RuleList rules={PUBLIC_ICON_RULES} />
    </Section>
  );
}

function ImagerySection() {
  return (
    <Section id='imagery' title='Imagery & editorial direction'>
      <p className={proseStrong}>
        Product structure is the baseline. Artist media earns its place by
        adding truthful context, not by decorating empty space.
      </p>
      <RuleList rules={PUBLIC_IMAGERY_RULES} />
      <div className='system-b-brand-safe-projection'>
        <h3>Public-safe Media Projection</h3>
        <p>{PUBLIC_MEDIA_POLICY.alt}</p>
        <ul>
          {PUBLIC_MEDIA_FIELDS.map(field => (
            <li key={field}>
              <code>{field}</code>
            </li>
          ))}
        </ul>
        <p className={smallText}>
          Everything else used for selection, governance, or operations stays
          private and is rejected from HTML, manifests, downloads, and public
          analytics.
        </p>
      </div>
    </Section>
  );
}

function ScreenshotsSection() {
  return (
    <Section id='screenshots' title='Product screenshots & mockups'>
      <p className={proseStrong}>
        A product screenshot is evidence, not stock art. It must come from a
        current canonical surface and pass the public-data projection before
        publication.
      </p>
      <RuleList rules={PUBLIC_SCREENSHOT_RULES} />
      <p className={smallText}>
        This release publishes no screenshot download by default. Use the
        approved live archetype references below; request a reviewed capture
        when a deliverable needs product media.
      </p>
    </Section>
  );
}

function MotionSection() {
  return (
    <Section id='motion' title='Motion & earned delight'>
      <p className={proseStrong}>
        Every number is a maximum after taste approval—not a prompt to add
        motion. Zero dominant delight is always valid and is the choice on this
        page.
      </p>
      <div className='system-b-brand-motion-status'>
        <span>Dominant delight on this page</span>
        <strong>0</strong>
        <span>
          Optional by policy: {MOTION_POLICY.delight_optional ? 'yes' : 'no'}
        </span>
      </div>
      <div className='system-b-brand-contract-grid'>
        {DOMINANT_DELIGHT_LIMITS.map((limit, index) => (
          <article
            key={String(limit.content_sections_max)}
            className='system-b-brand-contract-card'
          >
            <h3>
              {formatContentSectionRange(index, limit.content_sections_max)}
            </h3>
            <p>
              Maximum {limit.max_dominant_delights}
              {limit.content_sections_max === null
                ? ' only with a named exception and complete motion receipts.'
                : '.'}
            </p>
          </article>
        ))}
      </div>
      <p className={prose}>
        At most {MOTION_POLICY.simultaneous_active_max} attention-commanding
        delight may be active in the {MOTION_POLICY.simultaneous_scope}.{' '}
        {MOTION_POLICY.section_counting.definition} Exclude the{' '}
        {MOTION_POLICY.section_counting.excluded.join(' and ')}; count a
        distinct{' '}
        {MOTION_POLICY.section_counting.distinct_content_sections.join(' or ')}.
      </p>
      <div className='system-b-brand-rule-columns'>
        <RuleList
          title='A proposal must explain'
          rules={MOTION_POLICY.intentionality_fields.map(formatName)}
        />
        <RuleList title='Reject when' rules={MOTION_POLICY.reject_when} />
      </div>
      <p className={smallText}>
        Functional transitions {MOTION_POLICY.definitions.functional_transition}{' '}
        Dominant delight {MOTION_POLICY.definitions.dominant_delight}{' '}
        Reduced-motion and static fallbacks are mandatory; editorial and video
        tiers may always be deferred while a valuable static tier ships
        independently.
      </p>
    </Section>
  );
}

function AccessibilitySection() {
  return (
    <Section id='accessibility' title='Accessibility'>
      <p className={proseStrong}>
        Accessibility is part of the system contract, not a handoff note.
      </p>
      <RuleList rules={PUBLIC_ACCESSIBILITY_RULES} />
    </Section>
  );
}

function VoiceSection() {
  return (
    <Section id='voice' title='Voice & copy'>
      <p className={proseStrong}>
        Clear, specific, and outcome-led. Jovie should sound like a capable
        collaborator who respects the artist&apos;s time.
      </p>
      <RuleList rules={PUBLIC_VOICE_RULES} />
    </Section>
  );
}

function ArchetypesSection() {
  return (
    <Section id='archetypes' title='Approved composition archetypes'>
      <p className={prose}>
        Only proven recipes from marketing composition spec v
        {MARKETING_SPEC_VERSION} appear here. Their definitions stay in the
        registry; this page projects the public label and live reference.
      </p>
      <div className='system-b-brand-archetype-grid'>
        {PROVEN_RECIPES.map(recipe => (
          <article key={recipe.id} className='system-b-brand-archetype-card'>
            <h3>{recipe.label}</h3>
            <Button asChild variant='link'>
              <Link href={recipe.referenceRoute ?? '/'}>View reference</Link>
            </Button>
          </article>
        ))}
      </div>
    </Section>
  );
}

function DoDontSection() {
  return (
    <Section id='do-dont' title='Do / don’t'>
      <div className='system-b-brand-do-dont-grid'>
        {PUBLIC_DO_DONT.map(rule => (
          <article key={rule.do} className='system-b-brand-do-dont-card'>
            <div>
              <h3>Do</h3>
              <p>{rule.do}</p>
            </div>
            <div>
              <h3>Don&apos;t</h3>
              <p>{rule.dont}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function DownloadsSection() {
  return (
    <Section id='downloads' title='Downloads & machine access'>
      <p className={proseStrong}>
        Use checksummed assets and the current JSON projection. Never scrape
        token values or recreate artwork from this rendered page.
      </p>
      <div className='system-b-brand-manifest-card'>
        <div>
          <span>Machine-readable Brand System</span>
          <strong>v{release.version}</strong>
          <code>{`${BASE_URL}${PUBLIC_BRAND_MANIFEST.href}`}</code>
        </div>
        <Button asChild variant='secondary'>
          <a
            href={PUBLIC_BRAND_MANIFEST.href}
            download={PUBLIC_BRAND_MANIFEST.file}
          >
            <Download aria-hidden='true' />
            JSON manifest
          </a>
        </Button>
      </div>
      <ul className='system-b-brand-downloads-list'>
        {PUBLIC_BRAND_ASSETS.map(asset => (
          <li key={asset.file}>
            <a
              className='system-b-brand-download-link'
              href={asset.href}
              download={asset.file}
            >
              <Download aria-hidden='true' />
              <span>
                {asset.label}
                <small>{asset.file}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className={smallText}>
        Questions or a deliverable-specific asset request?{' '}
        <a className='system-b-brand-contact-link' href='mailto:brand@jov.ie'>
          brand@jov.ie
        </a>
      </p>
    </Section>
  );
}

function ChangelogSection() {
  return (
    <Section id='changelog' title='Version & changelog'>
      <div className='system-b-brand-changelog'>
        {release.changelog.map(entry => (
          <article key={entry.version}>
            <div>
              <strong>v{entry.version}</strong>
              <time dateTime={entry.date}>{entry.date}</time>
            </div>
            <p>{entry.summary}</p>
          </article>
        ))}
      </div>
      <p className={smallText}>
        Source hashes, component names, approved examples, asset checksums, and
        required public sections are verified at build time. A canonical change
        without a matching version and changelog update fails the build with a
        remediation command.
      </p>
    </Section>
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section id={id} className={sectionShell}>
      <div className='system-b-brand-section-intro'>
        <p className='system-b-brand-section-number'>{id}</p>
        <h2 className={sectionHeading}>{title}</h2>
      </div>
      <div className='system-b-brand-copy-stack'>{children}</div>
    </section>
  );
}

function RuleList({
  title,
  rules,
}: {
  readonly title?: string;
  readonly rules: readonly string[];
}) {
  return (
    <div className='system-b-brand-rule-list'>
      {title ? <h3>{title}</h3> : null}
      <ul>
        {rules.map(rule => (
          <li key={rule}>
            <Check aria-hidden='true' />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TokenList({
  title,
  tokens,
}: {
  readonly title: string;
  readonly tokens: Readonly<Record<string, string>>;
}) {
  return (
    <div className='system-b-brand-token-list'>
      <h3>{title}</h3>
      <dl>
        {Object.entries(tokens).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              <code>{value}</code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SpecimenGroup({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className='system-b-brand-specimen-group'>
      <h3>{title}</h3>
      <div className='system-b-brand-specimen-grid'>{children}</div>
    </div>
  );
}

function ControlSpecimen({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className='system-b-brand-control-specimen'>
      <code>{label}</code>
      {children}
    </div>
  );
}

function IconSpecimen({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className='system-b-brand-icon-specimen'>
      {children}
      <span>{label}</span>
    </div>
  );
}
