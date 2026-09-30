import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import {
  getRoutedSolutionsPages,
  getSolutionsPage,
} from '@/content/pages/solutions';
import type { PageRecord } from '@/data/marketing/factory/pageRecord';
import { derivePageRecordContract } from '@/data/marketing/factory/pageRecordContract';
import { buildPageRecordMetadata } from '@/data/marketing/factory/pageRecordMetadata';
import {
  assertRenderableSolutionsRecord,
  SolutionsRecordBody,
  SolutionsRecordJsonLd,
} from './sections';

export const revalidate = false;
export const dynamicParams = false;

interface SolutionsAudiencePageProps {
  readonly params: Promise<{ audience: string }>;
}

export function generateStaticParams() {
  return getRoutedSolutionsPages().map(record => ({
    audience: record.slug,
  }));
}

function loadRecord(audience: string): PageRecord {
  const record = getSolutionsPage(audience);
  if (!record) notFound();
  assertRenderableSolutionsRecord(record);
  return record;
}

export async function generateMetadata({
  params,
}: SolutionsAudiencePageProps): Promise<Metadata> {
  return buildPageRecordMetadata(loadRecord((await params).audience));
}

export default async function SolutionsAudiencePage({
  params,
}: SolutionsAudiencePageProps) {
  const record = loadRecord((await params).audience);

  return (
    <>
      <MarketingPageContractMarkers
        contract={derivePageRecordContract(record)}
      />
      <SolutionsRecordJsonLd record={record} />
      <SolutionsRecordBody record={record} />
    </>
  );
}
