import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomepageSpecSections } from '@/components/homepage/HomepageSpecSections';
import { verifyPreviewToken } from '@/lib/content-records/access.server';
import { experimentArmBody } from '@/lib/content-records/experiment';
import { validateContentRecord } from '@/lib/content-records/kind';
import { MARKETING_PAGE_KIND } from '@/lib/content-records/marketing-page';
import { contentReviewIdentity } from '@/lib/content-records/publication';
import { getContentVersion } from '@/lib/content-records/store.server';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { HomepageQueryProvider } from '../../(home)/homepage-query-provider';

/**
 * Signed preview of one stored homepage spec version, before or after it is
 * published. The link carries an HMAC of the version id (`?token=`) and an
 * optional experiment arm (`?arm=`). Unsigned, unknown, or invalid versions
 * 404. Never indexed; reading `searchParams` makes it a per-request render,
 * and it is not a marketing page.
 */

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ContentPreviewPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{
    token?: string;
    arm?: string;
    digest?: string;
    live?: string;
  }>;
}>) {
  const [{ versionId }, { token, arm, digest, live }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!/^[0-9a-f-]{36}$/.test(versionId)) notFound();
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) notFound();
  if (!verifyPreviewToken({ reviewDigest: digest }, token)) notFound();
  if (live !== 'none' && !/^[a-f0-9-]{36}$/.test(live ?? '')) notFound();

  const version = await getContentVersion(versionId);
  if (
    !version ||
    version.kind !== MARKETING_PAGE_KIND.kind ||
    version.key !== 'home' ||
    version.schemaVersion !== MARKETING_PAGE_KIND.schemaVersion
  ) {
    notFound();
  }
  const validated = validateContentRecord(
    MARKETING_PAGE_KIND,
    version.key,
    version.data
  );
  if (!validated.ok) notFound();
  const identity = contentReviewIdentity(
    version,
    await getDeployedBuildInfo(),
    live === 'none' ? null : live!,
    arm ?? null
  );
  if (!identity || identity.reviewDigest !== digest) notFound();

  const sections = experimentArmBody(
    validated.data.sections,
    validated.data.experiment,
    arm
  );
  return (
    <HomepageQueryProvider>
      <meta name='jovie-content-review' content={identity.reviewDigest} />
      <HomepageSpecSections sections={sections} />
    </HomepageQueryProvider>
  );
}
