/** Scoped transport for reference discovery. Deliberately bypasses the shared
 * ResearchRequest cache/GBrain persistence; reuse provider adapters and their
 * API-client budget/breaker/retry policy, never the router's unsafe defaults. */
import { createHash } from 'node:crypto';
import type { ApiClient } from '@jovie/api-client';
import { exaSearch, firecrawlSearch } from './sources-web.ts';
import type { Hit } from './types.ts';

export interface ReferenceDiscoveryScope {
  readonly tenantId: string;
  readonly actorId: string;
  readonly contextId: string;
  readonly branchId: string;
}
export type ReferenceDateWindow =
  | { readonly kind: 'all-time' }
  | { readonly kind: 'recent'; readonly since: string; readonly until: string }
  | {
      readonly kind: 'archive';
      readonly since: string;
      readonly until: string;
    };
export interface ReferenceDiscoveryRequest {
  readonly source: string;
  readonly scope: ReferenceDiscoveryScope;
  readonly query: string;
  readonly preferred: readonly string[];
  readonly avoided: readonly string[];
  readonly window: ReferenceDateWindow;
  readonly cursor: string | null;
  readonly limit: number;
  readonly requestId: string;
}
export interface ReferenceDiscoveryAdapter {
  readonly name: string;
  readonly maxCallUsd: number;
  readonly supportsWindow: (window: ReferenceDateWindow) => boolean;
  page(
    request: ReferenceDiscoveryRequest
  ): Promise<{ hits: readonly Hit[]; cursor: string | null }>;
}
export interface ReferenceDiscoveryJob {
  readonly source: string;
  readonly scope: ReferenceDiscoveryScope;
  readonly query: string;
  readonly window: ReferenceDateWindow;
  readonly cursor: string | null;
  readonly calls: number;
  readonly reservedUsd: number;
  readonly maxCalls: number;
  readonly maxUsd: number;
  readonly approvalReceipt: string | null;
  readonly status: 'ready' | 'reserved' | 'complete';
  readonly seen: readonly string[];
  /** Durable handoff: capture/classification acknowledges these after intake. */
  readonly pendingLeads: readonly Hit[];
  readonly revision: number;
}
function scopeKey(s: ReferenceDiscoveryScope) {
  return JSON.stringify([s.tenantId, s.actorId, s.contextId, s.branchId]);
}
export function referenceDiscoveryKey(
  request: ReferenceDiscoveryRequest
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        scopeKey(request.scope),
        request.source,
        request.query,
        request.window,
        request.cursor,
        request.preferred,
        request.avoided,
      ])
    )
    .digest('hex');
}
function identity(hit: Hit): string {
  const url = new URL(hit.url);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Invalid source identity.');
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/iu.test(key) || key === 'fbclid' || key === 'gclid')
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
function validateWindow(window: ReferenceDateWindow) {
  if (
    window.kind !== 'all-time' &&
    (!Number.isFinite(Date.parse(window.since)) ||
      !Number.isFinite(Date.parse(window.until)) ||
      Date.parse(window.since) >= Date.parse(window.until))
  )
    throw new Error('Invalid date window.');
}
/** Reserve durably before sending. An uncertain call remains reserved; an
 * operator reconciles it rather than resending and silently spending twice. */
