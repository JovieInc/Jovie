import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getConnectorAvailability } from '@/lib/connectors/availability.server';
import { getAdvertisedConnectorIntegrations } from '@/lib/connectors/capabilities';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

const PAGE_PATH = APP_ROUTES.INTEGRATIONS;
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_DESCRIPTION =
  'See which account connections are available in Jovie and what each one can read or change.';

export const metadata: Metadata = {
  title: 'Integrations',
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: PAGE_URL,
  },
};

// Public capabilities reflect deployment configuration. Rebuild this static
// reference when provider configuration changes; Settings checks live availability.
export const revalidate = false;

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Integrations', url: PAGE_URL },
]);

/** Page-owned links. Header, nav, and footer chrome do not count as siblings. */
const RELATED_PAGES = [
  { href: APP_ROUTES.PRODUCT, label: 'Product' },
  { href: APP_ROUTES.DEVELOPERS, label: 'Developers' },
  { href: APP_ROUTES.SUPPORT, label: 'Support' },
] as const;

export default function IntegrationsDirectoryPage() {
  const integrations = getAdvertisedConnectorIntegrations(
    getConnectorAvailability()
  );
  return (
    <MarketingContainer width='page' className='py-12 sm:py-16'>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <div className='mb-8 max-w-prose-canonical space-y-3'>
        <h1 className='truncate text-3xl font-semibold tracking-tight text-primary'>
          Integrations
        </h1>
        <p className='text-secondary'>
          Jovie lists the account connections this site can use, and the exact
          read or write each one supports.
        </p>
        <p className='text-secondary'>
          Connect an account in Settings. You review the permissions it asks
          for, and you approve a write before it runs.
        </p>
        <Link
          href={APP_ROUTES.SETTINGS_CONNECTORS}
          className='text-sm text-primary underline underline-offset-4'
        >
          Manage integrations
        </Link>
      </div>
      <div className='divide-y divide-subtle'>
        {integrations.map(integration => (
          <section
            key={integration.id}
            className='grid gap-3 py-6 sm:grid-cols-3'
            aria-labelledby={`integration-${integration.id}`}
          >
            <h2
              id={`integration-${integration.id}`}
              className='truncate text-lg font-medium text-primary'
            >
              {integration.label}
            </h2>
            <ul className='space-y-2 text-sm text-secondary sm:col-span-2'>
              {integration.capabilities.map(capability => (
                <li key={capability.id}>
                  {capability.label}
                  {capability.requiresApproval ? ' · Requires approval' : ''}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {integrations.length === 0 && (
          <p className='py-6 text-secondary'>
            Account connections are currently unavailable. Check Settings for
            connection status and recovery options.
          </p>
        )}
      </div>
      <section
        className='mt-10 max-w-prose-canonical'
        aria-labelledby='integrations-related'
      >
        <h2
          id='integrations-related'
          className='truncate text-lg font-medium text-primary'
        >
          Related Pages
        </h2>
        <ul className='mt-3 space-y-2 text-sm'>
          {RELATED_PAGES.map(page => (
            <li key={page.href}>
              <Link
                href={page.href}
                className='text-primary underline underline-offset-4'
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </MarketingContainer>
  );
}
