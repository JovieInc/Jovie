import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { getConnectorAvailability } from '@/lib/connectors/availability.server';
import { getAdvertisedConnectorIntegrations } from '@/lib/connectors/capabilities';

export const metadata: Metadata = {
  title: 'Integrations | Jovie',
  description:
    'See the account integrations and specific capabilities available in Jovie.',
};

// Public capabilities reflect deployment configuration. Rebuild this static
// reference when provider configuration changes; Settings checks live availability.
export const revalidate = false;

export default function IntegrationsDirectoryPage() {
  const integrations = getAdvertisedConnectorIntegrations(
    getConnectorAvailability()
  );
  return (
    <MarketingContainer width='page' className='py-12 sm:py-16'>
      <header className='mb-8 max-w-prose-canonical space-y-3'>
        <h1 className='text-3xl font-semibold tracking-tight text-primary'>
          Integrations
        </h1>
        <p className='text-secondary'>
          Connect your accounts in Settings. Each integration supports the
          specific capabilities listed below. You choose permissions when
          connecting; writes still require approval.
        </p>
        <Link
          href={APP_ROUTES.SETTINGS_CONNECTORS}
          className='text-sm text-primary underline underline-offset-4'
        >
          Manage integrations
        </Link>
      </header>
      <div className='divide-y divide-subtle'>
        {integrations.map(integration => (
          <section
            key={integration.id}
            className='grid gap-3 py-6 sm:grid-cols-3'
            aria-labelledby={`integration-${integration.id}`}
          >
            <h2
              id={`integration-${integration.id}`}
              className='text-lg font-medium text-primary'
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
    </MarketingContainer>
  );
}
