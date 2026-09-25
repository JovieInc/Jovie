/**
 * Loads ~/.hermes/.env into process.env (same convention as
 * scripts/hermes/jobs/codex-issue-shipper.ts) so launchd jobs pick up
 * secrets rendered by bootstrap-air.sh without exporting them in plists.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function unquote(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

export function loadHermesEnv(): void {
  const envPath = join(
    process.env.HERMES_HOME ?? join(homedir(), '.hermes'),
    '.env'
  );
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(trimmed.slice(idx + 1));
  }
}
