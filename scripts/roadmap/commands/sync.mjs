/**
 * `roadmap sync` — Linear → agentos/roadmap/backlog.json
 * Supports --check (drift) and --force (always write).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  AGENTOS_INITIATIVE_NAME,
  DEFAULT_BACKLOG_PATH,
} from '../config.mjs';
import {
  detectBacklogDrift,
  mapLinearIssueToRoadmap,
  mapLinearProjectToRoadmap,
} from '../map-issue.mjs';

/**
 * Build a RoadmapBacklog object from Linear data (pure given client results).
 * @param {{
 *   initiative: object,
 *   issues: object[],
 *   syncedAt?: string,
 *   sourceRevision?: string|null,
 * }} input
 */
export function buildBacklogSnapshot(input) {
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const projects = (input.initiative.projects?.nodes ?? input.initiative.projects ?? []).map(
    /** @param {object} p */ p => mapLinearProjectToRoadmap(p)
  );
  const issues = input.issues.map(
    /** @param {object} n */ n => mapLinearIssueToRoadmap(n, syncedAt)
  );

  return {
    syncedAt,
    sourceRevision: input.sourceRevision ?? null,
    initiative: {
      id: input.initiative.id,
      name: input.initiative.name ?? AGENTOS_INITIATIVE_NAME,
      url: input.initiative.url ?? '',
    },
    projects,
    issues,
  };
}

/**
 * @param {{
 *   client: import('../linear-client.mjs').LinearClient,
 *   flags?: Record<string, string|boolean>,
 *   cwd?: string,
 *   readFileImpl?: typeof readFile,
 *   writeFileImpl?: typeof writeFile,
 *   mkdirImpl?: typeof mkdir,
 *   now?: () => string,
 * }} opts
 */
export async function runSync(opts) {
  const flags = opts.flags ?? {};
  const cwd = opts.cwd ?? process.cwd();
  const outRel =
    typeof flags.out === 'string' ? flags.out : DEFAULT_BACKLOG_PATH;
  const outPath = resolve(cwd, outRel);
  const checkOnly = flags.check === true;
  const force = flags.force === true;
  const readFileImpl = opts.readFileImpl ?? readFile;
  const writeFileImpl = opts.writeFileImpl ?? writeFile;
  const mkdirImpl = opts.mkdirImpl ?? mkdir;
  const syncedAt = opts.now?.() ?? new Date().toISOString();

  const initiative = await opts.client.fetchInitiative(AGENTOS_INITIATIVE_NAME);
  const issues = await opts.client.fetchAgentOsIssues();
  const next = buildBacklogSnapshot({ initiative, issues, syncedAt });

  /** @type {object|null} */
  let disk = null;
  try {
    const raw = await readFileImpl(outPath, 'utf8');
    disk = JSON.parse(raw);
  } catch {
    disk = null;
  }

  const drift = detectBacklogDrift(disk, next);

  if (checkOnly) {
    return {
      ok: !drift.drifted,
      mode: 'check',
      path: outPath,
      drifted: drift.drifted,
      details: drift.details,
      issueCount: next.issues.length,
      projectCount: next.projects.length,
      syncedAt: next.syncedAt,
    };
  }

  const shouldWrite = force || drift.drifted || !disk;
  if (shouldWrite) {
    await mkdirImpl(dirname(outPath), { recursive: true });
    await writeFileImpl(`${outPath}`, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  return {
    ok: true,
    mode: shouldWrite ? 'wrote' : 'unchanged',
    path: outPath,
    drifted: drift.drifted,
    details: drift.details.slice(0, 20),
    issueCount: next.issues.length,
    projectCount: next.projects.length,
    syncedAt: next.syncedAt,
  };
}
