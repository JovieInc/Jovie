export type WebServerWarmupProfile = 'full' | 'public';

interface ResolveWarmupProfileOptions {
  readonly isCI?: boolean;
  readonly value?: string;
}

export function resolveWebServerWarmupProfile({
  isCI = Boolean(process.env.CI),
  value = process.env.E2E_WEB_SERVER_WARMUP,
}: ResolveWarmupProfileOptions = {}): WebServerWarmupProfile {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'full' || normalized === 'public') {
    return normalized;
  }

  if (normalized) {
    console.warn(
      `[e2e] Ignoring unsupported E2E_WEB_SERVER_WARMUP="${value}"; using ${isCI ? 'full' : 'public'}.`
    );
  }

  return isCI ? 'full' : 'public';
}
