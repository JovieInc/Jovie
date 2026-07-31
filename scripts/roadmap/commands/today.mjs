/**
 * `roadmap today` — emit today's active issues (optionally as agent-briefs).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DEFAULT_BACKLOG_PATH } from '../config.mjs';
import { selectTodayIssues } from '../map-issue.mjs';
import { buildAgentBriefFromIssue } from './agent-brief.mjs';

/**
 * @param {{
 *   flags?: Record<string, string|boolean>,
 *   cwd?: string,
 *   readFileImpl?: typeof readFile,
 *   backlog?: object|null,
 *   client?: import('../linear-client.mjs').LinearClient|null,
 * }} opts
 */
export async function runToday(opts) {
  const flags = opts.flags ?? {};
  const limit =
    typeof flags.limit === 'string' || typeof flags.limit === 'number'
      ? Math.max(1, Number(flags.limit) || 50)
      : 50;

  const backlog =
    opts.backlog ??
    (await loadBacklog({
      cwd: opts.cwd ?? process.cwd(),
      readFileImpl: opts.readFileImpl ?? readFile,
      path:
        typeof flags.backlog === 'string'
          ? flags.backlog
          : DEFAULT_BACKLOG_PATH,
    }));

  if (!backlog?.issues) {
    return {
      ok: false,
      error:
        'No backlog.json found. Run `roadmap sync` first, or pass a valid --backlog path.',
    };
  }

  const selected = selectTodayIssues(backlog.issues, { limit });
  const asBriefs = flags.briefs === true || flags.json === true;

  if (asBriefs) {
    const briefs = selected.map(issue =>
      buildAgentBriefFromIssue({
        issue,
        backlog,
        description: '', // mirror-only; live description requires Linear
      })
    );
    return {
      ok: true,
      count: briefs.length,
      backlogSyncedAt: backlog.syncedAt ?? null,
      issues: selected.map(i => ({
        id: i.id,
        title: i.title,
        state: i.state?.name,
      })),
      briefs,
    };
  }

  return {
    ok: true,
    count: selected.length,
    backlogSyncedAt: backlog.syncedAt ?? null,
    issues: selected.map(i => ({
      id: i.id,
      title: i.title,
      state: i.state?.name,
      priority: i.priority,
      agentOwned: i.agentOwned,
      url: i.url,
    })),
  };
}

/**
 * @param {{ cwd: string, readFileImpl: typeof readFile, path: string }} opts
 */
async function loadBacklog(opts) {
  try {
    const raw = await opts.readFileImpl(resolve(opts.cwd, opts.path), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
