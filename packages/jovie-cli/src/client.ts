export const DEFAULT_BASE_URL = 'https://jov.ie';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_USER_AGENT = 'jovie-cli';

export type FetchImplementation = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export type ResourceOptions = {
  readonly workerToken?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchImplementation;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
};

export class JovieInputError extends Error {
  readonly code = 'INVALID_INPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'JovieInputError';
  }
}

export class JovieRequestError extends Error {
  readonly code = 'REQUEST_FAILED' as const;

  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    readonly responseBody?: string,
    readonly retryAfterSeconds?: number,
    /** Stable server error code (e.g. RATE_LIMITED) when the API sent one. */
    readonly apiCode?: string,
    readonly retryable?: boolean
  ) {
    super(message);
    this.name = 'JovieRequestError';
  }
}

export function safeDiagnostic(value: string): string {
  return value.replace(
    /(?:Bearer\s+[^\s"']+|jwf\.[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{16,})/gi,
    '[redacted]'
  );
}
function errorMessage(error: unknown): string {
  return safeDiagnostic(error instanceof Error ? error.message : String(error));
}
/** Response consumption shares the request deadline and has a hard byte cap. */
export async function readResponseBody(
  response: Response,
  signal: AbortSignal
): Promise<string> {
  if (!response.body) {
    if (signal.aborted)
      throw new Error('Response deadline exceeded or canceled.');
    return '';
  }
  const reader = response.body.getReader();
  if (signal.aborted) {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
    throw new Error('Response deadline exceeded or canceled.');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    rejectAbort(new Error('Response deadline exceeded or canceled.'));
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), aborted]);
      if (signal.aborted)
        throw new Error('Response deadline exceeded or canceled.');
      if (part.done) break;
      size += part.value.length;
      if (size > 1_048_576) {
        void reader.cancel().catch(() => {});
        throw new Error('Response body exceeds 1 MiB.');
      }
      chunks.push(part.value);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/** Normalize a deployment root without accepting credentials or query state. */
export function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new JovieInputError(`Invalid base URL: ${baseUrl}`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new JovieInputError(
      'Base URL must be an http(s) origin without credentials, a path, or query parameters.'
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

export function parseRetryAfterSeconds(
  value: string | null,
  nowMs = Date.now()
): number | undefined {
  if (!value) return undefined;

  if (/^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }

  const retryAtMs = Date.parse(value);
  if (!Number.isFinite(retryAtMs)) return undefined;
  return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}

function parseApiCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: unknown };
      code?: unknown;
    };
    const code = parsed?.error?.code ?? parsed?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

async function request(
  pathname: string,
  accept: string,
  options: ResourceOptions,
  jsonBody?: unknown
): Promise<{ readonly body: string; readonly url: string }> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = resourceUrl(baseUrl, pathname);
  const method = jsonBody === undefined ? 'GET' : 'POST';
  let response: Response | undefined;
  let lastError: unknown;
  let signal = requestSignal(options);

  // Only reads retry transport failures. A timed-out write may have committed;
  // retrying without a server idempotency key can create duplicate reports.
  for (
    let attempt = 0;
    attempt < (method === 'GET' ? 2 : 1) && !options.signal?.aborted;
    attempt++
  ) {
    try {
      signal = requestSignal(options);
      response = await getFetch(options)(url, {
        method,
        headers: {
          Accept: accept,
          'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
          ...(jsonBody === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        ...(jsonBody === undefined ? {} : { body: JSON.stringify(jsonBody) }),
        signal,
        redirect: 'error',
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    throw new JovieRequestError(
      `${method} ${url} failed: ${errorMessage(lastError)}`,
      url
    );
  }

  let body: string;
  try {
    body = await readResponseBody(response, signal);
  } catch (error) {
    throw new JovieRequestError(errorMessage(error), url, response.status);
  }
  if (!response.ok) {
    throw new JovieRequestError(
      `${method} ${url} returned HTTP ${response.status}`,
      url,
      response.status,
      safeDiagnostic(body.slice(0, 1_000)),
      parseRetryAfterSeconds(response.headers.get('retry-after')),
      parseApiCode(body)
    );
  }

  return { body, url };
}

async function requestJson(
  pathname: string,
  options: ResourceOptions,
  jsonBody?: unknown
): Promise<unknown> {
  const { body, url } = await request(
    pathname,
    'application/json',
    options,
    jsonBody
  );
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new JovieRequestError(
      `${jsonBody === undefined ? 'GET' : 'POST'} ${url} returned invalid JSON`,
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
    throw new JovieInputError(
      'Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens.'
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

/**
 * Create (or find) a Jovie profile for a Spotify artist. Returns the public
 * profile URL and, when unclaimed, a claim URL the human opens to verify
 * ownership. Anonymous and rate limited per IP.
 */
export function createProfile(
  spotifyArtistUrl: string,
  options: ResourceOptions = {}
): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(spotifyArtistUrl.trim());
  } catch {
    throw new JovieInputError(`Invalid URL: ${spotifyArtistUrl}`);
  }
  if (
    url.protocol !== 'https:' ||
    !/(^|\.)spotify\.com$/.test(url.hostname) ||
    !/^\/(intl-[a-z-]+\/)?artist\/[A-Za-z0-9]+\/?$/.test(url.pathname)
  ) {
    throw new JovieInputError(
      'Expected a Spotify artist URL like https://open.spotify.com/artist/<id>.'
    );
  }
  return requestJson('/api/agents/profiles', options, { url: url.toString() });
}

/** Extract public creator fields without creating or modifying a profile. */
export function lookupCreator(
  creatorUrl: string,
  options: ResourceOptions = {}
): Promise<unknown> {
  const candidate = creatorUrl.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new JovieInputError(`Invalid URL: ${creatorUrl}`);
  }
  if (
    candidate.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password
  ) {
    throw new JovieInputError(
      'Expected an HTTPS YouTube, Instagram, TikTok, or Linktree profile URL.'
    );
  }

  return requestJson(
    `/api/agents/creator-lookup?url=${encodeURIComponent(url.toString())}`,
    options
  );
}

export type ReportKind = 'bug' | 'feedback';

/** Safe execution context only; never env, credentials, or file contents. */
export interface ReportContext {
  readonly cliVersion?: string;
  readonly command?: string;
  readonly apiCode?: string;
  readonly scenario?: string;
  readonly platform?: string;
  readonly runtime?: string;
  readonly channel?: 'cli' | 'mcp';
}

/** File a bug or feedback report. Returns `{ reportId }`. */
export function reportIssue(
  report: {
    readonly kind: ReportKind;
    readonly title: string;
    readonly details: string;
  },
  context: ReportContext = {},
  options: ResourceOptions = {}
): Promise<unknown> {
  const title = report.title.trim();
  const details = report.details.trim();
  if (!title || !details) {
    throw new JovieInputError('A report needs both a title and details.');
  }
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value)
  );
  return requestJson('/api/agents/feedback', options, {
    kind: report.kind,
    title,
    details,
    context: safeContext,
  });
}
