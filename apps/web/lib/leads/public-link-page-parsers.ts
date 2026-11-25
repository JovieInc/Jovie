/**
 * Turns a fetched public page into an observation. HTML and JSON are data.
 * Nothing here fetches or follows instructions found in the page.
 */

import {
  type ObservedPublicLinkPage,
  observePublicLinkPage,
} from './public-link-observation';

interface LooseRecord {
  readonly [key: string]: unknown;
}

export function parseLinktreeAccount(
  account: unknown,
  pageUrl: string,
  observedAt: string
): ObservedPublicLinkPage | null {
  const record = asRecord(account);
  if (!record) return null;
  return observePublicLinkPage({
    url: pageUrl,
    handle: stringField(record, 'username'),
    displayName: stringField(record, 'pageTitle'),
    bio: stringField(record, 'description'),
    text: titlesFrom(record.links).join('\n'),
    links: [...urlsFrom(record.links), ...urlsFrom(record.socialLinks)],
    hasTrackingPixels: Boolean(
      record.facebookPixelId || record.tiktokPixelId || record.googleAnalyticsId
    ),
    observedAt,
  });
}

export function parseLayloProfile(
  profile: unknown,
  user: unknown,
  pageUrl: string,
  observedAt: string
): ObservedPublicLinkPage | null {
  const profileRecord = asRecord(profile);
  const userRecord = asRecord(user);
  const username =
    stringField(userRecord, 'username') ??
    stringField(asRecord(profileRecord?.user), 'username');
  const links = [
    'spotify',
    'instagram',
    'youtube',
    'tiktok',
    'twitter',
    'twitch',
    'store',
    'website',
    'soundcloud',
  ].flatMap(key => {
    const value = stringField(userRecord, key);
    return value ? [value] : [];
  });
  return observePublicLinkPage({
    url: username ? `https://laylo.com/${username.toLowerCase()}` : pageUrl,
    handle: username,
    displayName:
      stringField(userRecord, 'displayName') ??
      stringField(profileRecord, 'title'),
    bio:
      stringField(userRecord, 'description') ??
      stringField(profileRecord, 'description'),
    links,
    observedAt,
  });
}

export function parseSmartLinkHtml(
  html: string,
  pageUrl: string,
  observedAt: string
): ObservedPublicLinkPage | null {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null;
  const description =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
    )?.[1] ??
    null;
  const links = [...html.matchAll(/href=["'](https?:\/\/[^"'#]+)["']/gi)]
    .map(match => decodeBasicEntities(match[1] ?? ''))
    .filter(href => !isSmartLinkAsset(href));
  return observePublicLinkPage({
    url: pageUrl,
    displayName: title ? decodeBasicEntities(title) : null,
    bio: description ? decodeBasicEntities(description) : null,
    links,
    observedAt,
  });
}

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' ? (value as LooseRecord) : null;
}

function stringField(record: LooseRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function urlsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const url = asRecord(entry)?.url;
    return typeof url === 'string' ? [url] : [];
  });
}

function titlesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const title = asRecord(entry)?.title;
    return typeof title === 'string' ? [title] : [];
  });
}

const SMART_LINK_ASSET_HOSTS = [
  'adnxs.com',
  'api.ffm.to',
  'assetlab.io',
  'cloudflare.com',
  'doubleclick.net',
  'facebook.net',
  'google-analytics.com',
  'googleapis.com',
  'googletagmanager.com',
  'gstatic.com',
  'jsdelivr.net',
  'schema.org',
  'unpkg.com',
  'w3.org',
];

function isSmartLinkAsset(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return SMART_LINK_ASSET_HOSTS.some(
      root => host === root || host.endsWith(`.${root}`)
    );
  } catch {
    return true;
  }
}

function decodeBasicEntities(value: string): string {
  return value
    .replaceAll(/&#(\d+);/g, (_, digits: string) => codePoint(Number(digits)))
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      codePoint(Number.parseInt(hex, 16))
    )
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

function codePoint(code: number): string {
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
}
