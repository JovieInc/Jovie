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

/** Echo untrusted text on one bounded terminal line (no escape sequences). */
export function displayValue(value: string, max = 120): string {
  const flat = safeDiagnostic(value).replace(
    /[\u0000-\u001f\u007f-\u009f]/g,
    ' '
  );
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const TLS_ERROR =
  /^(?:CERT_|ERR_TLS_|ERR_SSL_|DEPTH_ZERO_SELF_SIGNED_CERT$|SELF_SIGNED_CERT_IN_CHAIN$|UNABLE_TO_(?:VERIFY_LEAF_SIGNATURE|GET_ISSUER_CERT(?:_LOCALLY)?)$|HOSTNAME_MISMATCH$)/;

/** Walk an undici `fetch failed` cause chain for the first system error code. */
function transportCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const { code, name, message } = current as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
    };
    if (typeof message === 'string' && /^Proxy response \(\d+\)/.test(message))
      return 'PROXY';
    if (name === 'TimeoutError') return 'TIMEOUT';
    if (name === 'AbortError' && code !== 'UND_ERR_ABORTED') return 'ABORTED';
    if (typeof code === 'string' && code !== 'ABORT_ERR') return code;
    if (typeof message === 'string' && /unexpected redirect/i.test(message))
      return 'REDIRECT';
    if (typeof message === 'string' && /^bad port$/i.test(message))
      return 'BAD_PORT';
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

type TransportFailure = { readonly message: string; readonly retry: boolean };

/** One actionable line per failure class; unknown failures keep the cause. */
function describeTransportFailure(
  method: string,
  url: string,
  error: unknown,
  timeoutMs: number
): TransportFailure {
  const host = new URL(url).host;
  const code = transportCode(error);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NONAME')
    return {
      message: `Could not resolve ${host}. Check your internet connection or --base-url.`,
      retry: code === 'EAI_AGAIN',
    };
  if (code === 'ECONNREFUSED')
    return {
      message: `Could not connect to ${host} (connection refused). Check --base-url or try again later.`,
      retry: true,
    };
  if (
    code === 'TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT'
  )
    return {
      message: `${host} did not respond within ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`,
      retry: code !== 'TIMEOUT',
    };
  if (code === 'ABORTED')
    return { message: `${method} ${url} was canceled.`, retry: false };
  if (code && TLS_ERROR.test(code))
    return {
      message: `TLS certificate check failed for ${host} (${code}). Behind a TLS-inspecting proxy, set NODE_EXTRA_CA_CERTS to its CA bundle.`,
      retry: false,
    };
  if (code === 'PROXY')
    return {
      message: `The proxy refused to connect to ${host}. Check HTTP_PROXY, HTTPS_PROXY, and NO_PROXY.`,
      retry: false,
    };
  if (code === 'BAD_PORT')
    return {
      message: `Port ${new URL(url).port} is blocked for HTTP clients. Use a different port in --base-url.`,
      retry: false,
    };
  if (code === 'REDIRECT')
    return {
      message: `${host} redirected the request. Pass the final origin with --base-url.`,
      retry: false,
    };
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETDOWN' ||
    code === 'UND_ERR_SOCKET'
  )
    return {
      message: `Network error reaching ${host} (${code}). Check your connection and try again.`,
      retry: true,
    };
  return {
    message: `${method} ${url} failed: ${errorMessage(error)}`,
    retry: true,
  };
}

function serverErrorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as {
      error?: unknown;
      message?: unknown;
    };
    const error = parsed?.error;
    const message =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object'
          ? (error as { message?: unknown }).message
          : parsed?.message;
    return typeof message === 'string' && message.trim()
      ? displayValue(message.trim(), 200)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Status-first guidance; a structured server message wins when present. */
