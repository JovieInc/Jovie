import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { ChangelogTimeline } from '@/components/marketing/changelog/ChangelogTimeline';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { changelogInlineText } from '@/lib/changelog-parser';
import { getChangelogReleases } from '@/lib/changelog-source';

export const revalidate = false;

type ChangelogReleasePageProps = {
  readonly params: Promise<{ readonly version: string }>;
};

export async function generateStaticParams() {
  const releases = await getChangelogReleases();
  return releases.map(release => ({ version: release.version }));
}

export async function generateMetadata({
  params,
}: ChangelogReleasePageProps): Promise<Metadata> {
  const { version } = await params;
  const releases = await getChangelogReleases();
  const release = releases.find(candidate => candidate.version === version);
  if (!release) return {};

  const canonical = `${BASE_URL}/changelog/${encodeURIComponent(version)}`;
  const description = release.summary
    ? changelogInlineText(release.summary)
    : `Features, improvements, and fixes in ${APP_NAME} v${version}.`;
  return {
    title: `${APP_NAME} v${version}`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${APP_NAME} v${version}`,
      description,
      type: 'article',
      url: canonical,
      publishedTime: release.date ? `${release.date}T00:00:00Z` : undefined,
    },
  };
}

export default async function ChangelogReleasePage({
  params,
}: ChangelogReleasePageProps) {
  const { version } = await params;
  const releases = await getChangelogReleases();
  const release = releases.find(candidate => candidate.version === version);
  if (!release) notFound();

  return (
    <section className='min-h-screen bg-page text-primary-token'>
      <MarketingHero variant='left'>
        <Link
          href='/changelog'
          className='text-sm font-medium text-tertiary-token transition-colors hover:text-primary-token'
        >
          Changelog
        </Link>
        <h1 className='mb-4 mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
          {APP_NAME} Version {release.version}
        </h1>
      </MarketingHero>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />
        <ChangelogTimeline releases={[release]} />
      </MarketingContainer>
    </section>
  );
}
