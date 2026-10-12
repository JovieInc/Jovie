/**
 * Low-value Sentry span filters (JOV-6109).
 *
 * These spans inflate trace volume and span quota without debugging value:
 *
 * - **CORS preflights and bare HEAD monitors** — `OPTIONS /*`, `HEAD /*`
 *   transactions carry no handler timing; the real request is traced.
 * - **Unauthenticated crawler/fetcher targets** — favicon, robots.txt,
 *   sitemap, webmanifest, apple-touch-icon, `.well-known`, `_next/data`,
 *   `_next/image`. The SDK already drops `_next/static`; these are the same
 *   class of automated noise.
 * - **Next.js OTel bookkeeping spans** — `BaseServer.*`, `NextServer.*`, and
 *   the `NextNodeServer.*` wrapper/resolution spans (`findPageComponents`,
 *   `createComponentTree`, `getLayoutOrPageModule`, `clientComponentLoading`,
 *   `startResponse`, `compression`, …) plus named resolution helpers
 *   (`resolve page components`, `build component tree`, `responseCache.*`,
 *   `start response`, `waitForAvailableStream`). These are framework plumbing
 *   inside every transaction; user-code spans (`executing api route`,
 *   `generateMetadata`, `use cache`, render handler spans) are kept.
 *
 * `ignoreSpans` drops a matching root span's whole transaction and removes
 * matching child spans from the waterfall under both trace lifecycles.
 *
 * Keep entries sorted by regex source so concurrent PRs merge cleanly.
 */

export const LOW_VALUE_SPAN_NAME_PATTERNS: ReadonlyArray<RegExp> = [
  /^BaseServer\./,
  /^GET \/\.well-known\//,
  /^GET \/_next\/(data|image)(\/|\?|$)/,
  /^GET \/apple-touch-icon/,
  /^GET \/favicon\.ico/,
  /^GET \/manifest\.(json|webmanifest)/,
  /^GET \/robots\.txt/,
  /^GET \/sitemap(-[\w-]+)?\.xml/,
  /^HEAD \//,
  /^NextNodeServer\.(clientComponentLoading|compression|createComponentTree|findPageComponents|getLayoutOrPageModule|getRequestHandler|handleRequest|initServer|run|server|startResponse)$/,
  /^NextServer\./,
  /^OPTIONS \//,
  /^responseCache\.(get|set)$/,
  /^(build component tree|client component loading|resolve metadata|resolve page components|resolve page metadata|resolve route modules|start response|waitForAvailableStream)$/,
];

/**
 * `ignoreSpans` entries for `Sentry.init` — name-regex filters only, matching
 * the SDK's documented `{ name: RegExp }` shape for clarity.
 */
export const LOW_VALUE_SPAN_FILTERS: ReadonlyArray<{ name: RegExp }> =
  LOW_VALUE_SPAN_NAME_PATTERNS.map(name => ({ name }));

/**
 * True when a span name is low-value framework or unauthenticated noise that
 * `ignoreSpans` will drop. Exported for tests and for any future
 * `beforeSendSpan`/sampling path that needs the same classification.
 */
export function isLowValueSpanName(name: string | null | undefined): boolean {
  if (!name) return false;
  return LOW_VALUE_SPAN_NAME_PATTERNS.some(pattern => pattern.test(name));
}
