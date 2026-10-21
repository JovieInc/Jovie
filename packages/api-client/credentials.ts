/**
 * One credential order for every provider: our own key first, then a shared
 * (org/team) key, then a pooled key only when the caller opts in, then fail
 * closed. Every fallback past `own` is logged, so a call never silently runs
 * on someone else's quota or wallet. Mirror: scripts/apiclient/credentials.py.
 */

export const CREDENTIAL_TIERS = ['own', 'shared', 'pooled'] as const;
export type CredentialTier = (typeof CREDENTIAL_TIERS)[number];

export type CredentialSource<T> = () =>
  | T
  | null
  | undefined
  | Promise<T | null | undefined>;

export interface ResolvedCredential<T> {
  readonly tier: CredentialTier;
  readonly value: T;
}

export class CredentialUnavailableError extends Error {
  readonly provider: string;
  readonly tried: readonly CredentialTier[];
  constructor(provider: string, tried: readonly CredentialTier[]) {
    super(
      `${provider}: no credential (tried ${tried.join(', ') || 'none'}); failing closed`
    );
    this.name = 'CredentialUnavailableError';
    this.provider = provider;
    this.tried = tried;
  }
}

export interface ResolveOptions {
  /** Pooled credentials (someone else's account) are opt-in per call site. */
  readonly allowPooled?: boolean;
  readonly log?: (event: Record<string, unknown>) => void;
}

const defaultLog = (event: Record<string, unknown>) => {
  process.stderr.write(`${JSON.stringify(event)}\n`);
};

export async function resolveCredential<T>(
  provider: string,
  sources: Partial<Record<CredentialTier, CredentialSource<T>>>,
  options: ResolveOptions = {}
): Promise<ResolvedCredential<T>> {
  const log = options.log ?? defaultLog;
  const tried: CredentialTier[] = [];
  for (const tier of CREDENTIAL_TIERS) {
    const source = sources[tier];
    if (!source) continue;
    if (tier === 'pooled' && !options.allowPooled) continue;
    tried.push(tier);
    const value = await source();
    if (value == null || value === '') continue;
    if (tier !== 'own') {
      log({
        schema: 'jovie.api-client.credential/v1',
        provider,
        tier,
        skipped: tried.slice(0, -1),
        outcome: 'fallback',
      });
    }
    return { tier, value };
  }
  log({
    schema: 'jovie.api-client.credential/v1',
    provider,
    tried,
    outcome: 'unavailable',
  });
  throw new CredentialUnavailableError(provider, tried);
}
