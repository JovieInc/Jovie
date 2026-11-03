import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import type { Listing } from '@/lib/agent-distribution/listing';

export interface AgentDocsTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly idempotentHint?: boolean;
  };
}

export interface AgentConnectorDocsProps {
  readonly listing: Listing;
  readonly toolsListHash: string;
  readonly tools: readonly AgentDocsTool[];
}

// Page-owned links to sibling developer pages (geo-sibling-links needs 3-5).
const RELATED_LINKS = [
  { href: APP_ROUTES.DEVELOPERS, label: 'Developers Overview' },
  { href: APP_ROUTES.CLI, label: 'Jovie Command Line' },
  { href: APP_ROUTES.API_VERSIONING, label: 'API Versioning' },
] as const;

const H2 =
  'text-balance text-2xl font-semibold tracking-tight text-primary-token';
const BODY = 'mt-4 text-pretty text-base leading-relaxed text-secondary-token';
// Short single-paragraph answers balance their lines: text-pretty alone left
// "code." alone on the last line of the authentication text (taste ratchet).
const BODY_BALANCED =
  'mt-4 text-balance text-base leading-relaxed text-secondary-token';

/** Renders from the listing copy source and the generated tools/list snapshot, so it cannot drift from the registry. */
export function AgentConnectorDocs({
  listing,
  toolsListHash,
  tools,
}: AgentConnectorDocsProps) {
  const page = listing.docsPage;
  return (
    <MarketingContainer width='prose' className='pt-24 pb-20 sm:pt-28 sm:pb-28'>
      <div
        data-testid='agent-connector-docs'
        data-tools-list-hash={toolsListHash}
      >
        <p className='text-sm font-medium text-tertiary-token'>
          {page.eyebrow}
        </p>
        <h1 className='system-b-marketing-route-title mt-4 text-primary-token text-balance'>
          {page.title}
        </h1>
        <p className='mt-6 text-lg leading-relaxed text-secondary-token text-pretty'>
          {listing.oneLiner}
        </p>

        <div className='mt-16 space-y-16'>
          <section aria-labelledby='agent-docs-connect'>
            <h2 id='agent-docs-connect' className={H2}>
              {page.connectHeading}
            </h2>
            <ol className='mt-4 list-decimal space-y-2 pl-5 text-pretty text-base leading-relaxed text-secondary-token'>
              {page.connectSteps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className={BODY}>
              {page.urlLabel}: <code>{listing.mcpUrl}</code>
            </p>
          </section>

          <section aria-labelledby='agent-docs-tools'>
            <h2 id='agent-docs-tools' className={H2}>
              {page.toolsHeading}
            </h2>
            <p className={BODY}>{page.toolsIntro}</p>
            <ul className='mt-6 space-y-8'>
              {tools.map(tool => (
                <li key={tool.name}>
                  <h3 className='text-balance text-lg font-semibold text-primary-token'>
                    {tool.title ?? tool.name}
                  </h3>
                  <p className='mt-1 text-pretty text-sm text-tertiary-token'>
                    <code>{tool.name}</code>
                    {' · '}
                    {tool.annotations?.readOnlyHint
                      ? page.readOnlyLabel
                      : page.writeLabel}
                    {tool.annotations?.idempotentHint
                      ? ` · ${page.retryLabel}`
                      : ''}
                  </p>
                  <p className={BODY}>{tool.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby='agent-docs-auth'>
            <h2 id='agent-docs-auth' className={H2}>
              {page.authHeading}
            </h2>
            <p className={BODY_BALANCED}>{page.authText}</p>
          </section>

          <section aria-labelledby='agent-docs-limits'>
            <h2 id='agent-docs-limits' className={H2}>
              {page.limitsHeading}
            </h2>
            <p className={BODY}>{page.limitsText}</p>
          </section>

          <section aria-labelledby='agent-docs-data'>
            <h2 id='agent-docs-data' className={H2}>
              {page.dataHeading}
            </h2>
            <p className={BODY}>{listing.dataHandling}</p>
          </section>

          <section aria-labelledby='agent-docs-expiry'>
            <h2 id='agent-docs-expiry' className={H2}>
              {page.expiryHeading}
            </h2>
            <p className={BODY}>{page.expiryText}</p>
          </section>

          <section aria-labelledby='agent-docs-related'>
            <h2 id='agent-docs-related' className={H2}>
              Related
            </h2>
            <ul className='mt-4 space-y-2 text-base text-secondary-token'>
              {RELATED_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className='underline'>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby='agent-docs-legal'>
            <h2 id='agent-docs-legal' className={H2}>
              {page.legalHeading}
            </h2>
            <ul className='mt-4 space-y-2 text-base text-secondary-token'>
              <li>
                <Link href={listing.privacyUrl} className='underline'>
                  {page.privacyLabel}
                </Link>
              </li>
              <li>
                <Link href={listing.termsUrl} className='underline'>
                  {page.termsLabel}
                </Link>
              </li>
              <li>
                <Link href={listing.supportUrl} className='underline'>
                  {page.supportLabel}
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </MarketingContainer>
  );
}
