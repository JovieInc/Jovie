import type { Metadata } from 'next';
import {
  MarketingContainer,
  MarketingFeatureGrid,
  MarketingHero,
  MarketingPageShell,
  MarketingSectionIntro,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { JOVIE_CLI_COPY as copy } from '@/data/jovieCliCopy';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: `${copy.metadata.title} — ${APP_NAME}`,
  description: copy.metadata.description,
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.CLI}`,
  },
  openGraph: {
    title: `${copy.metadata.title} — ${APP_NAME}`,
    description: copy.metadata.description,
    url: `${BASE_URL}${APP_ROUTES.CLI}`,
    type: 'website',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'CLI', url: `${BASE_URL}${APP_ROUTES.CLI}` },
]);

function commandText(commands: readonly string[]): string {
  return commands.join('\n');
}

export default function CliPage() {
  return (
    <MarketingPageShell
      className='bg-base text-primary-token'
      testId='cli-landing-page'
    >
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero
        headline={copy.hero.headline}
        subtitle={copy.hero.subtitle}
        primaryCta={copy.hero.primaryCta}
        secondaryCta={copy.hero.secondaryCta}
        align='center'
        logos={false}
        headingId='cli-hero-heading'
        testId='marketing-section-hero'
      />

      <section
        id='install'
        aria-labelledby='cli-commands-heading'
        className='section-spacing-linear border-t border-subtle'
        data-testid='marketing-section-feature-grid'
      >
        <MarketingContainer width='page'>
          <MarketingSectionIntro
            eyebrow={copy.commands.eyebrow}
            title={copy.commands.title}
            titleId='cli-commands-heading'
            description={copy.commands.description}
          />

          <div className='mt-10 grid gap-6 lg:grid-cols-2'>
            <MarketingSurfaceCard
              variant='product-callout'
              chrome='framed'
              glowTone='none'
              label={copy.commands.source.label}
              stateLabel={copy.commands.source.stateLabel}
            >
              <pre className='overflow-x-auto p-5 text-sm leading-relaxed text-secondary-token sm:p-6'>
                <code className='block whitespace-pre-wrap break-all font-mono sm:min-w-max sm:whitespace-pre sm:break-normal'>
                  {commandText(copy.commands.source.commands)}
                </code>
              </pre>
            </MarketingSurfaceCard>

            <MarketingSurfaceCard
              variant='product-callout'
              chrome='framed'
              glowTone='none'
              label={copy.commands.npm.label}
              stateLabel={copy.commands.npm.stateLabel}
            >
              <div className='p-5 sm:p-6'>
                <p className='text-sm leading-relaxed text-secondary-token'>
                  {copy.commands.npm.description}
                </p>
                <pre className='mt-5 overflow-x-auto text-sm leading-relaxed text-secondary-token'>
                  <code className='block whitespace-pre-wrap break-all font-mono sm:min-w-max sm:whitespace-pre sm:break-normal'>
                    {commandText(copy.commands.npm.commands)}
                  </code>
                </pre>
              </div>
            </MarketingSurfaceCard>
          </div>

          <MarketingFeatureGrid
            items={copy.commands.items}
            className='mt-12 grid gap-8 sm:grid-cols-2'
          />
        </MarketingContainer>
      </section>

      <div data-testid='marketing-section-cta'>
        <MarketingFinalCTA
          title={copy.cta.title}
          body={copy.cta.body}
          ctaLabel={copy.cta.primaryLabel}
          ctaHref={copy.cta.primaryHref}
          secondaryLabel={copy.cta.secondaryLabel}
          secondaryHref={copy.cta.secondaryHref}
          testId='cli-final-cta'
        />
      </div>
    </MarketingPageShell>
  );
}
