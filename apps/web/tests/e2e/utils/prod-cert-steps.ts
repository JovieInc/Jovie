import { appendFileSync } from 'node:fs';

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

function write(step: ProdCertStep): void {
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