export async function runReferenceDiscoveryPage(input: {
  readonly job: ReferenceDiscoveryJob;
  readonly scope: ReferenceDiscoveryScope;
  readonly adapter: ReferenceDiscoveryAdapter;
  readonly preferred: readonly string[];
  readonly avoided: readonly string[];
  readonly save: (
    expectedRevision: number,
    next: ReferenceDiscoveryJob
  ) => Promise<boolean>;
}): Promise<{ job: ReferenceDiscoveryJob; leads: readonly Hit[] }> {
  const { job, scope, adapter, save } = input;
  if (scopeKey(job.scope) !== scopeKey(scope))
    throw new Error('Discovery scope mismatch.');
  if (job.source !== adapter.name)
    throw new Error('Discovery source mismatch.');
  if (
    !Number.isInteger(job.calls) ||
    job.calls < 0 ||
    !Number.isFinite(job.reservedUsd) ||
    job.reservedUsd < 0 ||
    !Number.isInteger(job.revision) ||
    job.revision < 0
  )
    throw new Error('Invalid persisted discovery counters.');
  validateWindow(job.window);
  if (!adapter.supportsWindow(job.window))
    throw new Error('Source does not support this date window.');
  if (job.status !== 'ready')
    throw new Error('Discovery job must be reconciled or is complete.');
  if (
    !job.approvalReceipt ||
    !Number.isFinite(adapter.maxCallUsd) ||
    adapter.maxCallUsd < 0 ||
    !Number.isInteger(job.maxCalls) ||
    job.maxCalls < 1 ||
    !Number.isFinite(job.maxUsd) ||
    job.maxUsd < 0 ||
    job.calls >= job.maxCalls ||
    job.reservedUsd + adapter.maxCallUsd > job.maxUsd
  )
    throw new Error('Discovery budget is not approved or is exhausted.');
  const reserved: ReferenceDiscoveryJob = {
    ...job,
    status: 'reserved',
    calls: job.calls + 1,
    reservedUsd: job.reservedUsd + adapter.maxCallUsd,
    revision: job.revision + 1,
  };
  if (!(await save(job.revision, reserved)))
    throw new Error('Discovery job changed.');
  // Every fifth call explores the original query without preference expansion.
  const query =
    job.calls % 5 === 4
      ? job.query
      : [
          job.query,
          ...input.preferred.slice(0, 4),
          ...(input.avoided.length
            ? [
                `Find visual alternatives to: ${input.avoided.slice(0, 4).join(', ')}`,
              ]
            : []),
        ].join(' ');
  const request: ReferenceDiscoveryRequest = {
    source: adapter.name,
    scope,
    query,
    preferred: input.preferred,
    avoided: input.avoided,
    window: job.window,
    cursor: job.cursor,
    limit: 25,
    requestId: '',
  };
  const result = await adapter.page({
    ...request,
    requestId: referenceDiscoveryKey(request),
  });
  if (
    result.hits.length > 25 ||
    (result.cursor !== null &&
      (result.cursor === job.cursor || result.cursor.length > 2048))
  )
    throw new Error('Source exceeded page bounds or did not advance.');
  const seen = new Set(job.seen);
  const leads = result.hits.filter(hit => {
    if (hit.source !== adapter.name)
      throw new Error('Source identity mismatch.');
    const key = identity(hit);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Negative feedback influences order even when a provider treats semantic
  // exclusions as soft instructions; exploration pages keep provider order.
  if (job.calls % 5 !== 4)
    leads.sort((a, b) => {
      const penalty = (hit: Hit) =>
        input.avoided.filter(term =>
          `${hit.title} ${hit.snippet}`
            .toLowerCase()
            .includes(term.toLowerCase())
        ).length;
      return penalty(a) - penalty(b);
    });
  if (seen.size > 500) throw new Error('Discovery lead limit reached.');
  const next: ReferenceDiscoveryJob = {
    ...reserved,
    revision: reserved.revision + 1,
    cursor: result.cursor,
    seen: [...seen],
    pendingLeads: [...job.pendingLeads, ...leads],
    status: result.cursor === null ? 'complete' : 'ready',
  };
  if (!(await save(reserved.revision, next)))
    throw new Error(
      'Discovery result commit uncertain; reconcile the reserved page.'
    );
  return { job: next, leads };
}
/** Current search adapters expose one bounded page and all-time semantics.
 * Recent/archive requests fail closed until the provider date/pagination
 * contract is supported; last30days is never used for historical discovery. */
export function existingReferenceAdapters(
  clients: { readonly exa: ApiClient; readonly firecrawl: ApiClient },
  maxCallUsd: { readonly exa: number; readonly firecrawl: number }
): readonly ReferenceDiscoveryAdapter[] {
  return [
    {
      name: 'exa',
      maxCallUsd: maxCallUsd.exa,
      supportsWindow: w => w.kind === 'all-time',
      async page(r) {
        if (r.cursor) throw new Error('Exa cursor is unsupported.');
        const out = await exaSearch(clients.exa, r.query, 'evergreen', r.limit);
        return { hits: out.hits, cursor: null };
      },
    },
    {
      name: 'firecrawl',
      maxCallUsd: maxCallUsd.firecrawl,
      supportsWindow: w => w.kind === 'all-time',
      async page(r) {
        if (r.cursor) throw new Error('Firecrawl cursor is unsupported.');
        const out = await firecrawlSearch(
          clients.firecrawl,
          r.query,
          'evergreen',
          r.limit
        );
        return { hits: out.hits, cursor: null };
      },
    },
  ];
}
