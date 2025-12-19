import { NextRequest, NextResponse } from 'next/server';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import { resolveReleaseBySlug } from '@/lib/discography/store';
import type { ProviderKey } from '@/lib/discography/types';

type ReleaseEntry = NonNullable<ReturnType<typeof resolveReleaseBySlug>>;
type ReleaseRecord = ReleaseEntry['release'];

function pickProviderUrl(
  release: ReleaseRecord,
  forcedProvider?: ProviderKey | null
): string | null {
  const providerOrder: ProviderKey[] = forcedProvider
    ? [
        forcedProvider,
        ...PRIMARY_PROVIDER_KEYS.filter(key => key !== forcedProvider),
      ]
    : PRIMARY_PROVIDER_KEYS;

  for (const key of providerOrder) {
    const match = release.providers.find(
      (provider: ReleaseRecord['providers'][number]) => provider.key === key
    );
    if (match?.url) return match.url;
  }

  const fallback = release.providers.find(
    (provider: ReleaseRecord['providers'][number]) => provider.url
  );
  return fallback?.url ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: 'Missing release' }, { status: 404 });
  }

  const releaseEntry = resolveReleaseBySlug(slug);
  if (!releaseEntry) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  const providerParam = request.nextUrl.searchParams.get('provider');
  const providerKey = providerParam ? (providerParam as ProviderKey) : null;

  if (providerKey && !PROVIDER_CONFIG[providerKey]) {
    return NextResponse.json(
      { error: 'Provider not supported' },
      { status: 400 }
    );
  }

  const targetUrl = pickProviderUrl(releaseEntry.release, providerKey);
  if (!targetUrl) {
    return NextResponse.json({ error: 'Link unavailable' }, { status: 404 });
  }

  const response = NextResponse.redirect(targetUrl, { status: 302 });
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
