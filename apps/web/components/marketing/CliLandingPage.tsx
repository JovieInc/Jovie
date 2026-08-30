import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';

export const CLI_HEADLINE = 'Read public Jovie data from a terminal.';
export const CLI_SUBTITLE =
  'Fetch public artist profiles, OpenAPI, and llms.txt. No login, keys, or writes.';
export const CLI_PRIMARY_CTA_LABEL = 'Install';

export const CLI_DOCUMENTED_COMMANDS = [
  {
    command: 'jovie artist get <username>',
    request: 'GET /api/v1/{username}',
  },
  {
    command: 'jovie artist llms <username>',
    request: 'GET /{username}/llms.txt',
  },
  {
    command: 'jovie api openapi',
    request: 'GET /api/v1/openapi.json',
  },
  {
    command: 'jovie docs llms',
    request: 'GET /llms.txt',
  },
  {
    command: 'jovie docs llms --full',
    request: 'GET /llms-full.txt',
  },
] as const;

export const CLI_FAQ_ITEMS = [
  {
    question: 'Does the CLI require an API key?',
    answer:
      'No. Every command uses anonymous GET routes. The CLI does not log in, accept API keys or OAuth credentials, write files, cache responses, send telemetry, or mutate Jovie data.',
  },
  {
    question: 'Which Node.js version does it need?',
    answer:
      'Node.js 22.23.2 or later, and below Node 23. That matches the published package engines field.',
  },
  {
    question: 'Can I point it at another Jovie deployment?',
    answer:
      'Yes. Pass --base-url with an http or https origin and no path, credentials, or query parameters. The CLI stays read-only.',
  },
  {
    question: 'What happens when a command fails?',
    answer:
      'Successful commands exit 0. Request or response failures exit 1. Invalid command-line usage exits 2.',
  },
] as const;

const INSTALL_COMMANDS = `npm install --global @jovie/cli
jovie --help
jovie --version`;

export function CliLandingPage() {
  return (
    <MarketingPageShell>
      <MarketingHero
        headingId='cli-hero-heading'
        headline={CLI_HEADLINE}
        subtitle={CLI_SUBTITLE}
        primaryCta={{
          label: CLI_PRIMARY_CTA_LABEL,
          href: '#install',
          testId: 'cli-hero-install',
        }}
        secondaryCta={{
          label: 'Public API',
          href: APP_ROUTES.DEVELOPERS,
          testId: 'cli-hero-developers',
        }}
        logos={false}
        align='center'
        testId='cli-hero'
      />

      <MarketingContainer width='prose' className='pb-20 sm:pb-28'>
        <div className='space-y-16'>
          <section
            id='install'
            aria-labelledby='install-heading'
            data-marketing-section='content-prose'
          >
            <h2
              id='install-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token'
            >
              Install
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              After a versioned release is published to npm, install the CLI
              globally. The commands below are the verified first-run path.
            </p>
            <pre className='mt-6 overflow-x-auto rounded-xl border border-subtle bg-surface-0 p-5 text-sm leading-relaxed text-secondary-token'>
              <code>{INSTALL_COMMANDS}</code>
            </pre>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Publication is main-only, provenance-required, and does not happen
              from a feature branch. A local checkout can run the same commands
              with <code>pnpm --filter @jovie/cli dev</code>.
            </p>
          </section>

          <section id='commands' aria-labelledby='commands-heading'>
            <h2
              id='commands-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token'
            >
              Commands
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              The CLI documents only these read-only commands. Angle-bracket
              values are placeholders for a real public artist username.
            </p>
            <dl className='mt-6 space-y-5'>
              {CLI_DOCUMENTED_COMMANDS.map(item => (
                <div key={item.command}>
                  <dt>
                    <code className='text-sm font-medium text-primary-token'>
                      {item.command}
                    </code>
                  </dt>
                  <dd className='mt-1 text-sm leading-relaxed text-secondary-token'>
                    {item.request}
                  </dd>
                </div>
              ))}
            </dl>
            <p className='mt-6 text-base leading-relaxed text-secondary-token'>
              Every command accepts <code>--base-url</code> and{' '}
              <code>--json</code>. <code>--json</code> emits JSON for API
              responses and wraps text resources as{' '}
              <code>{'{"content":"..."}'}</code>.
            </p>
          </section>
        </div>
      </MarketingContainer>

      <FaqSection
        items={[...CLI_FAQ_ITEMS]}
        heading='Questions'
        analyticsEventName='cli_faq_opened'
        analyticsProperties={{ source: 'cli' }}
      />

      <MarketingFooterCta
        title='Install the Jovie CLI.'
        body='Read-only public artist data from your terminal.'
        ctaLabel={CLI_PRIMARY_CTA_LABEL}
        ctaHref='#install'
        ctaAnalyticsEvent='cli_install_cta'
        ctaAnalyticsSource='cli_page_footer'
        prefetch={false}
      />
    </MarketingPageShell>
  );
}
