import 'server-only';

import { readFile } from 'node:fs/promises';
import { resolveAppPath, resolveMonorepoPath } from '@/lib/filesystem-paths';

/**
 * Deployed functions only contain apps/web, so the registry is read from the
 * copy staged by scripts/stage-runtime-data.mjs (and traced via
 * outputFileTracingIncludes). Local dev may not have staged runtime-data yet,
 * so fall back to the monorepo docs file.
 */
export async function loadFeatureRegistryMarkdown(): Promise<string> {
  const candidates = [
    resolveAppPath('runtime-data', 'docs', 'FEATURE_REGISTRY.md'),
    resolveMonorepoPath('docs', 'FEATURE_REGISTRY.md'),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(/* turbopackIgnore: true */ candidate, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(
    `FEATURE_REGISTRY.md not found. Tried: ${candidates.join(', ')}`
  );
}
