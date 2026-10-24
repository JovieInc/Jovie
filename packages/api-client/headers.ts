/**
 * Reads provider budget headers and classifies failures. Pure functions:
 * scripts/apiclient/headers.py implements the same rules and both are pinned
 * by conformance.json.
 */
import type { ProviderSpec, ResetUnit } from './contract.ts';

export type HeaderBag =
  | Headers
  | Readonly<Record<string, string | readonly string[] | undefined>>
  | null
  | undefined;

export interface Observation {
  readonly resource: string;
  readonly limit: number | null;
  readonly remaining: number;
  readonly resetAt: number | null;
}

export type FailureKind =
  | 'none'
  | 'primary'
  | 'secondary'
  | 'transient'
  | 'client';

export interface Failure {
  readonly kind: FailureKind;
  /** Epoch ms after which a retry may succeed, when the provider said so. */
  readonly retryAtMs: number | null;
}

export function header(headers: HeaderBag, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const bag = headers as Record<string, string | readonly string[] | undefined>;
  const key = Object.keys(bag).find(k => k.toLowerCase() === name);
  if (key === undefined) return null;
  const value = bag[key];
  if (value === undefined) return null;
  return Array.isArray(value) ? String(value[0]) : String(value);
}

function finite(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : null;
}

/** OpenAI-style "1m30.5s", "6m0s", "250ms". */
function durationMs(raw: string): number | null {
  const parts = [...raw.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (parts.length === 0) return null;
  const unit: Record<string, number> = {
    h: 3_600_000,
    m: 60_000,
    s: 1000,
    ms: 1,
  };
  return parts.reduce((sum, [, n, u]) => sum + Number(n) * (unit[u] ?? 0), 0);
}

export function resetToEpochMs(
  raw: string | null,
  unit: ResetUnit,
  nowMs: number
): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = raw.trim();
  if (unit === 'rfc3339') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (unit === 'duration') {
    const ms = durationMs(value);
    return ms === null ? null : nowMs + Math.round(ms);
  }
  const n = finite(value);
  if (n === null || n < 0) return null;
  if (unit === 'epoch-ms') return Math.round(n);
  if (unit === 'delta-s') return nowMs + Math.round(n * 1000);
  return Math.round(n * 1000);
}

export function parseBudget(
  spec: ProviderSpec,
  headers: HeaderBag,
  nowMs: number,
  fallbackResource: string
): Observation[] {
  const out: Observation[] = [];
  for (const h of spec.budgetHeaders) {
    const remaining = finite(header(headers, h.remaining));
    if (remaining === null) continue;
    const resource =
      (h.resourceHeader && header(headers, h.resourceHeader)) ||
      h.resource ||
      fallbackResource;
    out.push({
      resource,
      limit: finite(header(headers, h.limit)),
      remaining: Math.max(0, Math.floor(remaining)),
      resetAt: resetToEpochMs(header(headers, h.reset), h.resetUnit, nowMs),
    });
  }
  return out;
}

/** Retry-After as epoch ms (delta seconds or HTTP date). */
export function retryAfterAt(headers: HeaderBag, nowMs: number): number | null {
  const raw = header(headers, 'retry-after');
  if (raw === null) return null;
  const n = finite(raw);
  if (n !== null) return n < 0 ? null : nowMs + Math.round(n * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? date : null;
}

function bodyCodes(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  const codes: string[] = [];
  for (const error of errors) {
    if (!error || typeof error !== 'object') continue;
    const e = error as { type?: unknown; extensions?: { code?: unknown } };
    if (typeof e.type === 'string') codes.push(e.type);
    if (typeof e.extensions?.code === 'string') codes.push(e.extensions.code);
  }
  return codes;
}

function matches(patterns: readonly string[], text: string): boolean {
  return patterns.some(p => new RegExp(p, 'i').test(text));
}

export interface FailureInput {
  readonly status: number | null;
  readonly headers?: HeaderBag;
  readonly body?: unknown;
  readonly text?: string;
  readonly networkError?: boolean;
  readonly nowMs: number;
}

/**
 * Why a response is not a success. Rate limits are infrastructure, never a
 * verdict: primary = the bucket is empty until reset; secondary = the provider
 * asked us to slow down; transient = 5xx/network; client = a real 4xx answer.
 */
export function classifyFailure(
  spec: ProviderSpec,
  input: FailureInput
): Failure {
  const { status, headers, nowMs } = input;
  const text = input.text ?? '';
  const retryAfter = retryAfterAt(headers, nowMs);
  const observations = parseBudget(spec, headers, nowMs, spec.defaultResource);
  const empty = observations.find(o => o.remaining === 0);
  const resetAt = empty?.resetAt ?? null;
  const later = (...xs: (number | null)[]) => {
    const known = xs.filter((x): x is number => x !== null);
    return known.length ? Math.max(...known) : null;
  };
  const codes = bodyCodes(input.body);
  const rateCode = codes.some(c => spec.bodyRateLimitCodes?.includes(c));
  if (input.networkError) return { kind: 'transient', retryAtMs: null };
  if (status !== null && status >= 200 && status < 400 && !rateCode) {
    return { kind: 'none', retryAtMs: null };
  }
  if (rateCode || matches(spec.primaryText, text)) {
    return { kind: 'primary', retryAtMs: later(resetAt, retryAfter) };
  }
  if ((status === 403 || status === 429) && empty) {
    return { kind: 'primary', retryAtMs: later(resetAt, retryAfter) };
  }
  if (status === 429 || matches(spec.secondaryText, text)) {
    return { kind: 'secondary', retryAtMs: retryAfter };
  }
  if (status === 403 && retryAfter !== null) {
    return { kind: 'secondary', retryAtMs: retryAfter };
  }
  if (status === null || status >= 500 || status === 408) {
    return { kind: 'transient', retryAtMs: retryAfter };
  }
  return { kind: 'client', retryAtMs: null };
}
