import type { Metadata } from 'next';

export type SeoRequiredTag =
  | 'title'
  | 'description'
  | 'canonical'
  | 'openGraph'
  | 'twitter';

export interface SeoTagCheckResult {
  readonly tag: SeoRequiredTag;
  readonly passed: boolean;
  readonly remediation?: string;
}

export function getMetadataString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && 'absolute' in value) {
    return String((value as { absolute: string }).absolute).trim();
  }
  return String(value).trim();
}

function getTwitterRecord(
  twitter: Metadata['twitter']
): Record<string, unknown> | undefined {
  if (!twitter || typeof twitter !== 'object') return undefined;
  return twitter as Record<string, unknown>;
}

export function validateMetadataTags(
  metadata: Metadata,
  requiredTags: readonly SeoRequiredTag[]
): SeoTagCheckResult[] {
  return requiredTags.map(tag => {
    switch (tag) {
      case 'title': {
        const title = getMetadataString(metadata.title);
        return {
          tag,
          passed: title.length > 0,
          remediation:
            title.length === 0
              ? 'Add a non-empty `title` to generateMetadata/metadata export.'
              : undefined,
        };
      }
      case 'description': {
        const description = getMetadataString(metadata.description);
        return {
          tag,
          passed: description.length > 0,
          remediation:
            description.length === 0
              ? 'Add a non-empty `description` meta tag via generateMetadata.'
              : undefined,
        };
      }
      case 'canonical': {
        const canonical = getMetadataString(metadata.alternates?.canonical);
        return {
          tag,
          passed: canonical.length > 0,
          remediation:
            canonical.length === 0
              ? 'Add `alternates.canonical` in generateMetadata (mechanical fix).'
              : undefined,
        };
      }
      case 'openGraph': {
        const og = metadata.openGraph as Record<string, unknown> | undefined;
        const title = getMetadataString(og?.title);
        const description = getMetadataString(og?.description);
        const url = getMetadataString(og?.url);
        const type = getMetadataString(og?.type);
        const siteName = getMetadataString(og?.siteName);
        const passed =
          title.length > 0 &&
          description.length > 0 &&
          url.length > 0 &&
          type.length > 0 &&
          siteName.length > 0;
        return {
          tag,
          passed,
          remediation: passed
            ? undefined
            : 'Populate openGraph.title, description, url, type, and siteName.',
        };
      }
      case 'twitter': {
        const twitter = getTwitterRecord(metadata.twitter);
        const card = getMetadataString(twitter?.card);
        const title = getMetadataString(twitter?.title);
        const passed = card.length > 0 && title.length > 0;
        return {
          tag,
          passed,
          remediation: passed
            ? undefined
            : 'Populate twitter.card and twitter.title in metadata.',
        };
      }
      default: {
        const _exhaustive: never = tag;
        return { tag: _exhaustive, passed: false };
      }
    }
  });
}

export function assertMetadataRatchet(
  routeId: string,
  metadata: Metadata,
  requiredTags: readonly SeoRequiredTag[]
): void {
  const failures = validateMetadataTags(metadata, requiredTags).filter(
    result => !result.passed
  );

  if (failures.length === 0) return;

  const lines = failures.map(
    failure =>
      `  - ${failure.tag}: ${failure.remediation ?? 'missing required SEO tag'}`
  );

  throw new Error(
    `[seo-ratchet] Route "${routeId}" lost required SEO tags:\n${lines.join('\n')}\n` +
      'Update seo-ratchet.baseline.json only when the omission is intentional.'
  );
}
