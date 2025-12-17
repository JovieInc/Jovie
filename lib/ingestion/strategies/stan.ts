import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  normalizeHandle as baseNormalizeHandle,
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
  stripTrackingParams,
  validatePlatformUrl,
} from './base';

const STAN_CONFIG: StrategyConfig = {
  platformId: 'stan',
  platformName: 'Stan',
  validHosts: new Set([
    'stan.me',
    'www.stan.me',
    'stan.store',
    'www.stan.store',
    'stanwith.me',
    'www.stanwith.me',
  ]),
  defaultTimeoutMs: 10000,
};

const STAN_SKIP_HOSTS = new Set([
  ...STAN_CONFIG.validHosts,
  'cdn.stan.me',
  'assets.stan.me',
]);

export function isStanUrl(url: string): boolean {
  return validatePlatformUrl(url, STAN_CONFIG).valid;
}

export function validateStanUrl(url: string): string | null {
  const result = validatePlatformUrl(url, STAN_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

export function extractStanHandle(url: string): string | null {
  const result = validatePlatformUrl(url, STAN_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

export function normalizeStanHandle(handle: string): string {
  return baseNormalizeHandle(handle);
}

export async function fetchStanDocument(
  sourceUrl: string,
  timeoutMs = STAN_CONFIG.defaultTimeoutMs
): Promise<string> {
  const validatedUrl = validateStanUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Stan URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    allowedHosts: STAN_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}

type StanLink = {
  url?: string | null;
  title?: string | null;
  hidden?: boolean | null;
};

type StanProfileData = {
  displayName?: string | null;
  avatarUrl?: string | null;
  links?: StanLink[] | null;
};

type StanNextData = {
  props?: {
    pageProps?: {
      profile?: StanProfileData;
      links?: StanLink[] | null;
      seo?: { title?: string | null; image?: string | null } | null;
    };
  };
};

function addLink(
  links: ExtractionResult['links'],
  seen: Set<string>,
  candidateUrl: string,
  title?: string | null
) {
  try {
    const normalizedUrl = stripTrackingParams(normalizeUrl(candidateUrl));
    const detected = detectPlatform(normalizedUrl);
    if (!detected.isValid) return;

    const canonical = canonicalIdentity({
      platform: detected.platform,
      normalizedUrl: detected.normalizedUrl,
    });
    if (seen.has(canonical)) return;
    seen.add(canonical);

    links.push({
      url: detected.normalizedUrl,
      platformId: detected.platform.id,
      title: title ?? detected.suggestedTitle,
      sourcePlatform: 'stan',
      evidence: {
        sources: ['stan'],
        signals: ['stan_profile_link', canonical],
      },
    });
  } catch {
    // Ignore malformed links
  }
}

export function extractStan(html: string): ExtractionResult {
  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();

  const nextData = extractScriptJson<StanNextData>(html, '__NEXT_DATA__');
  const profile = nextData?.props?.pageProps?.profile ?? null;
  const structuredLinks =
    profile?.links ?? nextData?.props?.pageProps?.links ?? null;

  if (structuredLinks) {
    for (const entry of structuredLinks) {
      if (!entry || entry.hidden) continue;
      if (entry.url) {
        addLink(links, seen, entry.url, entry.title ?? undefined);
      }
    }
  }

  const fallbackLinks = extractLinks(html, {
    skipHosts: STAN_SKIP_HOSTS,
    sourcePlatform: 'stan',
    sourceSignal: 'stan_profile_link',
  });

  for (const link of fallbackLinks) {
    addLink(links, seen, link.url, link.title);
  }

  const metaTitle =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title');
  const metaImage =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image');

  const displayName =
    profile?.displayName ??
    nextData?.props?.pageProps?.seo?.title ??
    metaTitle ??
    null;
  const avatarUrl = profile?.avatarUrl ?? metaImage ?? null;

  return createExtractionResult(links, displayName, avatarUrl);
}
