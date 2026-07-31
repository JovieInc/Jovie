/**
 * `roadmap expand <issueId>` — generate sub-issues from an epic.
 * Titles come from --from file lines or parsed epic description bullets.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { LABEL_AGENTOS } from '../config.mjs';
import { parseSubIssueTitles } from '../map-issue.mjs';

/**
 * @param {{
 *   client: import('../linear-client.mjs').LinearClient,
 *   positionals: string[],
 *   flags?: Record<string, string|boolean>,
 *   cwd?: string,
 *   readFileImpl?: typeof readFile,
 * }} opts
 */
export async function runExpand(opts) {
  const flags = opts.flags ?? {};
  const issueId = opts.positionals[0];
  if (!issueId) {
    return {
      ok: false,
      error: 'expand requires an issue id: roadmap expand JOV-1234',
    };
  }

  const parent = await opts.client.fetchIssueByIdentifier(issueId);
  if (!parent) {
    return { ok: false, error: `Issue not found: ${issueId}` };
  }

  /** @type {string[]} */
  let titles = [];
  if (typeof flags.from === 'string' && flags.from.trim()) {
    const cwd = opts.cwd ?? process.cwd();
    const readFileImpl = opts.readFileImpl ?? readFile;
    const raw = await readFileImpl(resolve(cwd, flags.from), 'utf8');
    titles = raw
      .split(/\r?\n/)
      .map(l => l.replace(/^[-*]\s+/, '').trim())
      .filter(l => l && !l.startsWith('#'));
  } else {
    titles = parseSubIssueTitles(parent.description ?? '');
  }

  const limit =
    typeof flags.limit === 'string' || typeof flags.limit === 'number'
      ? Math.max(1, Number(flags.limit) || 20)
      : 20;
  titles = titles.slice(0, limit);

  if (titles.length === 0) {
    return {
      ok: false,
      error:
        'No sub-issue titles found. Add checklist/bullets under "Acceptance criteria" / "Sub-issues", or pass --from <file>.',
      parent: {
        id: parent.identifier,
        title: parent.title,
        url: parent.url,
      },
    };
  }

  const projectId = parent.project?.id ?? null;
  /** @type {object[]} */
  const created = [];
  /** @type {object[]} */
  const planned = [];

  for (const title of titles) {
    const payload = {
      title,
      description: `Sub-issue of ${parent.identifier}: ${parent.title}\n\nParent: ${parent.url}`,
      parentId: parent.id,
      projectId,
      labelNames: [LABEL_AGENTOS],
    };
    planned.push({ title, parentId: parent.identifier, projectId });

    if (flags['dry-run'] !== true) {
      const issue = await opts.client.createIssue(payload);
      created.push({
        id: issue.identifier,
        uuid: issue.id,
        title: issue.title,
        url: issue.url,
      });
    }
  }

  return {
    ok: true,
    dryRun: flags['dry-run'] === true,
    parent: {
      id: parent.identifier,
      title: parent.title,
      url: parent.url,
    },
    planned,
    created,
    count: flags['dry-run'] === true ? planned.length : created.length,
  };
}
