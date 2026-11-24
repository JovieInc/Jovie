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
    init?: {
      readonly cache?: 'force-cache' | 'no-store' | 'reload';
      readonly redirect?: 'follow' | 'error' | 'manual';
    }
  ) => Promise<{ readonly ok: boolean } | Response>;
}

export type HostedSplashWindow = {
  readonly isDestroyed: () => boolean;
  readonly webContents: {
    readonly getURL: () => string;
    readonly once: (event: 'dom-ready', listener: () => void) => void;
  };
  readonly loadURL: (url: string) => void | Promise<void>;
};

/**
 * Paint local splash first, warm the hosted origin during that paint, then
 * navigate to the hosted entry on splash `dom-ready` (earlier than
 * `did-finish-load`) so cold launch is not fully serialized.
 */
export function loadHostedUrlAfterSplash(input: {
  readonly win: HostedSplashWindow;
  readonly hostedUrl: string;
  readonly origin: string;
  readonly entryUrl: string;
  readonly splashUrl: string;
  readonly fetch: HostedLaunchPrimeInput['fetch'];
}): void {
  const navigateToHosted = (): void => {
    if (input.win.isDestroyed()) return;
    void input.win.loadURL(input.hostedUrl);
  };

  if (input.win.webContents.getURL().startsWith('data:text/html')) {
    navigateToHosted();
    return;
  }

  primeHostedLaunchCache({
    origin: input.origin,
    entryUrl: input.hostedUrl.startsWith('http')
      ? input.hostedUrl
      : input.entryUrl,
    fetch: input.fetch,
  });
  input.win.webContents.once('dom-ready', navigateToHosted);
  void input.win.loadURL(input.splashUrl);
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
    void input
      .fetch(url, { cache: 'force-cache', redirect: 'follow' })
      .catch(() => undefined);
  }
}

export function primeHostedLaunch(input: HostedLaunchPrimeInput): void {
  preconnectHostedOrigin(input);
  primeHostedLaunchCache(input);
}
