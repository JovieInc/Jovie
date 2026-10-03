export const DEFAULT_BASE_URL = 'https://jov.ie';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_USER_AGENT = 'jovie-cli';
export class JovieInputError extends Error {
    code = 'INVALID_INPUT';
    constructor(message) {
        super(message);
        this.name = 'JovieInputError';
    }
}
export class JovieRequestError extends Error {
    url;
    status;
    responseBody;
    retryAfterSeconds;
    apiCode;
    code = 'REQUEST_FAILED';
    constructor(message, url, status, responseBody, retryAfterSeconds, 
    /** Stable server error code (e.g. RATE_LIMITED) when the API sent one. */
    apiCode) {
        super(message);
        this.url = url;
        this.status = status;
        this.responseBody = responseBody;
        this.retryAfterSeconds = retryAfterSeconds;
        this.apiCode = apiCode;
        this.name = 'JovieRequestError';
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Normalize a deployment root without accepting credentials or query state. */
export function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
    let url;
    try {
        url = new URL(baseUrl);
    }
    catch {
        throw new JovieInputError(`Invalid base URL: ${baseUrl}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.pathname !== '/' && url.pathname !== '')) {
        throw new JovieInputError('Base URL must be an http(s) origin without credentials, a path, or query parameters.');
    }
    return url.origin;
}
function resourceUrl(baseUrl, pathname) {
    return new URL(pathname, `${normalizeBaseUrl(baseUrl)}/`).toString();
}
function requestSignal(options) {
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
}
function getFetch(options) {
    return options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
}
function parseRetryAfterSeconds(value, nowMs = Date.now()) {
    if (!value)
        return undefined;
    if (/^\d+$/.test(value.trim())) {
        const seconds = Number(value);
        return Number.isSafeInteger(seconds) ? seconds : undefined;
    }
    const retryAtMs = Date.parse(value);
    if (!Number.isFinite(retryAtMs))
        return undefined;
    return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}
function parseApiCode(body) {
    try {
        const code = JSON.parse(body).error
            ?.code;
        return typeof code === 'string' ? code : undefined;
    }
    catch {
        return undefined;
    }
}
async function request(pathname, accept, options, jsonBody) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const url = resourceUrl(baseUrl, pathname);
    const method = jsonBody === undefined ? 'GET' : 'POST';
    let response;
    let lastError;
    // One retry absorbs transient transport failures and cold-start timeouts;
    // each attempt gets a fresh timeout signal. A caller abort never retries.
    for (let attempt = 0; attempt < 2 && !options.signal?.aborted; attempt++) {
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
                signal: requestSignal(options),
            });
            break;
        }
        catch (error) {
            lastError = error;
        }
    }
    if (!response) {
        throw new JovieRequestError(`${method} ${url} failed: ${errorMessage(lastError)}`, url);
    }
    const body = await response.text();
    if (!response.ok) {
        throw new JovieRequestError(`${method} ${url} returned HTTP ${response.status}`, url, response.status, body.slice(0, 1_000), parseRetryAfterSeconds(response.headers.get('retry-after')), parseApiCode(body));
    }
    return { body, url };
}
async function requestJson(pathname, options, jsonBody) {
    const { body, url } = await request(pathname, 'application/json', options, jsonBody);
    try {
        return JSON.parse(body);
    }
    catch {
        throw new JovieRequestError(`${jsonBody === undefined ? 'GET' : 'POST'} ${url} returned invalid JSON`, url, undefined, body.slice(0, 1_000));
    }
}
async function requestText(pathname, options) {
    const { body } = await request(pathname, 'text/plain', options);
    return body;
}
export function validateUsername(username) {
    const normalized = username.trim();
    if (normalized.length < 3 ||
        normalized.length > 30 ||
        !/^[a-zA-Z0-9._-]+$/.test(normalized)) {
        throw new JovieInputError('Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens.');
    }
    return normalized;
}
/** Fetch the public, unauthenticated artist API response. */
export function fetchArtist(username, options = {}) {
    const normalized = validateUsername(username);
    return requestJson(`/api/v1/${encodeURIComponent(normalized)}`, options);
}
/** Fetch the canonical public OpenAPI 3.1 contract. */
export function fetchOpenApi(options = {}) {
    return requestJson('/api/v1/openapi.json', options);
}
/** Fetch the site-level machine-readable agent guide. */
export function fetchSiteLlms(full, options = {}) {
    return requestText(full ? '/llms-full.txt' : '/llms.txt', options);
}
/** Fetch the machine-readable guide for one public artist. */
export function fetchArtistLlms(username, options = {}) {
    const normalized = validateUsername(username);
    return requestText(`/${encodeURIComponent(normalized)}/llms.txt`, options);
}
/**
 * Create (or find) a Jovie profile for a Spotify artist. Returns the public
 * profile URL and, when unclaimed, a claim URL the human opens to verify
 * ownership. Anonymous and rate limited per IP.
 */
export function createProfile(spotifyArtistUrl, options = {}) {
    let url;
    try {
        url = new URL(spotifyArtistUrl.trim());
    }
    catch {
        throw new JovieInputError(`Invalid URL: ${spotifyArtistUrl}`);
    }
    if (url.protocol !== 'https:' ||
        !/(^|\.)spotify\.com$/.test(url.hostname) ||
        !/^\/(intl-[a-z-]+\/)?artist\/[A-Za-z0-9]+\/?$/.test(url.pathname)) {
        throw new JovieInputError('Expected a Spotify artist URL like https://open.spotify.com/artist/<id>.');
    }
    return requestJson('/api/agents/profiles', options, { url: url.toString() });
}
/** File a bug or feedback report. Returns `{ reportId }`. */
export function reportIssue(report, context = {}, options = {}) {
    const title = report.title.trim();
    const details = report.details.trim();
    if (!title || !details) {
        throw new JovieInputError('A report needs both a title and details.');
    }
    const safeContext = Object.fromEntries(Object.entries(context).filter(([, value]) => value));
    return requestJson('/api/agents/feedback', options, {
        kind: report.kind,
        title,
        details,
        context: safeContext,
    });
}
//# sourceMappingURL=client.js.map