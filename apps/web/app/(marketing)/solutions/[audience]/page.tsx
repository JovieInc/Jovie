import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import {
  getRoutedSolutionsPages,
  getSolutionsPage,
} from '@/content/pages/solutions';
import {
  FACTORY_PREVIEW_ROBOTS,
  loadFactoryPreviewRecord,
} from '@/content/pages/solutions/preview';
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

/** A factory-only shadow candidate (FACTORY_PREVIEW_RECORD); null on deploys. */
function previewRecord(): PageRecord | null {
  const preview = loadFactoryPreviewRecord();
  return preview?.family === 'solutions' && !getSolutionsPage(preview.slug)
    ? preview
    : null;
}

export function generateStaticParams() {
  const preview = previewRecord();
  return [...getRoutedSolutionsPages(), ...(preview ? [preview] : [])].map(
    record => ({ audience: record.slug })
  );
}

function loadRecord(audience: string): PageRecord {
  const preview = previewRecord();
  const record =
    getSolutionsPage(audience) ?? (preview?.slug === audience ? preview : null);
  if (!record) notFound();
  assertRenderableSolutionsRecord(record);
  return record;
}

export async function generateMetadata({
  params,
}: SolutionsAudiencePageProps): Promise<Metadata> {
  const record = loadRecord((await params).audience);
  const metadata = buildPageRecordMetadata(record);
  return record.id === previewRecord()?.id
    ? { ...metadata, robots: FACTORY_PREVIEW_ROBOTS }
    : metadata;
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