function describeHttpFailure(
  method: string,
  url: string,
  status: number,
  body: string,
  retryAfterSeconds: number | undefined
): string {
  const host = new URL(url).host;
  const server = serverErrorMessage(body);
  const where = `${method} ${url} returned HTTP ${status}`;
  if (status === 429)
    return `Rate limited by ${host}. ${
      retryAfterSeconds === undefined
        ? 'Wait a minute and try again.'
        : `Retry in ${retryAfterSeconds}s.`
    } (${where})`;
  if (server) return `${server} (${where})`;
  if (status === 404)
    return `Not found. Check that ${new URL(url).origin} is a Jovie deployment. (${where})`;
  if (status === 401 || status === 403)
    return `${host} refused the request. (${where})`;
  if (status >= 500)
    return `${host} is temporarily unavailable. Try again shortly. (${where})`;
  return where;
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
/** Reads make at most this many attempts inside one shared deadline. */
export const MAX_READ_ATTEMPTS = 3;
/** Longer server-requested waits are surfaced instead of slept through. */
const MAX_RETRY_AFTER_SECONDS = 5;

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) return retryAfterSeconds * 1000;
  return 250 * 4 ** attempt + Math.floor(Math.random() * 100);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
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
    throw new JovieInputError(
      'Invalid base URL. Expected an origin like https://jov.ie.'
    );
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // One deadline covers every attempt, backoff, and the body, so a command
  // never waits longer than timeoutMs however the server misbehaves.
  const signal = requestSignal(options);
  // Only reads retry. A timed-out write may have committed; retrying without a
  // server idempotency key can create duplicate profiles or reports.
  const maxAttempts = method === 'GET' ? MAX_READ_ATTEMPTS : 1;

  for (let attempt = 0; ; attempt++) {
    const last = attempt + 1 >= maxAttempts;
    let response: Response;
    try {
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
    } catch (error) {
      const failure = describeTransportFailure(
        method,
        url,
        signal.aborted && !options.signal?.aborted
          ? Object.assign(new Error('timeout'), { name: 'TimeoutError' })
          : error,
        timeoutMs
      );
      if (last || !failure.retry || signal.aborted) {
        throw Object.assign(
          new JovieRequestError(
            failure.message,
            url,
            undefined,
            undefined,
            undefined,
            undefined,
            failure.retry
          ),
          { cause: error }
        );
      }
      await sleep(backoffMs(attempt), signal);
      continue;
    }

    let body: string;
    try {
      body = await readResponseBody(response, signal);
    } catch (error) {
      const host = new URL(url).host;
      if (signal.aborted && !options.signal?.aborted) {
        throw new JovieRequestError(
          `${host} did not finish responding within ${Math.round(timeoutMs / 1000)}s. Try again.`,
          url,
          response.status,
          undefined,
          undefined,
          undefined,
          true
        );
      }
      // undici reports a mid-body disconnect as a bare `terminated`.
      const dropped = transportCode(error) === 'UND_ERR_SOCKET';
      if (dropped && !last && !signal.aborted) {
        await sleep(backoffMs(attempt), signal);
        continue;
      }
      throw new JovieRequestError(
        dropped
          ? `${host} dropped the connection mid-response. Try again.`
          : errorMessage(error),
        url,
        response.status,
        undefined,
        undefined,
        undefined,
        dropped || undefined
      );
    }
    if (response.ok) return { body, url };

    const retryAfterSeconds = parseRetryAfterSeconds(
      response.headers.get('retry-after')
    );
    const apiCode = parseApiCode(body);
    const retryable =
      RETRY_STATUSES.has(response.status) &&
      // A structured 502 is an application answer (e.g. LOOKUP_FAILED).
      !(response.status === 502 && apiCode);
    if (
      !last &&
      retryable &&
      (retryAfterSeconds === undefined ||
        retryAfterSeconds <= MAX_RETRY_AFTER_SECONDS)
    ) {
      await sleep(backoffMs(attempt, retryAfterSeconds), signal);
      if (!signal.aborted) continue;
    }
    throw new JovieRequestError(
      describeHttpFailure(
        method,
        url,
        response.status,
        body,
        retryAfterSeconds
      ),
      url,
      response.status,
      safeDiagnostic(body.slice(0, 1_000)),
      retryAfterSeconds,
      apiCode,
      RETRY_STATUSES.has(response.status) ? true : undefined
    );
  }
}

