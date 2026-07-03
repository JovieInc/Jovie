/**
 * Latency overhead estimates for x402 402 → pay → retry loop (GitHub #12750).
 * Live measurement blocked until Worker deploy + funded test wallet.
 */

export interface X402LatencyBudget {
  readonly phase: string;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly notes: string;
}

export const X402_LATENCY_BUDGET: readonly X402LatencyBudget[] = [
  {
    phase: 'Initial 402 response (no payment)',
    p50Ms: 15,
    p95Ms: 40,
    notes: 'Edge pattern match + PAYMENT-REQUIRED header encode',
  },
  {
    phase: 'Client wallet sign + payload construct',
    p50Ms: 200,
    p95Ms: 800,
    notes: 'Agent client (@x402/fetch or agents/x402) — wallet-dependent',
  },
  {
    phase: 'Facilitator verify + settle (Base Sepolia)',
    p50Ms: 400,
    p95Ms: 1200,
    notes: 'CDP facilitator; sub-second target on mainnet per CF blog',
  },
  {
    phase: 'Retry with PAYMENT-SIGNATURE + origin proxy',
    p50Ms: 50,
    p95Ms: 150,
    notes: 'JWT cookie issued; subsequent calls skip payment for 1h',
  },
] as const;

export function totalFirstPaidRequestP50Ms(): number {
  return X402_LATENCY_BUDGET.reduce((sum, row) => sum + row.p50Ms, 0);
}

export function totalFirstPaidRequestP95Ms(): number {
  return X402_LATENCY_BUDGET.reduce((sum, row) => sum + row.p95Ms, 0);
}

export function cookieAmortizedRequestP50Ms(): number {
  const retry = X402_LATENCY_BUDGET.find(
    (r) => r.phase === 'Retry with PAYMENT-SIGNATURE + origin proxy'
  );
  return retry?.p50Ms ?? 50;
}