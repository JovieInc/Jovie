import type { Metadata } from 'next';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = {
  title: 'Report abuse or a security issue',
  description:
    'Report a Jovie profile, smart link, or page for abuse, phishing, impersonation, or a security issue.',
  robots: {
    index: false,
    follow: false,
  },
};

interface ReportPageProps {
  readonly searchParams: Promise<{
    type?: string;
    target?: string;
  }>;
}

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const { type, target } = await searchParams;

  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Report this page'
          subtitle='Flag a Jovie profile, smart link, or page for abuse, phishing, impersonation, or a security issue.'
        />
        <div className='px-5 py-5 sm:px-6'>
          <ReportForm initialTargetType={type} initialTarget={target} />
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
