/**
 * Derive the authoritative Pen registered identities from the exact current
 * code registry (JOV-4969 review correction).
 *
 * The canonical Pen document is not the source of the denominator. The exact
 * current code registry — `apps/web/data/marketing/componentRegistry.ts` —
 * is. Registered identities are derived by importing the registry with tsx
 * (already a repo devDependency) and projecting every entry id. On exact
 * current main this yields 37 identities (8 shells + 17 sections + 12
 * recipes); stale Pen-only roots such as `shell.marketingfootercta`,
 * `shell.marketingfinalcta`, or the `shell.marketingcontainer.prose` variant
 * root are not code-registry identities and must never be encoded as
 * expected rows.
 */

import { execFileSync } from 'node:child_process';

export const CODE_REGISTRY_PATH =
  'apps/web/data/marketing/componentRegistry.ts';

const DERIVATION_SNIPPET = `
import { MARKETING_COMPONENT_REGISTRY } from './${CODE_REGISTRY_PATH}';
const ids = MARKETING_COMPONENT_REGISTRY.map(entry => entry.id).sort();
const byKind = { shell: 0, section: 0, recipe: 0 };
for (const entry of MARKETING_COMPONENT_REGISTRY) byKind[entry.kind] += 1;
process.stdout.write(JSON.stringify({ ids, byKind, total: ids.length }));
`;

/**
 * Synchronously derive registered identities from the exact current code.
 * Throws when the registry cannot be imported or the projection is
 * malformed — the audit must fail closed, never fall back to a Pen-claimed
 * denominator.
 */
export function deriveCodeRegisteredIdentities({ cwd = process.cwd() } = {}) {
  let stdout;
  try {
    stdout = execFileSync('pnpm', ['exec', 'tsx', '-e', DERIVATION_SNIPPET], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  } catch (error) {
    throw new Error(
      `Cannot derive registered identities from ${CODE_REGISTRY_PATH}: ` +
        (error instanceof Error ? error.message : String(error))
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout.trim().split('\n').pop());
  } catch {
    throw new Error(
      `Code registry derivation returned non-JSON output: ${stdout.slice(0, 200)}`
    );
  }
  const { ids, byKind, total } = parsed ?? {};
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some(id => typeof id !== 'string' || id.length === 0) ||
    new Set(ids).size !== ids.length ||
    typeof total !== 'number' ||
    total !== ids.length
  ) {
    throw new Error(
      `Code registry derivation returned a malformed projection from ${CODE_REGISTRY_PATH}`
    );
  }
  return { ids, byKind, total };
}
