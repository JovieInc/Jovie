import type { Metadata } from 'next';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { IntegrationDirectory } from '@/components/organisms/integrations/IntegrationDirectory';
import { IntegrationRequestForm } from '@/components/organisms/integrations/IntegrationRequestForm';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { integrationsCopy } from '@/data/integrationsCopy';

export const revalidate = false;
export const metadata: Metadata = {
  title: 'Integrations',
  description: integrationsCopy.description,
  alternates: { canonical: `${BASE_URL}${APP_ROUTES.INTEGRATIONS}` },
};

export default function IntegrationsPage() {
  return (
    <div className='min-h-screen bg-page text-primary-token'>
      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <MarketingHero
          variant='unstyled'
          className='pt-20 pb-12 sm:pt-24 sm:pb-16'
        >
          <p className='text-sm font-medium text-tertiary-token'>
            Integrations
          </p>
          <h1 className='system-b-marketing-route-title mb-4 mt-6 max-w-3xl'>
            {integrationsCopy.title}
          </h1>
          <p className='max-w-2xl text-lg leading-relaxed text-secondary-token'>
            {integrationsCopy.description}
          </p>
        </MarketingHero>
        <IntegrationDirectory />
        <IntegrationRequestForm />
      </MarketingContainer>
    </div>
  );
}
