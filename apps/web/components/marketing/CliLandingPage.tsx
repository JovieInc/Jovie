// @coverage-via apps/web/tests/unit/marketing/cli-landing.test.tsx
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';

export const CLI_HEADLINE = 'Jovie, for your agents.';
export const CLI_SUBTITLE =
  'Give any creator a Jovie profile from their Spotify link, then read public profile data. One package: CLI, MCP server, and agent skill. No account or API key.';
export const CLI_PRIMARY_CTA_LABEL = 'Install the CLI';

export const CLI_DOCUMENTED_COMMANDS = [
  {
    command: 'jovie profile create <spotify-artist-url>',
    request: 'POST /api/agents/profiles',
  },
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
  {
    command: 'jovie mcp',
    request: 'The commands above as MCP tools over stdio',
  },
  {
    command: 'jovie init',
    request:
      'Installs the Jovie skill into Claude, Codex, OpenClaw, and Hermes',
  },
  {
    command: 'jovie skill',
    request: 'Prints the Jovie SKILL.md for agents',
  },
] as const;

export const CLI_FAQ_ITEMS = [
  {
    question: 'Does the CLI require an account or API key?',
    answer:
      'No. Every command is anonymous. The only writes are profile create, which makes an unclaimed profile the creator claims by verifying their Spotify artist, and the report commands, which file bugs and feedback. The CLI does not log in, cache responses, or send telemetry.',
  },
  {
    question: 'Which Node.js version does it need?',
    answer:
      'Node.js 24.21.0 or later, and below Node 25. That matches the published package engines field.',
  },
  {
    question: 'Can I point it at another Jovie deployment?',
    answer:
      'Yes. Pass --base-url with an http or https origin and no path, credentials, or query parameters.',
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

const CLI_JOBS = [
  {
    title: 'Give a creator a profile',
    command: 'jovie profile create <spotify-artist-url>',
    body: 'Create a Jovie profile from a Spotify artist link. You get the profile URL and a claim link the creator opens to take ownership.',
  },
  {
    title: 'Plug Jovie into an agent',
    command: 'npx -y @jovie/cli mcp',
    body: 'Run the same commands as MCP tools, or run jovie init to install the Jovie skill into every agent on this machine.',
  },
  {
    title: 'Get a profile',
    command: 'jovie artist get <username>',
    body: 'Fetch the structured public profile for a real Jovie username. Add --json when you want to pipe the response into another tool.',
  },
  {
    title: 'Give a profile to an agent',
    command: 'jovie artist llms <username>',
    body: 'Fetch the profile’s public llms.txt context so an agent can understand the creator without scraping a profile page.',
  },
  {
    title: 'Build against Jovie',
    command: 'jovie api openapi',
    body: 'Read the canonical public OpenAPI contract directly from the terminal.',
  },
  {
    title: 'Give Jovie to an agent',
    command: 'jovie docs llms',
    body: 'Fetch Jovie’s machine-readable documentation. Use --full when the complete documentation context is useful.',
  },
] as const;

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
        photo={{
          src: '/images/marketing-hero/cli.webp',
          width: 1600,
          height: 901,
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
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              Install
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Install globally, or run it with npx from any agent. The CLI is
              anonymous.
            </p>
            <pre className='mt-6 overflow-x-auto rounded-xl border border-subtle bg-surface-0 p-5 text-sm leading-relaxed text-secondary-token'>
              <code>{INSTALL_COMMANDS}</code>
            </pre>
            <div className='mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-secondary-token'>
              <span>No account</span>
              <span>No API key</span>
              <span>MCP server</span>
              <span>JSON output</span>
            </div>
          </section>

          <section id='commands' aria-labelledby='commands-heading'>
            <h2
              id='commands-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              What You Can Do
            </h2>
            <div className='mt-6 space-y-8'>
              {CLI_JOBS.map(item => (
                <article key={item.title}>
                  <h3 className='text-base font-semibold text-primary-token'>
                    {item.title}
                  </h3>
                  <section
                    aria-label={`${item.title} command`}
                    className='mt-3 overflow-x-auto rounded-xl border border-subtle bg-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: long commands scroll sideways on narrow screens and need a keyboard entry point (axe scrollable-region-focusable)
                    tabIndex={0}
                  >
                    <pre className='p-4 text-sm leading-relaxed text-primary-token'>
                      <code>{item.command}</code>
                    </pre>
                  </section>
                  <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section id='reference' aria-labelledby='reference-heading'>
            <h2
              id='reference-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              CLI Reference
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Every command accepts <code>--base-url</code> and{' '}
              <code>--json</code>. <code>--json</code> emits JSON for API
              responses and wraps text resources as{' '}
              <code>{'{"content":"..."}'}</code>.
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
            <p className='mt-6 text-sm leading-relaxed text-secondary-token'>
              Maintainer note: package publication is main-only and
              provenance-required. A local checkout can run the same command
              surface with <code>pnpm --filter @jovie/cli dev</code>.
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
        title='Jovie, for your agents.'
        body='Install the Jovie CLI and give a creator a profile from their Spotify link.'
        ctaLabel={CLI_PRIMARY_CTA_LABEL}
        ctaHref='#install'
        ctaAnalyticsEvent='cli_install_cta'
        ctaAnalyticsSource='cli_page_footer'
        prefetch={false}
      />
    </MarketingPageShell>
  );
}
