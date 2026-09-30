import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getRoutedSolutionsPages,
  getSolutionsPage,
} from '@/content/pages/solutions';
import type { PageRecord } from '@/data/marketing/factory/pageRecord';
import { buildPageRecordMetadata } from '@/data/marketing/factory/pageRecordMetadata';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import {
  assertRenderableSolutionsRecord,
  SolutionsRecordBody,
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
      {record.seo.schema.includes('SoftwareApplication') ? (
        <script type='application/ld+json'>
          {buildSoftwareSchema(record.seo.description)}
        </script>
      ) : null}
      <SolutionsRecordBody record={record} />
    </>
  );
}
