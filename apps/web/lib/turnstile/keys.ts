/**
 * Cloudflare Turnstile key resolution by hostname.
 *
 * Production widget sitekeys are domain-locked via Hostname Management.
 * Serving them on Vercel preview hosts (`*.vercel.app`) or localhost yields
 * client error **110200** ("Domain not authorized") and blocks signup.
 *
 * On those non-allowlisted deploy hosts we use Cloudflare's public always-pass
 * dummy keys so the widget and siteverify still work. Allowlisted production /
 * staging hosts always keep the configured real keys — bot protection is not
 * weakened on jov.ie.
 *
 * Dummy keys:
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 *
 * Hostname allowlist source of truth for the real widget:
 * `scripts/turnstile-config.ts` (PRODUCTION_TURNSTILE_HOSTNAMES +
 * STAGING_TURNSTILE_HOSTNAMES).
 */

/** Cloudflare always-pass (visible) dummy sitekey — public test credential. */
export const TURNSTILE_ALWAYS_PASS_SITE_KEY =
  '1x00000000000000000000AA' as const;

/** Matching always-pass dummy secret — public test credential. */
export const TURNSTILE_ALWAYS_PASS_SECRET_KEY =
  '1x0000000000000000000000000000000AA' as const;

/**
 * Hostnames authorized for the production Turnstile widget.
 * Keep in sync with `scripts/turnstile-config.ts` prod + staging lists.
 */
export const TURNSTILE_WIDGET_HOSTNAMES = [
  'jov.ie',
  'www.jov.ie',
  'staging.jov.ie',
  'main.jov.ie',
] as const;

export function normalizeTurnstileHostname(
  hostname: string | null | undefined
): string | null {
  if (!hostname) return null;
  const first = hostname.split(',')[0]?.trim().toLowerCase() ?? '';
  if (!first) return null;

  if (first.startsWith('http://') || first.startsWith('https://')) {
    try {
      return new URL(first).hostname.toLowerCase() || null;
    } catch {
      return null;
    }
  }

  // Bracketed IPv6 with optional port: [::1]:443
  if (first.startsWith('[')) {
    const end = first.indexOf(']');
    if (end > 0) return first.slice(1, end) || null;
  }

  // Bare IPv6 (e.g. ::1) — do not strip ":digits" as a port.
  if (first.includes(':') && first.split(':').length > 2) {
    return first;
  }

  // hostname:port
  return first.replace(/:\d+$/, '') || null;
}

/**
 * Hosts where domain-locked production sitekeys fail with client error 110200.
 * These surfaces use Cloudflare dummy keys instead of the real widget keys.
 */
export function shouldUseTurnstileDummyKeys(
  hostname: string | null | undefined
): boolean {
  const host = normalizeTurnstileHostname(hostname);
  if (!host) return false;

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]'
  ) {
    return true;
  }
  if (host.endsWith('.localhost')) return true;
  // Vercel preview / personal deployment URLs
  // (e.g. jovie-timwhite-jovie.vercel.app).
  if (host.endsWith('.vercel.app')) return true;
  return false;
}

/**
 * Resolve the sitekey the browser widget should mount.
 *
 * - Missing configured key → unconfigured (undefined).
 * - Dummy hosts (preview/localhost) → always-pass sitekey.
 * - Unknown/null hostname (SSR) → keep configured key; browser re-resolves.
 * - Allowlisted product hosts → configured production/staging key.
 */
export function resolveTurnstileSiteKey(
  hostname: string | null | undefined,
  configuredSiteKey: string | null | undefined
): string | undefined {
  const configured = configuredSiteKey?.trim();
  if (!configured) return undefined;
  if (configured === TURNSTILE_ALWAYS_PASS_SITE_KEY) return configured;
  if (shouldUseTurnstileDummyKeys(hostname)) {
    return TURNSTILE_ALWAYS_PASS_SITE_KEY;
  }
  return configured;
}

/**
 * Resolve the secret used for Cloudflare siteverify.
 * Must pair with {@link resolveTurnstileSiteKey} for the same hostname.
 */
export function resolveTurnstileSecretKey(
  hostname: string | null | undefined,
  configuredSecretKey: string | null | undefined
): string | null {
  const configured = configuredSecretKey?.trim();
  if (!configured) return null;
  if (configured === TURNSTILE_ALWAYS_PASS_SECRET_KEY) return configured;
  if (shouldUseTurnstileDummyKeys(hostname)) {
    return TURNSTILE_ALWAYS_PASS_SECRET_KEY;
  }
  return configured;
}

/** Browser hostname helper — returns null during SSR / non-DOM runtimes. */
export function getBrowserTurnstileHostname(): string | null {
  if (typeof globalThis.location === 'undefined') return null;
  return globalThis.location.hostname || null;
}

/**
 * Guardrail: client sitekey and server secret must be a matching pair for the
 * hostname. Prevents shipping prod sitekey + dummy secret (or the reverse),
 * which causes silent verify failures or 110200 loops.
 */
export function assertTurnstileClientServerPairCompatible(
  hostname: string | null | undefined,
  configuredSiteKey: string | null | undefined,
  configuredSecretKey: string | null | undefined
): { ok: true } | { ok: false; reason: string } {
  const site = resolveTurnstileSiteKey(hostname, configuredSiteKey);
  const secret = resolveTurnstileSecretKey(hostname, configuredSecretKey);

  if (!site && !secret) {
    return { ok: true }; // both unconfigured — callers handle fail-closed
  }
  if (!site || !secret) {
    return {
      ok: false,
      reason: 'sitekey_and_secret_must_both_be_set_or_both_unset',
    };
  }

  const siteIsDummy = site === TURNSTILE_ALWAYS_PASS_SITE_KEY;
  const secretIsDummy = secret === TURNSTILE_ALWAYS_PASS_SECRET_KEY;
  if (siteIsDummy !== secretIsDummy) {
    return {
      ok: false,
      reason: 'dummy_sitekey_must_pair_with_dummy_secret',
    };
  }

  if (shouldUseTurnstileDummyKeys(hostname)) {
    if (!siteIsDummy || !secretIsDummy) {
      return {
        ok: false,
        reason: 'preview_or_local_host_must_use_dummy_pair',
      };
    }
  } else if (hostname) {
    // Allowlisted product hosts must not silently use dummy pair unless
    // env itself is deliberately configured with dummy keys (tests).
    if (
      siteIsDummy &&
      configuredSiteKey?.trim() &&
      configuredSiteKey.trim() !== TURNSTILE_ALWAYS_PASS_SITE_KEY
    ) {
      return {
        ok: false,
        reason: 'allowlisted_host_must_not_swap_away_from_configured_real_keys',
      };
    }
  }

  return { ok: true };
}
