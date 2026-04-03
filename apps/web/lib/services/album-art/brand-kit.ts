const TRUSTED_BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';
const TRUSTED_BLOB_HOST = 'blob.vercel-storage.com';

export function normalizeLogoAssetUrl(
  url: string | null | undefined
): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error('Logo asset URL must be a valid URL');
  }

  const isTrustedBlobHost =
    parsedUrl.hostname === TRUSTED_BLOB_HOST ||
    parsedUrl.hostname.endsWith(TRUSTED_BLOB_HOST_SUFFIX);

  if (parsedUrl.protocol !== 'https:' || !isTrustedBlobHost) {
    throw new Error('Logo asset URL must use trusted blob storage');
  }

  return parsedUrl.toString();
}

export function resolveUpdatedLogoAssetUrl(params: {
  readonly nextLogoAssetUrl: string | null | undefined;
  readonly existingLogoAssetUrl: string | null;
}): string | null {
  if (params.nextLogoAssetUrl === undefined) {
    return params.existingLogoAssetUrl;
  }

  return normalizeLogoAssetUrl(params.nextLogoAssetUrl);
}
