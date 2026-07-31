/**
 * `roadmap agent-brief <issueId>` — emit a structured agent brief.
 *
 * Full AgentBrief schema is owned by JOV-1933 (SYNC_MODEL §4). This command
 * emits a compatible v1 structured brief so agents can start work now; JOV-1933
 * may deepen tasteRules / verificationGates selection.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  DEFAULT_ALLOWED_ACTIONS,
  DEFAULT_BACKLOG_PATH,
  DEFAULT_FORBIDDEN_ACTIONS,
} from '../config.mjs';
import { mapLinearIssueToRoadmap } from '../map-issue.mjs';

/**
 * Pure brief builder from a RoadmapIssue (+ optional live description).
 * @param {{
 *   issue: object,
 *   backlog?: object|null,
 *   description?: string,
 *   generatedAt?: string,
 * }} input
 */
export function buildAgentBriefFromIssue(input) {
  const issue = input.issue;
  const backlog = input.backlog ?? null;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const project =
    backlog?.projects?.find(
      /** @param {{id:string}} p */ p => p.id === issue.projectId
    ) ?? null;

  const humanApprovalRequired = Boolean(issue.humanReviewRequired);
  const forbiddenActions = humanApprovalRequired
    ? []
    : [...DEFAULT_FORBIDDEN_ACTIONS];

  const blockedBy = (issue.blockedBy ?? []).map(
    /** @param {string} id */ id => ({
      id,
      title: findTitle(backlog, id),
      state: findState(backlog, id),
    })
  );
  const blocks = (issue.blocks ?? []).map(
    /** @param {string} id */ id => ({
      id,
      title: findTitle(backlog, id),
      state: findState(backlog, id),
    })
  );

  const siblings = (backlog?.issues ?? [])
    .filter(
      /** @param {{id:string,projectId?:string|null}} i */
      i => i.projectId && i.projectId === issue.projectId && i.id !== issue.id
    )
    .slice(0, 20)
    .map(
      /** @param {{id:string,title:string,state?:{name?:string}}} i */ i => ({
        id: i.id,
        title: i.title,
        state: i.state?.name ?? 'Unknown',
      })
    );

  const idSlug = String(issue.id ?? 'unknown').toLowerCase();
  const briefId = `brief-${idSlug}-${generatedAt}`;

  return {
    id: briefId,
    schemaVersion: 1,
    linearProject: project
      ? { id: project.id, name: project.name, slug: project.slug }
      : {
          id: issue.projectId ?? 'unknown',
          name: 'Unknown',
          slug: 'unknown',
        },
    currentIssue: {
      id: issue.id,
      title: issue.title,
      url: issue.url,
      description: input.description ?? '',
      priority: issue.priority ?? 0,
      state: issue.state?.name ?? 'Unknown',
      labels: issue.labels ?? [],
    },
    dependencies: {
      blockedBy,
      blocks,
      siblings,
    },
    repoSpecs: issue.repoFileRefs ?? [],
    tasteRules: inferTasteRules(issue),
    gstackSkills: inferGstackSkills(issue),
    kind: inferKind(issue),
    modelRoute: 'claude-code',
    allowedActions: [...DEFAULT_ALLOWED_ACTIONS],
    forbiddenActions,
    humanApprovalRequired,
    humanApprovalReason: humanApprovalRequired
      ? 'Issue carries human-review-required label'
      : null,
    successCriteria: extractSuccessCriteria(input.description ?? ''),
    verificationGates: [
      'gstack.qa.exhaustive',
      'gstack.review',
      'gstack.ship',
      'github.ci',
    ],
    generatedAt,
    generatedBy: 'agentos-app-user',
    backlogSyncedAt: backlog?.syncedAt ?? null,
  };
}

/**
 * @param {{
 *   client?: import('../linear-client.mjs').LinearClient|null,
 *   positionals: string[],
 *   flags?: Record<string, string|boolean>,
 *   cwd?: string,
 *   readFileImpl?: typeof readFile,
 *   backlog?: object|null,
 * }} opts
 */
