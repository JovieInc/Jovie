'use client';

/**
 * In-memory ring of runtime receipts that E2E specs read on failure via
 * page.evaluate. Never persisted, never transmitted, capped — a prod-safe,
 * behavior-neutral breadcrumb trail so a red matrix run names which guard
 * fired in timing-sensitive history/rail flows (profile mode history
 * JOV-6571/6572, shell rail lifecycle JOV-8786) instead of being re-run
 * blind.
 *
 * Read side (Playwright):
 *   const trace = await page.evaluate(() => window.__JOVIE_RUNTIME_TRACE__);
 */

export interface RuntimeTraceEvent {
  /** Milliseconds since the ring was created (compact, diffable). */
  readonly t: number;
  /** Owning surface, e.g. 'profile-history', 'shell-rail'. */
  readonly surface: string;
  /** What happened, e.g. 'strip-correction-replace', 'mode-push'. */
  readonly event: string;
  /** Small serializable extras (mode names, depths, pathnames). */
  readonly detail?: Readonly<Record<string, unknown>>;
}

interface TraceRing {
  readonly startedAt: number;
  readonly events: RuntimeTraceEvent[];
}

const MAX_EVENTS = 120;
const GLOBAL_KEY = '__JOVIE_RUNTIME_TRACE__';

type TraceWindow = Record<string, unknown> & { [GLOBAL_KEY]?: TraceRing };

function ring(): TraceRing | null {
  if (globalThis.window === undefined) return null;
  const w = globalThis as unknown as TraceWindow;
  const existing = w[GLOBAL_KEY];
  if (
    existing &&
    Array.isArray(existing.events) &&
    typeof existing.startedAt === 'number'
  ) {
    return existing;
  }
  const created: TraceRing = { startedAt: Date.now(), events: [] };
  w[GLOBAL_KEY] = created;
  return created;
}

/** Append one receipt. No-op during SSR. Never throws. */
export function recordRuntimeTrace(
  surface: string,
  event: string,
  detail?: Readonly<Record<string, unknown>>
): void {
  try {
    const target = ring();
    if (!target) return;
    target.events.push({
      t: Date.now() - target.startedAt,
      surface,
      event,
      ...(detail ? { detail } : {}),
    });
    if (target.events.length > MAX_EVENTS) {
      target.events.splice(0, target.events.length - MAX_EVENTS);
    }
  } catch {
    // Diagnostics never break the surface.
  }
}
