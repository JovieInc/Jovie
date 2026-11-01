import { appendFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * Production golden-path certification steps (JOV-9625). Each wrapped step is
 * timed and appended as one JSON line to PROD_CERT_STEPS_FILE; scripts/prod-cert.mjs
 * folds them into the per-surface receipts. A failing step is recorded and the
 * error rethrown so the enclosing test still fails. Without the env var this
 * is a plain pass-through.
 */
export type ProdCertStepStatus = 'passed' | 'failed' | 'blocked';

export interface ProdCertStep {
  readonly surface: string;
  readonly id: string;
  readonly status: ProdCertStepStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly summary: string;
}

/**
 * Every JSON-line shape the steps file carries: browser checks, per-surface
 * telemetry/screenshot evidence, quality-contract observations and the
 * admin inventory readback (JOV-9625 outcome rework).
 */
export type ProdCertStepRecord =
  | ProdCertStep
  | {
      readonly kind: 'telemetry';
      readonly surface: string;
      readonly consoleErrors: number;
      readonly networkErrors: number;
    }
  | {
      readonly kind: 'screenshot';
      readonly surface: string;
      readonly format: 'jpeg';
      readonly dataUrl: string;
    }
  | {
      readonly kind: 'observation';
      readonly surface: string;
      readonly contractId: string;
      readonly dimension: string;
      readonly value: number;
      readonly unit: string;
      readonly sampleSize?: number;
    }
  | {
      readonly kind: 'readback';
      readonly status: 'passed' | 'blocked' | 'failed';
      readonly detail: string;
    };

function write(step: ProdCertStepRecord): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file) return;
  try {
    appendFileSync(file, `${JSON.stringify(step)}\n`);
  } catch {
    // Evidence is best-effort; the test result is authoritative.
  }
}

export async function certStep<T>(
  surface: string,
  id: string,
  fn: () => Promise<T>,
  summarize: (value: T) => string = () => 'ok'
): Promise<T> {
  const startedAt = new Date().toISOString();
  try {
    const value = await fn();
    write({
      surface,
      id,
      status: 'passed',
      startedAt,
      endedAt: new Date().toISOString(),
      summary: summarize(value),
    });
    return value;
  } catch (error) {
    write({
      surface,
      id,
      status: 'failed',
      startedAt,
      endedAt: new Date().toISOString(),
      summary: String((error as Error)?.message ?? error)
        .split('\n')[0]
        .slice(0, 500),
    });
    throw error;
  }
}

export function certStepBlocked(
  surface: string,
  id: string,
  summary: string
): void {
  const at = new Date().toISOString();
  write({
    surface,
    id,
    status: 'blocked',
    startedAt: at,
    endedAt: at,
    summary,
  });
}

/**
 * Per-surface browser evidence (JOV-9625 outcome receipt):
 *   - telemetry: how many console errors and failed/error network responses
 *     the page emitted while the surface was exercised;
 *   - screenshot: one JPEG frame of the surface, base64 data-URL encoded, so
 *     every receipt carries visual proof a human can open.
 * Folded into the surface receipt by scripts/prod-cert.mjs. Both are
 * best-effort evidence: they never fail a step, and they are recorded as
 * null on the receipt when the surface was not browser-exercised.
 */
export interface SurfaceTelemetryCollector {
  /** Write the telemetry delta accumulated since the previous record call. */
  readonly record: (surface: string) => void;
  /** Capture the current page as the surface's JPEG evidence frame. */
  readonly capture: (page: Page, surface: string) => Promise<void>;
}

export function createSurfaceTelemetry(page: Page): SurfaceTelemetryCollector {
  let consoleErrors = 0;
  let networkErrors = 0;
  let reportedConsole = 0;
  let reportedNetwork = 0;
  const onConsole = (message: { type(): string }): void => {
    if (message.type() === 'error') consoleErrors += 1;
  };
  const onResponse = (response: { status(): number }): void => {
    if (response.status() >= 400) networkErrors += 1;
  };
  const onRequestFailed = (): void => {
    networkErrors += 1;
  };
  page.on('console', onConsole);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  return {
    record(surface) {
      const telemetry = {
        kind: 'telemetry' as const,
        surface,
        consoleErrors: consoleErrors - reportedConsole,
        networkErrors: networkErrors - reportedNetwork,
      };
      reportedConsole = consoleErrors;
      reportedNetwork = networkErrors;
      write(telemetry);
    },
    async capture(currentPage, surface) {
      // The ledger route caps each data URL (JOV-9625): fall back to a lower
      // quality once, then record nothing rather than reject the whole POST.
      for (const quality of [40, 20]) {
        try {
          const buffer = await currentPage.screenshot({
            type: 'jpeg',
            quality,
            fullPage: false,
          });
          const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          if (dataUrl.length > 350_000) continue;
          write({
            kind: 'screenshot' as const,
            surface,
            format: 'jpeg' as const,
            dataUrl,
          });
          return;
        } catch {
          // Evidence is best-effort; the test result is authoritative.
          return;
        }
      }
    },
  };
}

/**
 * Admin certifications-inventory readback (JOV-9625 outcome rework). One
 * attempt per run: sign in as the documented admin fixture and read
 * `GET /api/ovie/certifications`. Folded into the landing receipt as
 * evidence — never a check — so a not-viable fixture records the exact
 * blocker without turning any golden-path surface red.
 */
export function recordAdminReadback(result: {
  readonly status: 'passed' | 'blocked' | 'failed';
  readonly detail: string;
}): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file) return;
  try {
    appendFileSync(
      file,
      `${JSON.stringify({ kind: 'readback', ...result })}\n`
    );
  } catch {
    // Evidence is best-effort; the test result is authoritative.
  }
}

/**
 * A measured quality-contract observation (canon/quality-contracts.jsonl),
 * recorded from the authenticated browser run. Folded into the surface receipt.
 */
export function recordCertObservation(observation: {
  readonly surface: string;
  readonly contractId: string;
  readonly dimension: string;
  readonly value: number;
  readonly unit: string;
}): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file || !Number.isFinite(observation.value)) return;
  try {
    appendFileSync(
      file,
      `${JSON.stringify({ kind: 'observation', sampleSize: 1, ...observation })}\n`
    );
  } catch {
    // Best-effort evidence.
  }
}
