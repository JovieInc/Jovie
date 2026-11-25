// The hosted outcome sweep reads this JSON without installing workspace packages.
import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_PATH = 'canon/outcome-coverage-baseline.json';

/**
 * Busy workflows the automation-liveness outcome sweep reports for
 * (scripts/lib/outcome-sweep.mjs), so they need no job of their own.
 * @param {string} root
 */
export function readSweptList(root) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, BASELINE_PATH), 'utf8')
  );
  return /** @type {string[]} */ (raw.swept ?? []);
}

/**
 * Stable remediation fingerprint for a workflow file:
 * `.github/workflows/visual-regression.yml` -> `workflow-visual-regression`.
 * @param {string} file
 */
export function outcomeFingerprint(file) {
  const stem = path
    .basename(String(file), path.extname(String(file)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `workflow-${stem || 'unknown'}`;
}