async function requestJson(
  pathname: string,
  options: ResourceOptions,
  jsonBody?: unknown,
  accept = 'application/json'
): Promise<unknown> {
  const { body, url } = await request(pathname, accept, options, jsonBody);
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

/** Read through the existing public music MCP transport, without credentials. */
export async function resolveMusic(
  input: string,
  flags: {
    readonly kind?: string;
    readonly artist?: string;
    readonly territory?: string;
  } = {},
  options: ResourceOptions = {}
): Promise<unknown> {
  const value = input.trim();
  const kind = flags.kind ?? 'artist';
  if (
    !value ||
    value.length > 500 ||
    !['artist', 'track', 'album'].includes(kind)
  ) {
    throw new JovieInputError(
      'Provide an artist, track, or album input of 1–500 characters.'
    );
  }
  if (
    (flags.artist !== undefined &&
      (!flags.artist.trim() || flags.artist.length > 200)) ||
    (flags.territory !== undefined && !/^[A-Za-z]{2}$/.test(flags.territory))
  ) {
    throw new JovieInputError(
      'Artist must be 1–200 characters; territory must be a two-letter country code.'
    );
  }
  const id = 'jovie-music-resolve';
  const response = (await requestJson(
    '/api/music/mcp',
    options,
    {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: 'resolve',
        arguments: {
          input: value,
          kind,
          ...(flags.artist === undefined
            ? {}
            : { artist: flags.artist.trim() }),
          ...(flags.territory === undefined
            ? {}
            : { territory: flags.territory.toUpperCase() }),
        },
      },
    },
    'application/json, text/event-stream'
  )) as {
    jsonrpc?: string;
    id?: string;
    error?: unknown;
    result?: {
      isError?: boolean;
      structuredContent?: { error?: { code?: unknown; retryable?: unknown } };
    };
  } | null;
  const result = response?.result;
  if (
    response?.jsonrpc !== '2.0' ||
    response.id !== id ||
    response.error ||
    !result?.structuredContent ||
    typeof result.structuredContent !== 'object' ||
    Array.isArray(result.structuredContent)
  ) {
    throw new JovieRequestError(
      'Music resolver returned an invalid MCP response.',
      `${normalizeBaseUrl(options.baseUrl)}/api/music/mcp`,
      undefined,
      undefined,
      undefined,
      'INVALID_RESPONSE',
      false
    );
  }
  if (result.isError || result.structuredContent.error) {
    const error = result.structuredContent.error;
    const code =
      typeof error?.code === 'string' && /^[A-Z_]{1,64}$/.test(error.code)
        ? error.code
        : 'RESOLUTION_FAILED';
    throw new JovieRequestError(
      `Music resolution failed: ${code}`,
      `${normalizeBaseUrl(options.baseUrl)}/api/music/mcp`,
      undefined,
      undefined,
      undefined,
      code,
      error?.retryable === true
    );
  }
  return result.structuredContent;
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

/** A 404 on an artist route means the username, not the network, is wrong. */
async function explainMissingArtist<T>(
  username: string,
  pending: Promise<T>
): Promise<T> {
  try {
    return await pending;
  } catch (error) {
    if (error instanceof JovieRequestError && error.status === 404) {
      throw new JovieRequestError(
        `No public Jovie artist named "${username}". Check the username.`,
        error.url,
        error.status,
        error.responseBody,
        error.retryAfterSeconds,
        error.apiCode ?? 'ARTIST_NOT_FOUND',
        false
      );
    }
    throw error;
  }
}

/** Fetch the public, unauthenticated artist API response. */
export function fetchArtist(
  username: string,
  options: ResourceOptions = {}
): Promise<unknown> {
  const normalized = validateUsername(username);
  return explainMissingArtist(
    normalized,
    requestJson(`/api/v1/${encodeURIComponent(normalized)}`, options)
  );
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
  return explainMissingArtist(
    normalized,
    requestText(`/${encodeURIComponent(normalized)}/llms.txt`, options)
  );
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
    throw new JovieInputError(`Invalid URL: ${displayValue(spotifyArtistUrl)}`);
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

const CREATOR_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;

/** `platform:handle` expands to the canonical profile URL for that platform. */
const HANDLE_SOURCES: Readonly<Record<string, (handle: string) => string>> = {
  instagram: handle => `https://www.instagram.com/${handle}`,
  linktree: handle => `https://linktr.ee/${handle}`,
  tiktok: handle => `https://www.tiktok.com/@${handle}`,
  youtube: handle =>
    /^UC[\w-]{22}$/.test(handle)
      ? `https://www.youtube.com/channel/${handle}`
      : `https://www.youtube.com/@${handle}`,
};

function expandCreatorInput(input: string): string {
  const match = /^([a-z]+):([^:]+)$/.exec(input);
  if (!match) return input;
  const build = HANDLE_SOURCES[match[1] as string];
  if (!build) return input;
  const handle = (match[2] as string).replace(/^@+/, '');
  if (!CREATOR_HANDLE.test(handle)) {
    throw new JovieInputError(
      `Invalid handle in ${displayValue(input)}. Expected <platform>:<handle> using letters, numbers, dots, underscores, or hyphens.`
    );
  }
  return build(handle);
}

/** Extract public creator fields without creating or modifying a profile. */
export function lookupCreator(
  creatorUrl: string,
  options: ResourceOptions = {}
): Promise<unknown> {
  const candidate = expandCreatorInput(creatorUrl.trim());
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new JovieInputError(`Invalid URL: ${displayValue(creatorUrl)}`);
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
