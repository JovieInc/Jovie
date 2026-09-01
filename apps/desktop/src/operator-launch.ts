// biome-ignore format: compact allowlist
export const OPERATOR_WEB_ORIGINS = [
  'https://app.mercury.com', 'https://mail.google.com', 'https://linear.app',
  'https://vercel.com', 'https://status.jov.ie', 'https://jov.ie',
  'https://github.com',
] as const;

export const GEM_SSH_COMMAND = 'ssh gem' as const;

// biome-ignore format: compact request
export interface OperatorLaunchRequest {
  readonly id: string; readonly kind: 'web'; readonly href: string;
}

export type OperatorLaunchDecision =
  | {
      readonly ok: true;
      readonly action: 'open-external';
      readonly url: string;
    }
  | { readonly ok: false; readonly reason: string };

export type GemTerminalLaunchResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-platform' | 'open-terminal-failed';
    };

export interface TerminalLaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
}

interface DetachedTerminalProcess {
  once(event: 'error', listener: () => void): this;
  once(event: 'exit', listener: (code: number | null) => void): this;
  unref(): void;
}

export type SpawnTerminalProcess = (
  command: string,
  args: readonly string[]
) => DetachedTerminalProcess;

const TAILSCALE_CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

export function isAllowedOperatorWebUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return false;
  }
  const host = parsed.hostname;
  if (parsed.protocol === 'http:') {
    return (
      host === '127.0.0.1' || host === 'localhost' || TAILSCALE_CGNAT.test(host)
    );
  }
  if (parsed.protocol !== 'https:') return false;
  if (host === 'jov.ie' || host.endsWith('.jov.ie')) return true;
  return OPERATOR_WEB_ORIGINS.some(origin => parsed.origin === origin);
}

export function parseOperatorLaunchRequest(
  value: unknown
): OperatorLaunchRequest | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Partial<OperatorLaunchRequest>;
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (record.kind !== 'web' || typeof record.href !== 'string') return null;
  return {
    id: record.id,
    kind: 'web',
    href: record.href,
  };
}

export function decideOperatorLaunch(
  request: OperatorLaunchRequest
): OperatorLaunchDecision {
  if (!isAllowedOperatorWebUrl(request.href)) {
    return { ok: false, reason: 'blocked-url' };
  }
  return { ok: true, action: 'open-external', url: request.href };
}

export function isAllowedGemTerminalSenderUrl(
  urlString: string,
  appOrigin: string
): boolean {
  try {
    const parsed = new URL(urlString);
    return (
      parsed.origin === appOrigin &&
      parsed.pathname === '/hud' &&
      parsed.searchParams.get('ovie') === 'mac'
    );
  } catch {
    return false;
  }
}

export function gemTerminalLaunchSpec(
  platform: NodeJS.Platform
): TerminalLaunchSpec | null {
  if (platform !== 'darwin') return null;
  return {
    command: 'osascript',
    args: [
      '-e',
      [
        'tell application "Terminal"',
        'activate',
        `do script ${JSON.stringify(GEM_SSH_COMMAND)}`,
        'end tell',
      ].join('\n'),
    ],
  };
}

export function launchGemTerminal(
  platform: NodeJS.Platform,
  spawnProcess: SpawnTerminalProcess
): Promise<GemTerminalLaunchResult> {
  const spec = gemTerminalLaunchSpec(platform);
  if (!spec) {
    return Promise.resolve({ ok: false, reason: 'unsupported-platform' });
  }

  return new Promise(resolve => {
    let settled = false;
    const settle = (result: GemTerminalLaunchResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const child = spawnProcess(spec.command, spec.args);
      child.once('error', () => {
        settle({ ok: false, reason: 'open-terminal-failed' });
      });
      child.once('exit', code => {
        settle(
          code === 0
            ? { ok: true }
            : { ok: false, reason: 'open-terminal-failed' }
        );
      });
      child.unref();
    } catch {
      settle({ ok: false, reason: 'open-terminal-failed' });
    }
  });
}
