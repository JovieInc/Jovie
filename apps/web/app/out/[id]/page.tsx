import { AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { getWrappedLink } from '@/lib/services/link-wrapping';
import { getCategoryDescription } from '@/lib/utils/domain-categorizer';
import { createChallengeToken } from '@/lib/utils/url-encryption.server';
import { InterstitialClient } from './InterstitialClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps
  extends Readonly<{
    readonly params: Promise<{
      readonly id: string;
    }>;
  }> {}

const getCachedWrappedLink = cache(async (shortId: string) =>
  getWrappedLink(shortId)
);

const MISSING_LINK_METADATA = {
  title: 'Not Found',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    nosnippet: true,
    noarchive: true,
  },
} satisfies Metadata;

function MissingLinkState() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden' data-testid='not-found'>
        <ContentSectionHeader
          density='compact'
          title='Link Not Found'
          subtitle='The link you followed may be broken, expired, or unavailable.'
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-warning/20 bg-warning-subtle'>
            <AlertTriangle
              className='h-6 w-6 text-warning'
              aria-hidden='true'
            />
          </div>

          <p className='text-[13px] leading-5 text-tertiary-token'>
            Check the URL or ask the sender for a fresh link.
          </p>

          <Link
            href='/'
            className='inline-flex h-9 items-center justify-center rounded-lg bg-[var(--color-btn-primary-bg)] px-4 text-[13px] font-medium text-[var(--color-btn-primary-fg)] transition-colors duration-100 hover:bg-[var(--color-btn-primary-hover)]'
          >
            Return Home
          </Link>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}

export async function generateMetadata({
  params,
}: Readonly<PageProps>): Promise<Metadata> {
  const { id: shortId } = await params;

  if (!shortId || shortId.length > 20) {
    return MISSING_LINK_METADATA;
  }

  const wrappedLink = await getCachedWrappedLink(shortId);
  if (!wrappedLink) {
    return MISSING_LINK_METADATA;
  }

  return {
    title: 'Link Confirmation Required',
    description: 'This link requires confirmation before proceeding.',
    robots: {
      index: false,
      follow: false,
      nocache: true,
      nosnippet: true,
      noarchive: true,
    },
    referrer: 'no-referrer',
  };
}

export default async function InterstitialPage({
  params,
}: Readonly<PageProps>) {
  const { id: shortId } = await params;

  if (!shortId || shortId.length > 20) {
    return <MissingLinkState />;
  }

  const wrappedLink = await getCachedWrappedLink(shortId);

  if (!wrappedLink) {
    return <MissingLinkState />;
  }

  if (wrappedLink.kind !== 'sensitive') {
    redirect(`/go/${shortId}`);
  }

  const genericDescription = getCategoryDescription(
    wrappedLink.category || 'adult'
  );

  const { token: challengeToken } = createChallengeToken(shortId);

  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Link confirmation required'
          subtitle={genericDescription}
        />

        <div className='space-y-5 px-5 py-5 sm:px-6'>
          <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-warning/20 bg-warning-subtle'>
            <AlertTriangle
              className='h-6 w-6 text-warning'
              aria-hidden='true'
            />
          </div>

          <InterstitialClient
            shortId={shortId}
            challengeToken={challengeToken}
            titleAlias={wrappedLink.titleAlias || 'External Link'}
            domain={
              wrappedLink.category === 'adult' ||
              wrappedLink.category === 'dating'
                ? 'External Site'
                : wrappedLink.domain
            }
          />

          <p className='text-center text-[12px] text-tertiary-token'>
            This confirmation helps protect against automated access.
          </p>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
