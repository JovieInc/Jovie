/** Canonical exact-host auth-origin policy, with no runtime environment reads. */
const BETTER_AUTH_URL_HOSTS = {
  production: new Set(['jov.ie', 'www.jov.ie']),
  staging: new Set(['staging.jov.ie']),
  local: new Set(['localhost', '127.0.0.1', '[::1]']),
} as const;

export function parseUrlHostname(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveBetterAuthUrlEnv(
  vercelEnv: string,
  publicAppUrl: string | undefined
): 'production' | 'staging' | 'local' | 'preview' {
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') {
    // Staging alias deploys use preview on Vercel but host staging.jov.ie.
    const publicUrl = publicAppUrl;
    const host = parseUrlHostname(publicUrl);
    if (host && BETTER_AUTH_URL_HOSTS.staging.has(host)) return 'staging';
    return 'preview';
  }
  return 'local';
}

export function isAllowedBetterAuthHost(
  hostname: string,
  envKind: 'production' | 'staging' | 'local' | 'preview',
  platformHosts: readonly (string | undefined)[]
): boolean {
  if (envKind === 'production') {
    return BETTER_AUTH_URL_HOSTS.production.has(hostname);
  }
  if (envKind === 'staging') {
    return BETTER_AUTH_URL_HOSTS.staging.has(hostname);
  }
  if (envKind === 'local') {
    return (
      BETTER_AUTH_URL_HOSTS.local.has(hostname) ||
      hostname.endsWith('.localhost')
    );
  }
  // Preview deployments: allow only exact Vercel-provided deployment or
  // branch hosts. The global *.vercel.app namespace is attacker-controlled.
  const vercelHosts = new Set(
    platformHosts
      .filter((host): host is string => Boolean(host))
      .map(host => host.toLowerCase())
  );
  return vercelHosts.has(hostname);
}

/**
 * Validation rule: BETTER_AUTH_URL / NEXT_PUBLIC_BETTER_AUTH_URL must match
 * the environment origin and must not cross local/staging/production.
 */
export function checkBetterAuthUrlOriginPolicy({
  betterAuthUrl,
  publicBetterAuthUrl,
  publicAppUrl,
  vercelEnv,
  vercelUrl,
  vercelBranchUrl,
}: {
  betterAuthUrl: string | undefined;
  publicBetterAuthUrl: string | undefined;
  publicAppUrl: string | undefined;
  vercelEnv: string;
  vercelUrl: string | undefined;
  vercelBranchUrl: string | undefined;
}): { type: 'critical'; message: string } | null {
  const envKind = resolveBetterAuthUrlEnv(vercelEnv, publicAppUrl);
  const candidates: Array<{ label: string; value: string | undefined }> = [
    { label: 'BETTER_AUTH_URL', value: betterAuthUrl },
    {
      label: 'NEXT_PUBLIC_BETTER_AUTH_URL',
      value: publicBetterAuthUrl,
    },
  ];

  for (const { label, value } of candidates) {
    if (!value?.trim()) {
      // Optional in local/dev; production/preview secret check is separate.
      // Public URL is optional when same-origin client derives base from window.
      continue;
    }

    const hostname = parseUrlHostname(value);
    if (!hostname) {
      return {
        type: 'critical',
        message: `${label} is not a valid URL`,
      };
    }

    // Cross-environment hard fails (never print the full URL with secrets).
    const isProdHost = BETTER_AUTH_URL_HOSTS.production.has(hostname);
    const isStagingHost = BETTER_AUTH_URL_HOSTS.staging.has(hostname);
    const isLocalHost =
      BETTER_AUTH_URL_HOSTS.local.has(hostname) ||
      hostname.endsWith('.localhost');

    if (envKind === 'production' && (isStagingHost || isLocalHost)) {
      return {
        type: 'critical',
        message: `${label} host must be production (jov.ie), not ${hostname}`,
      };
    }
    if (envKind === 'staging' && (isProdHost || isLocalHost)) {
      return {
        type: 'critical',
        message: `${label} host must be staging (staging.jov.ie), not ${hostname}`,
      };
    }
    if (envKind === 'local' && (isProdHost || isStagingHost)) {
      return {
        type: 'critical',
        message: `${label} host must be local, not ${hostname}`,
      };
    }

    if (
      !isAllowedBetterAuthHost(hostname, envKind, [vercelUrl, vercelBranchUrl])
    ) {
      return {
        type: 'critical',
        message: `${label} host ${hostname} is not allowed for this environment`,
      };
    }
  }

  // When both are set, they must resolve to the same origin host.
  const serverHost = parseUrlHostname(betterAuthUrl);
  const publicHost = parseUrlHostname(publicBetterAuthUrl);
  if (serverHost && publicHost && serverHost !== publicHost) {
    return {
      type: 'critical',
      message:
        'BETTER_AUTH_URL and NEXT_PUBLIC_BETTER_AUTH_URL hosts must match',
    };
  }

  return null;
}
