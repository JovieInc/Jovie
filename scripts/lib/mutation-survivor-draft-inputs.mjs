// Read-only adapter for the existing survivor filing CLI's --drafts mode.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createTestSelector,
  readModuleSource,
  readTestSources,
} from './mutation-diff.mjs';
import {
  configurationPaths,
  inputDigest,
  repositoryReader,
} from './mutation-inputs.mjs';
import { buildSurvivorDraftBatches } from './mutation-survivor-drafts.mjs';

export function prepareSurvivorDrafts({
  tasksDir,
  statePath,
  existingIssuesPath,
  repoRoot = resolve(import.meta.dirname, '../..'),
}) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const tasks = (existsSync(tasksDir) ? readdirSync(tasksDir) : [])
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(readFileSync(join(tasksDir, name), 'utf8')));
  const existingIssues = existingIssuesPath
    ? JSON.parse(readFileSync(existingIssuesPath, 'utf8'))
    : [];
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const read = repositoryReader(repoRoot);
  const result = { approvalRequired: true, batches: [], skipped: [] };
  for (const root of ['apps/web', 'packages/ui']) {
    const scoped = tasks.filter(
      task => task.file.startsWith('packages/ui/') === (root === 'packages/ui')
    );
    if (scoped.length === 0) continue;
    const selector = createTestSelector(
      readTestSources(join(repoRoot, root)),
      readModuleSource(join(repoRoot, root))
    );
    const configDigest = inputDigest(configurationPaths(tracked, root), read);
    const selectionDigest = inputDigest(['selection'], () =>
      JSON.stringify(selector.inventory())
    );
    const prepared = buildSurvivorDraftBatches(scoped, {
      state,
      configDigest,
      read,
      existingIssues,
      selectionDigest,
    });
    result.batches.push(...prepared.batches);
    result.skipped.push(...prepared.skipped);
  }
  return result;
}
