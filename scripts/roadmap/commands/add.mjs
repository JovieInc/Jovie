/**
 * `roadmap add <title>` — create a Linear issue from a brief.
 */

import { LABEL_AGENTOS } from '../config.mjs';
import { normalizePriority } from '../map-issue.mjs';

/**
 * @param {{
 *   client: import('../linear-client.mjs').LinearClient,
 *   positionals: string[],
 *   flags?: Record<string, string|boolean>,
 * }} opts
 */
export async function runAdd(opts) {
  const flags = opts.flags ?? {};
  const title =
    opts.positionals.join(' ').trim() ||
    (typeof flags.title === 'string' ? flags.title.trim() : '');

  if (!title) {
    return {
      ok: false,
      error: 'add requires a title: roadmap add <title> [--description ...]',
    };
  }

  const description =
    typeof flags.description === 'string' ? flags.description : '';
  const priority = normalizePriority(
    typeof flags.priority === 'string' || typeof flags.priority === 'number'
      ? Number(flags.priority)
      : 0
  );

  /** @type {string[]} */
  const extraLabels = [];
  if (typeof flags.labels === 'string' && flags.labels.trim()) {
    extraLabels.push(
      ...flags.labels
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  }

  let parentId = null;
  if (typeof flags.parent === 'string' && flags.parent.trim()) {
    const parent = await opts.client.fetchIssueByIdentifier(flags.parent.trim());
    if (!parent) {
      return { ok: false, error: `Parent issue not found: ${flags.parent}` };
    }
    parentId = parent.id;
  }

  let projectId = null;
  if (typeof flags.project === 'string' && flags.project.trim()) {
    projectId = await opts.client.resolveProjectId(flags.project.trim());
    if (!projectId) {
      return {
        ok: false,
        error: `Project not found: ${flags.project}`,
      };
    }
  }

  const payload = {
    title,
    description,
    priority,
    parentId,
    projectId,
    labelNames: extraLabels,
  };

  if (flags['dry-run'] === true) {
    return {
      ok: true,
      dryRun: true,
      planned: {
        ...payload,
        labels: [LABEL_AGENTOS, ...extraLabels],
      },
    };
  }

  const issue = await opts.client.createIssue(payload);
  return {
    ok: true,
    dryRun: false,
    issue: {
      id: issue.identifier,
      uuid: issue.id,
      title: issue.title,
      url: issue.url,
    },
  };
}
