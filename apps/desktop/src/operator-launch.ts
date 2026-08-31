/**
 * Ovie operator launcher allowlist (JOV-5491).
 * Never invents URLs or interpolates secrets into command text.
 */

export const OPERATOR_WEB_ORIGINS = [
  'https://app.mercury.com',
  'https://mail.google.com',
  'https://linear.app',
  'https://vercel.com',
  'https://status.jov.ie',
  'https://jov.ie',
  'https://github.com',
] as const;

export const OPERATOR_SSH_HOSTS = ['gem'] as const;

export type OperatorLaunchKind = 'web' | 'ssh';

export interface OperatorLaunchRequest {
  readonly id: string;
  readonly kind: OperatorLaunchKind;
  readonly href?: string;
  readonly sshHost?: string;
}

export type OperatorLaunchDecision =
  | {
      readonly ok: true;
      readonly action: 'open-external';
      readonly url: string;
    }
  | {
      readonly ok: true;
      readonly action: 'open-ssh';
      readonly host: string;
      readonly command: string;
      readonly argv: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

const TAILSCALE_CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function isTailscaleHostname(hostname: string): boolean {
  return TAILSCALE_CGNAT.test(hostname);
}

function isJoviePublicHostname(hostname: string): boolean {
  return hostname === 'jov.ie' || hostname.endsWith('.jov.ie');
}

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
  if (parsed.protocol === 'http:') {
    return (
      isLoopbackHostname(parsed.hostname) ||
      isTailscaleHostname(parsed.hostname)
    );
  }
  if (parsed.protocol !== 'https:') return false;
  if (isJoviePublicHostname(parsed.hostname)) return true;
  return OPERATOR_WEB_ORIGINS.some(origin => parsed.origin === origin);
}

export function isAllowedOperatorSshHost(host: string): boolean {
  return (OPERATOR_SSH_HOSTS as readonly string[]).includes(host);
}

export function buildSymphonySshArgv(host: string): readonly string[] {
  return ['ssh', '-t', host];
}

export function parseOperatorLaunchRequest(
  value: unknown
): OperatorLaunchRequest | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Partial<OperatorLaunchRequest>;
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (record.kind !== 'web' && record.kind !== 'ssh') return null;
  if (record.href !== undefined && typeof record.href !== 'string') return null;
  if (record.sshHost !== undefined && typeof record.sshHost !== 'string') {
    return null;
  }
  return {
    id: record.id,
    kind: record.kind,
    href: record.href,
    sshHost: record.sshHost,
  };
}

export function decideOperatorLaunch(
  request: OperatorLaunchRequest
): OperatorLaunchDecision {
  if (request.kind === 'ssh') {
    const host = request.sshHost ?? '';
    if (!isAllowedOperatorSshHost(host)) {
      return { ok: false, reason: 'blocked-ssh-host' };
    }
    const argv = buildSymphonySshArgv(host);
    return {
      ok: true,
      action: 'open-ssh',
      host,
      command: argv.join(' '),
      argv,
    };
  }

  const url = request.href ?? '';
  if (!isAllowedOperatorWebUrl(url)) {
    return { ok: false, reason: 'blocked-url' };
  }
  return { ok: true, action: 'open-external', url };
}

export function terminalLaunchSpec(
  platform: NodeJS.Platform,
  sshCommand: string
): { readonly command: string; readonly args: readonly string[] } | null {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: [
        '-e',
        `tell application "Terminal" to do script ${JSON.stringify(sshCommand)}`,
      ],
    };
  }
  if (platform === 'linux') {
    return {
      command: 'x-terminal-emulator',
      args: ['-e', 'bash', '-lc', sshCommand],
    };
  }
  return null;
}
