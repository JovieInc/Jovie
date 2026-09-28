interface OvieOriginEnvironment {
  readonly VERCEL_ENV?: string;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Opt in one independently deployed Ovie origin. Invalid configuration stops
 * auth initialization rather than widening the host or CSRF allowlists.
 * Never include the supplied value in errors: it may contain credentials.
 */
export function resolveOvieWebOrigin(
  value: string | undefined,
  environment: OvieOriginEnvironment
): URL | undefined {
  if (value === undefined || value === '') return undefined;

  const invalid = () =>
    new Error(
      'OVIE_WEB_ORIGIN must be an exact HTTPS origin or a development loopback origin'
    );

  // Check the original input before URL normalization can discard a path,
  // empty query/fragment, backslash, or surrounding whitespace.
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value)) throw invalid();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }

  if (url.username || url.password || url.hostname.includes('*')) {
    throw invalid();
  }

  const isDevelopment =
    environment.VERCEL_ENV !== 'production' &&
    environment.VERCEL_ENV !== 'preview';
  const isLoopback = LOOPBACK_HOSTNAMES.has(url.hostname);

  if (isLoopback && !isDevelopment) throw invalid();
  if (url.protocol !== 'https:' && !(isLoopback && isDevelopment)) {
    throw invalid();
  }

  return url;
}
