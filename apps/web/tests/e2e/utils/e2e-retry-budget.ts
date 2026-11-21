import fs from 'node:fs';

/**
 * CI retries for the default (non-quarantine) E2E lane when the quarantine
 * ledger is missing, unreadable or holds no valid value. This is the value CI
 * already used before the ledger was read, so a broken ledger never makes the
 * E2E lane stricter or looser than it was.
 */
export const FALLBACK_CI_E2E_DEFAULT_RETRIES = 2;

/**
 * Default E2E retries come from `retryBudget.e2eDefaultRetries` in
 * apps/web/tests/quarantine.json, the same ledger the unit lanes read their
 * retry budget from. Local runs never retry, so a flake shows up at once.
 */
export function resolveE2eDefaultRetries({
  isCI,
  ledgerPath,
  readFile = path => fs.readFileSync(path, 'utf8'),
}: {
  readonly isCI: boolean;
  readonly ledgerPath: string;
  readonly readFile?: (path: string) => string;
}): number {
  if (!isCI) return 0;
  try {
    const value = JSON.parse(readFile(ledgerPath))?.retryBudget
      ?.e2eDefaultRetries;
    if (Number.isSafeInteger(value) && value >= 0) return value;
  } catch {
    // Fall through to the pre-ledger CI default.
  }
  return FALLBACK_CI_E2E_DEFAULT_RETRIES;
}
