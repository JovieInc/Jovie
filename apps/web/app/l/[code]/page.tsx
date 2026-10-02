import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { NextRequest } from 'next/server';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { isSmartLinkCrawler } from '@/lib/analytics/smart-link-admission';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import {
  allowIfRateLimitBackendDegraded,
  publicClickLimiter,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';
import { jovieLinkMetadata } from '@/lib/smart-link-mvp/page-metadata';
import {
  findSmartLinkByCode,
  recordSmartLinkClick,
} from '@/lib/smart-link-mvp/store';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^[a-z2-9]{8}$/;

interface PageProps {
  readonly params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  if (!isCodeFlagEnabled('SMART_LINK_MVP')) return {};
  const { code } = await params;
  if (!CODE_PATTERN.test(code)) return {};
  const link = await findSmartLinkByCode(code);
  if (!link) return {};
  const pageUrl = new URL(`/l/${code}`, BASE_URL).toString();
  return jovieLinkMetadata({
    title: link.title,
    artistName: link.artistName,
    artworkUrl: link.artworkUrl,
    pageUrl,
  });
}

function orderedProviders(
  providers: ReadonlyArray<{ key: string; label: string; url: string }>
) {
  const rank = new Map(PRIMARY_PROVIDER_KEYS.map((key, index) => [key, index]));
  return [...providers]
    .filter(provider => PROVIDER_CONFIG[provider.key])
    .sort((left, right) => {
      const leftRank = rank.get(left.key as ProviderKey) ?? 100;
      const rightRank = rank.get(right.key as ProviderKey) ?? 100;
      return leftRank - rightRank;
    })
    .map(provider => {
      const config = PROVIDER_CONFIG[provider.key]!;
      return {
        key: provider.key as ProviderKey,
        label: config.label,
        accent: config.accent,
        url: provider.url,
      };
    });
}

export default async function JovieLinkPage({ params }: PageProps) {
  if (!isCodeFlagEnabled('SMART_LINK_MVP')) notFound();
  const { code } = await params;
  if (!CODE_PATTERN.test(code)) notFound();
  const link = await findSmartLinkByCode(code);
  if (!link || link.providers.length === 0) notFound();

  const requestHeaders = await headers();
  const detection = detectBot(
    new NextRequest(`${BASE_URL}/l/${code}`, { headers: requestHeaders }),
    `/l/${code}`
  );
  const crawler = isSmartLinkCrawler(detection);
  if (!crawler) {
    const rateLimit = allowIfRateLimitBackendDegraded(
      await publicClickLimiter.limit(extractClientIP(requestHeaders)),
      { route: '/l/[code]', operation: 'smart_link_click' }
    );
    if (rateLimit?.success) {
      await recordSmartLinkClick(code);
      await trackServerEvent('smart_link_clicked', {
        smartLinkCode: code,
        kind: link.kind,
        unclaimed: true,
      });
    }
  }

  return (
    <ReleaseLandingPage
      release={{
        title: link.title ?? 'Jovie link',
        artworkUrl: link.artworkUrl,
        releaseDate: null,
      }}
      artist={{
        name: link.artistName ?? '',
        handle: null,
        avatarUrl: null,
      }}
      providers={orderedProviders(link.providers)}
      makerHref={APP_ROUTES.SMART_LINKS}
      tracking={{
        contentType: link.kind === 'artist' ? 'release' : 'track',
        contentId: code,
        smartLinkSlug: code,
      }}
    />
  );
}
