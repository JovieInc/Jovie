import { BASE_URL } from '@/constants/app';
import { buildUTMUrl, type UTMParams } from '@/lib/utm';
import type { ShareContext, ShareSurfaceType } from './types';

function trimText(input: string, maxLength: number): string {
  return input.length > maxLength
    ? `${input.slice(0, maxLength - 1).trimEnd()}…`
    : input;
}

function getSurfaceLabel(surfaceType: ShareSurfaceType): string {
  switch (surfaceType) {
    case 'blog':
      return 'blog post';
    case 'profile':
      return 'profile';
    case 'release':
      return 'release';
    case 'playlist':
      return 'playlist';
  }
}

export function buildPreparedShareText(params: {
  readonly surfaceType: ShareSurfaceType;
  readonly title: string;
  readonly artistName?: string;
}): string {
  const { surfaceType, title, artistName } = params;

  switch (surfaceType) {
    case 'blog':
      return `${title} from Jovie`;
    case 'profile':
      return `Check out ${title} on Jovie`;
    case 'release':
      return artistName
        ? `Listen to ${title} by ${artistName} on Jovie`
        : `Listen to ${title} on Jovie`;
    case 'playlist':
      return `Listen to the ${title} playlist on Jovie`;
  }
}

export function buildEmailSubject(params: {
  readonly surfaceType: ShareSurfaceType;
  readonly title: string;
  readonly artistName?: string;
}): string {
  const { surfaceType, title, artistName } = params;

  switch (surfaceType) {
    case 'blog':
      return `Read this on Jovie: ${title}`;
    case 'profile':
      return `Check out ${title} on Jovie`;
    case 'release':
      return artistName
        ? `Listen to ${title} by ${artistName} on Jovie`
        : `Listen to ${title} on Jovie`;
    case 'playlist':
      return `Listen to the ${title} playlist on Jovie`;
  }
}

export function buildEmailBody(params: {
  readonly preparedText: string;
  readonly canonicalUrl: string;
  readonly description?: string;
}): string {
  const lines = [params.preparedText];

  if (params.description) {
    lines.push('', trimText(params.description, 180));
  }

  lines.push('', params.canonicalUrl, '', 'Sent via Jovie');

  return lines.join('\n');
}

export function buildStoryAssetFileName(params: {
  readonly surfaceType: ShareSurfaceType;
  readonly slug: string;
}): string {
  return `jovie-${params.surfaceType}-${params.slug}-story.png`;
}

export function buildDisplayUrl(pathname: string): string {
  return `${BASE_URL}${pathname}`.replace(/^https?:\/\//u, '');
}

export function buildTrackedShareUrl(
  context: ShareContext,
  utmParams: UTMParams
): string {
  return buildUTMUrl({
    url: context.canonicalUrl,
    params: utmParams,
    context: context.utmContext,
  }).url;
}

export function buildMailtoHref(params: {
  readonly subject: string;
  readonly body: string;
}): string {
  const searchParams = new URLSearchParams({
    subject: params.subject,
    body: params.body,
  });
  return `mailto:?${searchParams.toString()}`;
}

export function slugifyShareValue(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-');

  let start = 0;
  while (start < normalized.length && normalized.charCodeAt(start) === 45) {
    start += 1;
  }

  let end = normalized.length;
  while (end > start && normalized.charCodeAt(end - 1) === 45) {
    end -= 1;
  }

  return normalized.slice(start, end);
}

export function buildPublicShareFallbackText(context: ShareContext): string {
  return `${context.preparedText}\n${context.canonicalUrl}`;
}

export function buildSurfaceSummary(context: ShareContext): string {
  return (
    context.description ??
    `Share this ${getSurfaceLabel(context.surfaceType)} from Jovie.`
  );
}
