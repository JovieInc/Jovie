import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve Jovie repo root from a script under `scripts/hermes/{jobs,lib}`. */
export function resolveJovieRepoFromScript(moduleUrl: string): string {
  const scriptDir = dirname(fileURLToPath(moduleUrl));
  return join(scriptDir, '..', '..', '..');
}

/**
 * Ensure `process.cwd()` is the Jovie git checkout so `gh` can resolve the base
 * repo. launchd defaults cwd to `$HOME` when `WorkingDirectory` is unset.
 */
export function ensureJovieRepoCwd(moduleUrl: string): string {
  const repoRoot =
    process.env.HERMES_JOVIE_REPO?.trim() ||
    resolveJovieRepoFromScript(moduleUrl);
  // process.chdir: node:fs has no chdirSync export (JOV-4325).
  process.chdir(repoRoot);
  return repoRoot;
}
