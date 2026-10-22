/**
 * Shared contract for every outbound third-party API call (TS + Python).
 * providers.json is the single source of truth for hosts, budget headers,
 * priority reserves and retry/breaker defaults; scripts/apiclient reads the
 * same file so both languages make identical decisions on the same ledger.
 */
import providersJson from './providers.json' with { type: 'json' };

export type PriorityName =
  | 'merge'
  | 'deploy'
  | 'repair'
  | 'default'
  | 'report'
  | 'poll';
export type PriorityClass = 'critical' | 'normal' | 'background';
export type ResetUnit =
  | 'epoch-s'
  | 'epoch-ms'
  | 'delta-s'
  | 'rfc3339'
  | 'duration';

export interface PriorityPolicy {
  readonly class: PriorityClass;
  /** Fraction of the bucket limit this priority may not dip into. */
  readonly reserve: number;
  /** What happens below the reserve: shed now, or wait for the reset. */
  readonly onLow: 'wait' | 'shed';
}

export interface BudgetHeaderSpec {
  readonly resource?: string;
  readonly resourceHeader?: string;
  readonly limit: string;
  readonly remaining: string;
  readonly reset: string;
  readonly resetUnit: ResetUnit;
}

/** Money a provider charges per call; enforced per credential per UTC day. */
export interface PricingSpec {
  /** Default price of one call when the request does not set priceUsd. */
  readonly perCallUsd?: number;
  /** Fail closed (BudgetExhaustedError) once a credential spends this today. */
  readonly dailyCapUsd?: number;
}

export interface ProviderSpec {
  /**
   * `blocked`: registered only so the CI guard fails raw calls to its hosts;
   * the client refuses to build one. Absent means active.
   */
  readonly status?: 'active' | 'blocked';
  readonly blockedReason?: string;
  readonly pricing?: PricingSpec;
  readonly hosts: readonly string[];
  readonly pathPrefix?: string;
  readonly defaultResource: string;
  readonly resourceRules?: readonly {
    readonly pathPrefix: string;
    readonly resource: string;
  }[];
  readonly costResources?: readonly string[];
  readonly budgetHeaders: readonly BudgetHeaderSpec[];
  readonly costHeader?: string;
  readonly conditionalGet?: boolean;
  readonly minWriteIntervalMs?: number;
  readonly bodyRateLimitCodes?: readonly string[];
  readonly primaryText: readonly string[];
  readonly secondaryText: readonly string[];
}

export interface BreakerDefaults {
  readonly failureThreshold: number;
  readonly failureWindowMs: number;
  readonly cooldownBaseMs: number;
  readonly cooldownMaxMs: number;
  readonly probeLeaseMs: number;
  readonly rateLimitCooldownMs: number;
}

export interface ContractDefaults {
  readonly maxAttempts: number;
  readonly backoffBaseMs: number;
  readonly backoffCapMs: number;
  readonly timeoutMs: number;
  readonly maxWaitMs: Readonly<Record<PriorityClass, number>>;
  /** Background burst: max(burst, burstFraction of the headroom above the reserve). */
  readonly pace: { readonly burst: number; readonly burstFraction: number };
  readonly breaker: BreakerDefaults;
  readonly staleCredentialMs: number;
}

export interface Contract {
  readonly schema: 'jovie-api-providers/v1';
  readonly priorities: Readonly<Record<PriorityName, PriorityPolicy>>;
  readonly defaults: ContractDefaults;
  readonly providers: Readonly<Record<string, ProviderSpec>>;
}

export const CONTRACT = providersJson as Contract;
export const PRIORITIES = Object.keys(CONTRACT.priorities) as PriorityName[];
export const PROVIDERS = Object.keys(CONTRACT.providers);

export function providerSpec(provider: string): ProviderSpec {
  const spec = CONTRACT.providers[provider];
  if (!spec) throw new Error(`unknown API provider: ${provider}`);
  return spec;
}

export class BlockedProviderError extends Error {
  readonly provider: string;
  constructor(provider: string, reason: string) {
    super(`${provider} is blocked: ${reason}`);
    this.name = 'BlockedProviderError';
    this.provider = provider;
  }
}

/** The spec of a provider the client may call; blocked providers throw. */
export function callableSpec(provider: string): ProviderSpec {
  const spec = providerSpec(provider);
  if (spec.status === 'blocked')
    throw new BlockedProviderError(
      provider,
      spec.blockedReason ?? 'see packages/api-client/providers.json'
    );
  return spec;
}

export function priorityPolicy(priority: PriorityName): PriorityPolicy {
  const policy = CONTRACT.priorities[priority];
  if (!policy) throw new Error(`unknown API priority: ${priority}`);
  return policy;
}

/** Provider that owns a URL, or null when the host is not a tracked provider. */
export function providerForUrl(url: string | URL): string | null {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  for (const [name, spec] of Object.entries(CONTRACT.providers)) {
    if (!spec.hosts.includes(parsed.hostname)) continue;
    if (spec.pathPrefix && !parsed.pathname.startsWith(spec.pathPrefix)) {
      continue;
    }
    return name;
  }
  return null;
}

/** Budget resource a request draws on before any response tells us. */
export function resourceFor(provider: string, url: string | URL): string {
  const spec = providerSpec(provider);
  const path = (typeof url === 'string' ? new URL(url) : url).pathname;
  const rule = spec.resourceRules?.find(r => path.startsWith(r.pathPrefix));
  return rule?.resource ?? spec.defaultResource;
}
