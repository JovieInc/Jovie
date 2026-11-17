// Reviewable batches use existing per-module task identities; this module never
// files issues or changes an owner's lease, attempts, or assignment.
import { posix } from 'node:path';
import { evidenceIsCurrent } from './mutation-inputs.mjs';
import { buildSurvivorIssue, survivorsFingerprint } from './mutation-sweep.mjs';

/** @typedef {import('./mutation-sweep.mjs').Survivor} Survivor */
/** @typedef {{schemaVersion?: number, configDigest?: string, inputDigest?: string, runId?: number, verdict?: string, reason?:string, inputs?: string[]}} Evidence */
/** @typedef {{file: string, sha?: string|null, score?: number|null, valid?: number, tests?: string[], survivors?: Survivor[], evidence?: Evidence}} Task */
/** @typedef {{id?: string, identifier?: string, url?: string, title?: string, fingerprint?: string}} ExistingIssue */

/**
 * Prepare exact per-module outbound text in batches of at most twenty modules
 * per directory. Existing issue matches are annotations, never new identities.
 * @param {Task[]} tasks
 * @param {{state: {modules: Record<string, Task & {status?: string, unknown?: number, complete?: boolean}>}, configDigest: string, selectionDigest?: string, read: (path: string) => string|null, existingIssues?: ExistingIssue[]}} options
 */
export function buildSurvivorDraftBatches(
  tasks,
  { state, configDigest, selectionDigest, read, existingIssues = [] }
) {
  /** @type {{file: string, reason: string}[]} */
  const skipped = [];
  /** @type {Map<string, ReturnType<typeof buildSurvivorIssue> & {file: string, existingIssues: ExistingIssue[]}>} */
  const modules = new Map();
  const ordered = [...tasks].sort(
    (a, b) =>
      posix.dirname(a.file).localeCompare(posix.dirname(b.file)) ||
      a.file.localeCompare(b.file)
  );
  for (const task of ordered) {
    const entry = state.modules[task.file];
    const evidence = entry?.evidence;
    let reason;
    if (
      !entry ||
      entry.status !== 'scored' ||
      !Number.isFinite(entry.score) ||
      !Number.isSafeInteger(entry.valid) ||
      !(entry.valid > 0) ||
      (entry.unknown ?? 0) !== 0 ||
      entry.complete === false ||
      !(
        ['pass', 'regression'].includes(evidence?.verdict ?? '') ||
        evidence?.reason === 'insufficient mutation sample'
      )
    )
      reason = 'unknown mutation evidence';
    else if (!evidenceIsCurrent(entry, configDigest, read, selectionDigest))
      reason = 'stale mutation inputs or configuration';
    else if (
      !/^[a-f0-9]{40}$/u.test(task.sha ?? '') ||
      task.sha !== entry.sha ||
      task.score !== entry.score ||
      task.valid !== entry.valid ||
      task.evidence?.inputDigest !== evidence.inputDigest ||
      task.evidence?.configDigest !== configDigest ||
      task.evidence?.runId !== evidence.runId
    )
      reason = 'task does not match current scored attempt';
    else if (
      !Array.isArray(task.survivors) ||
      task.survivors.length === 0 ||
      task.survivors.some(
        s =>
          s.file !== task.file || !['Survived', 'NoCoverage'].includes(s.status)
      )
    )
      reason = 'no valid survivor evidence';
    else if (modules.has(task.file)) reason = 'duplicate module task';
    if (reason) {
      skipped.push({ file: task.file, reason });
      continue;
    }
    const fingerprint = survivorsFingerprint(task.file);
    const matches = existingIssues.filter(
      issue =>
        issue.fingerprint === fingerprint ||
        issue.title?.includes(`[${fingerprint}]`)
    );
    const issue = buildSurvivorIssue(task.file, task.survivors, {
      score: entry.score,
      valid: entry.valid,
      tests: task.tests ?? [],
      sha: task.sha,
    });
    modules.set(task.file, {
      ...issue,
      file: task.file,
      existingIssues: matches.map(({ id, identifier, url }) => ({
        id,
        identifier,
        url,
      })),
    });
  }
  /** @type {{directory: string, approvalRequired: true, modules: Array<ReturnType<typeof buildSurvivorIssue> & {file: string, existingIssues: ExistingIssue[]}>}[]} */
  const batches = [];
  for (const module of modules.values()) {
    const directory = posix.dirname(module.file);
    let batch = batches.at(-1);
    if (
      !batch ||
      batch.directory !== directory ||
      batch.modules.length === 20
    ) {
      batch = { directory, approvalRequired: true, modules: [] };
      batches.push(batch);
    }
    batch.modules.push(module);
  }
  return { batches, skipped };
}
