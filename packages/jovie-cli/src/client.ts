export const DEFAULT_BASE_URL = 'https://jov.ie';
export const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchImplementation = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export type ResourceOptions = {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchImplementation;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export class JovieRequestError extends Error {
  readonly code = 'REQUEST_FAILED' as const;

  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    readonly responseBody?: string
  ) {
    super(message);
    this.name = 'JovieRequestError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Normalize a deployment root without accepting credentials or query state. */
export function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new JovieRequestError(`Invalid base URL: ${baseUrl}`, baseUrl);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new JovieRequestError(
      'Base URL must be an http(s) origin without credentials, a path, or query parameters.',
      baseUrl
    );
  }

  return url.origin;
}

function resourceUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${normalizeBaseUrl(baseUrl)}/`).toString();
}

function requestSignal(options: ResourceOptions): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  return options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
}

function getFetch(options: ResourceOptions): FetchImplementation {
  return options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
}

async function request(
  pathname: string,
  accept: string,
  options: ResourceOptions
): Promise<{ readonly body: string; readonly url: string }> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = resourceUrl(baseUrl, pathname);
  let response: Response;

  try {
    response = await getFetch(options)(url, {
      method: 'GET',
      headers: { Accept: accept },
      signal: requestSignal(options),
    });
  } catch (error) {
    throw new JovieRequestError(
      `GET ${url} failed: ${errorMessage(error)}`,
      url
    );
  }

  const body = await response.text();
  if (!response.ok) {
    throw new JovieRequestError(
      `GET ${url} returned HTTP ${response.status}`,
      url,
      response.status,
      body.slice(0, 1_000)
    );
  }

  return { body, url };
}

async function requestJson(
  pathname: string,
  options: ResourceOptions
): Promise<unknown> {
  const { body, url } = await request(pathname, 'application/json', options);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new JovieRequestError(
      `GET ${url} returned invalid JSON`,
      url,
      undefined,
      body.slice(0, 1_000)
    );
  }
}

async function requestText(
  pathname: string,
  options: ResourceOptions
): Promise<string> {
  const { body } = await request(pathname, 'text/plain', options);
  return body;
}

export function validateUsername(username: string): string {
  const normalized = username.trim();
  if (
    normalized.length < 3 ||
    normalized.length > 30 ||
    !/^[a-zA-Z0-9._-]+$/.test(normalized)
  ) {
    throw new JovieRequestError(
      'Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens.',
      `${DEFAULT_BASE_URL}/${encodeURIComponent(username)}`
    );
  }
  return normalized;
}

/** Fetch the public, unauthenticated artist API response. */
export function fetchArtist(
  username: string,
  options: ResourceOptions = {}
): Promise<unknown> {
  const normalized = validateUsername(username);
  return requestJson(`/api/v1/${encodeURIComponent(normalized)}`, options);
}

/** Fetch the canonical public OpenAPI 3.1 contract. */
export function fetchOpenApi(options: ResourceOptions = {}): Promise<unknown> {
  return requestJson('/api/v1/openapi.json', options);
}

/** Fetch the site-level machine-readable agent guide. */
export function fetchSiteLlms(
  full: boolean,
  options: ResourceOptions = {}
): Promise<string> {
  return requestText(full ? '/llms-full.txt' : '/llms.txt', options);
}

/** Fetch the machine-readable guide for one public artist. */
export function fetchArtistLlms(
  username: string,
  options: ResourceOptions = {}
): Promise<string> {
  const normalized = validateUsername(username);
  return requestText(`/${encodeURIComponent(normalized)}/llms.txt`, options);
}
