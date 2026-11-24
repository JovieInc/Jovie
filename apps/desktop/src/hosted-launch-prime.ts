/**
 * Warm the hosted origin before the splash→document navigation.
 * Never blocks createWindow; failures are ignored.
 */
export interface HostedLaunchPrimeInput {
  readonly origin: string;
  readonly entryUrl: string;
  readonly preconnect: (options: {
    readonly url: string;
    readonly numSockets: number;
  }) => void;
  readonly fetch: (
    url: string,
    init?: { readonly cache?: RequestCache; readonly redirect?: RequestRedirect }
  ) => Promise<{ readonly ok: boolean } | Response>;
}

export const HOSTED_LAUNCH_PRECONNECT_SOCKETS = 4;

/** DNS/TLS + a couple of sockets for the app origin. */
export function preconnectHostedOrigin(input: {
  readonly origin: string;
  readonly preconnect: HostedLaunchPrimeInput['preconnect'];
  readonly numSockets?: number;
}): void {
  input.preconnect({
    url: input.origin,
    numSockets: input.numSockets ?? HOSTED_LAUNCH_PRECONNECT_SOCKETS,
  });
}

/**
 * Fire-and-forget fetches that populate Chromium's HTTP cache and keep the
 * origin warm while the local splash paints. Credentials are omitted so this
 * never confuses auth cookies; the real window navigation carries the session.
 */
export function primeHostedLaunchCache(
  input: Pick<HostedLaunchPrimeInput, 'origin' | 'entryUrl' | 'fetch'>
): void {
  const buildInfo = new URL('/api/health/build-info', input.origin).toString();
  for (const url of [buildInfo, input.entryUrl]) {
    void input.fetch(url, { cache: 'force-cache', redirect: 'follow' }).catch(
      () => undefined
    );
  }
}

export function primeHostedLaunch(input: HostedLaunchPrimeInput): void {
  preconnectHostedOrigin(input);
  primeHostedLaunchCache(input);
}