export async function runAgentBrief(opts) {
  const flags = opts.flags ?? {};
  const issueId = opts.positionals[0];
  if (!issueId) {
    return {
      ok: false,
      error: 'agent-brief requires an issue id: roadmap agent-brief JOV-1234',
    };
  }

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

  /** @type {object|null} */
  let issue = backlog?.issues?.find(
    /** @param {{id:string}} i */ i =>
      i.id.toUpperCase() === String(issueId).toUpperCase()
  );

  let description = '';
  if (opts.client) {
    const live = await opts.client.fetchIssueByIdentifier(issueId);
    if (live) {
      description = live.description ?? '';
      const mapped = mapLinearIssueToRoadmap(
        live,
        backlog?.syncedAt ?? new Date().toISOString()
      );
      issue = { ...mapped, ...(issue ?? {}) };
      // Prefer live fields for correctness
      issue = mapped;
    }
  }

  if (!issue) {
    return {
      ok: false,
      error: `Issue ${issueId} not found in backlog.json${opts.client ? ' or Linear' : ''}. Run roadmap sync, or pass a live Linear client.`,
    };
  }

  const brief = buildAgentBriefFromIssue({
    issue,
    backlog,
    description,
  });

  return { ok: true, brief };
}

/**
 * @param {object|null} backlog
 * @param {string} id
 */
function findTitle(backlog, id) {
  const hit = backlog?.issues?.find(
    /** @param {{id:string}} i */ i => i.id === id
  );
  return hit?.title ?? '';
}

/**
 * @param {object|null} backlog
 * @param {string} id
 */
function findState(backlog, id) {
  const hit = backlog?.issues?.find(
    /** @param {{id:string}} i */ i => i.id === id
  );
  return hit?.state?.name ?? 'Unknown';
}

/**
 * @param {object} issue
 * @returns {string[]}
 */
function inferTasteRules(issue) {
  const labels = (issue.labels ?? []).map(
    /** @param {string} l */ l => l.toLowerCase()
  );
  const rules = ['.claude/rules/code-style.md', '.claude/rules/testing.md'];
  if (labels.some(l => l.includes('ui') || l.includes('design'))) {
    rules.push('.claude/rules/ui.md', 'DESIGN.md');
  }
  if (labels.some(l => l.includes('auth'))) {
    rules.push('.claude/rules/auth.md', '.claude/rules/security.md');
  }
  if (labels.some(l => l.includes('db') || l.includes('migration'))) {
    rules.push('.claude/rules/db.md');
  }
  if (labels.some(l => l.includes('billing') || l.includes('stripe'))) {
    rules.push('.claude/rules/security.md');
  }
  return [...new Set(rules)];
}

/**
 * @param {object} issue
 * @returns {string[]}
 */
function inferGstackSkills(issue) {
  const labels = (issue.labels ?? []).map(
    /** @param {string} l */ l => l.toLowerCase()
  );
  if (labels.some(l => l.includes('ui') || l.includes('design'))) {
    return ['/qa --exhaustive', '/design-review', '/review', '/ship'];
  }
  return ['/qa --exhaustive', '/review', '/ship'];
}

/**
 * @param {object} issue
 * @returns {string}
 */
function inferKind(issue) {
  const labels = (issue.labels ?? []).map(
    /** @param {string} l */ l => l.toLowerCase()
  );
  const title = String(issue.title ?? '').toLowerCase();
  if (labels.some(l => l.includes('qa')) || title.includes('qa')) return 'qa';
  if (labels.some(l => l.includes('design')) || title.includes('design'))
    return 'design_review';
  if (labels.some(l => l.includes('review'))) return 'code_review';
  if (labels.some(l => l.includes('triage'))) return 'triage';
  return 'workflow';
}

/**
 * @param {string} description
 * @returns {string[]}
 */
function extractSuccessCriteria(description) {
  if (!description) return [];
  const lines = description.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (
      /^#{1,3}\s*(acceptance criteria|success criteria|done when)\b/i.test(line)
    ) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s+\S/.test(line)) break;
    if (!inSection) continue;
    const m =
      line.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/) ||
      line.match(/^\d+[.)]\s+(.+)$/);
    if (m?.[1]) out.push(m[1].trim());
  }
  return out;
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
