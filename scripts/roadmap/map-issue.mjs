/**
 * Pure Linear → RoadmapIssue / RoadmapProject mappers (SYNC_MODEL §3).
 * No network, no fs — unit-testable in isolation.
 */

import { LABEL_AGENTOS, LABEL_HUMAN_REVIEW } from './config.mjs';

/**
 * @param {string} name
 * @returns {string}
 */
export function toSlug(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract repo-relative path refs from markdown/description text.
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function extractRepoFileRefs(text) {
  if (!text) return [];
  const refs = new Set();
  // backtick paths and bare paths with common prefixes
  const re =
    /(?:`|\b)((?:apps|packages|agentos|scripts|docs|\.claude|canon)\/[A-Za-z0-9_./@-]+\.[A-Za-z0-9]+)(?:`|\b)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    refs.add(m[1]);
  }
  return [...refs].sort();
}

/**
 * Agent-owned when all three are true (SYNC_MODEL §2.3):
 * 1. label `agentos`
 * 2. delegate is set (AgentOS app user when provisioned)
 * 3. no `human-review-required` label
 *
 * Until JOV-1934 provisions the app user, delegate may be null.
 * We treat label agentos + !human-review-required as agent-eligible when
 * delegate is absent, and require all three when delegate is present.
 *
 * @param {{ labels: string[], delegate: { id: string; name: string } | null }} input
 * @returns {boolean}
 */
export function computeAgentOwned(input) {
  const labels = input.labels.map(l => l.toLowerCase());
  const hasAgentos = labels.includes(LABEL_AGENTOS);
  const humanReview = labels.includes(LABEL_HUMAN_REVIEW);
  if (!hasAgentos || humanReview) return false;
  // If a delegate is recorded, require it (full §2.3). If not yet provisioned,
  // agentos label alone is sufficient for mirror eligibility.
  if (input.delegate) return true;
  return true;
}

/**
 * @param {{ labels: string[] }} input
 */
export function computeHumanReviewRequired(input) {
  return input.labels.map(l => l.toLowerCase()).includes(LABEL_HUMAN_REVIEW);
}

/**
 * Normalize Linear state type to RoadmapStateType.
 * @param {string|null|undefined} type
 * @param {string|null|undefined} name
 */
export function normalizeStateType(type, name) {
  const t = String(type ?? '').toLowerCase();
  if (
    t === 'triage' ||
    t === 'backlog' ||
    t === 'unstarted' ||
    t === 'started' ||
    t === 'completed' ||
    t === 'canceled'
  ) {
    return t;
  }
  const n = String(name ?? '').toLowerCase();
  if (n.includes('triage')) return 'triage';
  if (n.includes('backlog')) return 'backlog';
  if (n.includes('todo') || n.includes('unstarted')) return 'unstarted';
  if (n.includes('progress') || n.includes('review') || n.includes('started'))
    return 'started';
  if (n.includes('done') || n.includes('complete')) return 'completed';
  if (n.includes('cancel') || n.includes('duplicate')) return 'canceled';
  return 'unstarted';
}

/**
 * Map Linear project status string to RoadmapProjectStatus.
 * @param {string|null|undefined} status
 */
export function normalizeProjectStatus(status) {
  const s = String(status ?? '').toLowerCase();
  if (
    s === 'planned' ||
    s === 'started' ||
    s === 'paused' ||
    s === 'completed' ||
    s === 'canceled'
  ) {
    return s;
  }
  if (s.includes('progress') || s === 'in progress') return 'started';
  if (s.includes('complete') || s === 'done') return 'completed';
  if (s.includes('cancel')) return 'canceled';
  if (s.includes('pause')) return 'paused';
  return 'planned';
}

/**
 * @param {number|null|undefined} priority
 * @returns {0|1|2|3|4}
 */
export function normalizePriority(priority) {
  const p = Number(priority);
  if (p === 1 || p === 2 || p === 3 || p === 4) return p;
  return 0;
}

/**
 * @param {object} node  Linear issue GraphQL node
 * @param {string} [syncedAt]
 */
export function mapLinearIssueToRoadmap(
  node,
  syncedAt = new Date().toISOString()
) {
  const labels = (node.labels?.nodes ?? node.labels ?? []).map(
    /** @param {{name?: string}|string} l */ l =>
      typeof l === 'string' ? l : String(l?.name ?? '')
  );
  const assignee = node.assignee
    ? {
        id: node.assignee.id,
        name: node.assignee.name ?? node.assignee.displayName ?? '',
      }
    : null;
  // Linear GraphQL does not always expose "delegate"; accept optional field
  // or agentOS metadata when present.
  const delegate = node.delegate
    ? { id: node.delegate.id, name: node.delegate.name ?? '' }
    : null;

  const blockedBy = [];
  const blocks = [];
  for (const rel of node.relations?.nodes ?? []) {
    const related = rel.relatedIssue;
    if (!related?.identifier) continue;
    if (rel.type === 'blocks') {
      // "this issue blocks related" — related is blocked by us
      blocks.push(related.identifier);
    } else if (rel.type === 'blocked_by' || rel.type === 'blockedBy') {
      blockedBy.push(related.identifier);
    }
  }
  // Inverse: if relation type is "blocks" on the other side, Linear may only
  // surface one direction. Also scan inverse relations when provided.
  for (const rel of node.inverseRelations?.nodes ?? []) {
    const related = rel.relatedIssue;
    if (!related?.identifier) continue;
    if (rel.type === 'blocks') {
      blockedBy.push(related.identifier);
    }
  }

  const humanReviewRequired = computeHumanReviewRequired({ labels });
  const agentOwned = computeAgentOwned({ labels, delegate });

  return {
    id: node.identifier,
    uuid: node.id,
    title: node.title ?? '',
    url: node.url ?? '',
    state: {
      name: node.state?.name ?? 'Unknown',
      type: normalizeStateType(node.state?.type, node.state?.name),
    },
    priority: normalizePriority(node.priority),
    assignee,
    delegate,
    labels,
    projectId: node.project?.id ?? node.projectId ?? null,
    parentId: node.parent?.identifier ?? null,
    blockedBy: [...new Set(blockedBy)],
    blocks: [...new Set(blocks)],
    agentOwned,
    humanReviewRequired,
    repoFileRefs: extractRepoFileRefs(node.description),
    pullRequestUrl: extractPullRequestUrl(node),
    createdAt: node.createdAt ?? syncedAt,
    updatedAt: node.updatedAt ?? syncedAt,
    lastSyncedAt: syncedAt,
  };
}

/**
 * @param {object} node
 * @returns {string|null}
 */
function extractPullRequestUrl(node) {
  if (node.pullRequestUrl) return node.pullRequestUrl;
  const attachments = node.attachments?.nodes ?? [];
  for (const a of attachments) {
    const url = a.url ?? a.href ?? '';
    if (/github\.com\/.+\/pull\/\d+/i.test(url)) return url;
  }
  const desc = node.description ?? '';
  const m = desc.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
  return m ? m[0] : null;
}

/**
 * @param {object} node  Linear project node
 * @param {string} [repoRootRelativePrefix]
 */
export function mapLinearProjectToRoadmap(
  node,
  repoRootRelativePrefix = 'agentos/roadmap'
) {
  const slug = toSlug(node.name ?? node.slug ?? node.id);
  return {
    id: node.id,
    name: node.name ?? '',
    slug,
    status: normalizeProjectStatus(
      typeof node.status === 'string' ? node.status : node.status?.name
    ),
    url: node.url ?? '',
    specPath: `${repoRootRelativePrefix}/${slug}.md`,
  };
}

/**
 * Parse sub-issue titles from an epic description or freeform brief.
 * Prefers checklist items, then numbered/bulleted lines under common headings.
 *
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function parseSubIssueTitles(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const titles = [];
  let inSection = false;
  const sectionRe =
    /^(#{1,3}\s*)?(acceptance criteria|sub-?issues|tasks|breakdown|children|work items)\b/i;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (sectionRe.test(line)) {
      inSection = true;
      continue;
    }
    // Leaving a section when another heading appears
    if (inSection && /^#{1,3}\s+\S/.test(line) && !sectionRe.test(line)) {
      inSection = false;
    }

    const checklist = line.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const candidate = checklist?.[1] ?? bullet?.[1] ?? numbered?.[1] ?? null;
    if (!candidate) continue;

    // Prefer section-scoped items; also accept top-level checklists anywhere
    if (inSection || checklist) {
      const cleaned = candidate.replace(/\s+$/, '').trim();
      if (cleaned.length >= 3 && cleaned.length <= 200) {
        titles.push(cleaned);
      }
    }
  }

  // Dedupe preserving order
  const seen = new Set();
  return titles.filter(t => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Compare two backlog snapshots on tracked drift fields (SYNC_MODEL §5.1).
 * @param {object|null} disk
 * @param {object} next
 * @returns {{ drifted: boolean, details: string[] }}
 */
export function detectBacklogDrift(disk, next) {
  /** @type {string[]} */
  const details = [];
  if (!disk || !Array.isArray(disk.issues)) {
    return {
      drifted: true,
      details: ['on-disk backlog missing or has no issues array'],
    };
  }

  const diskById = new Map(
    disk.issues.map(/** @param {{id:string}} i */ i => [i.id, i])
  );
  const nextById = new Map(
    next.issues.map(/** @param {{id:string}} i */ i => [i.id, i])
  );

  for (const id of new Set([...diskById.keys(), ...nextById.keys()])) {
    const a = diskById.get(id);
    const b = nextById.get(id);
    if (!a) {
      details.push(`${id}: added in Linear`);
      continue;
    }
    if (!b) {
      details.push(`${id}: removed from Linear active set`);
      continue;
    }
    const fields = [
      ['state', a.state?.name, b.state?.name],
      ['priority', a.priority, b.priority],
      ['assignee', a.assignee?.id ?? null, b.assignee?.id ?? null],
      ['delegate', a.delegate?.id ?? null, b.delegate?.id ?? null],
      [
        'labels',
        (a.labels ?? []).slice().sort().join(','),
        (b.labels ?? []).slice().sort().join(','),
      ],
      ['projectId', a.projectId, b.projectId],
      ['parentId', a.parentId, b.parentId],
      [
        'blockedBy',
        (a.blockedBy ?? []).slice().sort().join(','),
        (b.blockedBy ?? []).slice().sort().join(','),
      ],
      [
        'blocks',
        (a.blocks ?? []).slice().sort().join(','),
        (b.blocks ?? []).slice().sort().join(','),
      ],
    ];
    for (const [name, av, bv] of fields) {
      if (av !== bv) {
        details.push(
          `${id}.${name}: ${JSON.stringify(av)} → ${JSON.stringify(bv)}`
        );
      }
    }
  }

  return { drifted: details.length > 0, details };
}

/**
 * Filter issues for `today` (active, not human-review-required).
 * @param {readonly object[]} issues
 * @param {{ limit?: number, stateNames?: readonly string[] }} [opts]
 */
export function selectTodayIssues(issues, opts = {}) {
  const limit = opts.limit ?? 50;
  const stateNames = new Set(
    (opts.stateNames ?? ['Todo', 'In Progress', 'In Review']).map(s =>
      s.toLowerCase()
    )
  );
  return issues
    .filter(i => {
      if (i.humanReviewRequired) return false;
      const name = String(i.state?.name ?? '').toLowerCase();
      return stateNames.has(name);
    })
    .sort((a, b) => {
      // priority: lower number first, but 0 (None) last
      const pa = a.priority === 0 ? 99 : a.priority;
      const pb = b.priority === 0 ? 99 : b.priority;
      if (pa !== pb) return pa - pb;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, limit);
}

/**
 * Filter issues that are agent-eligible and do NOT require human review
 * (human-approval gate cleared).
 * @param {readonly object[]} issues
 * @param {{ limit?: number }} [opts]
 */
export function selectApprovedIssues(issues, opts = {}) {
  const limit = opts.limit ?? 50;
  return issues
    .filter(i => i.agentOwned === true && i.humanReviewRequired === false)
    .sort((a, b) => {
      const pa = a.priority === 0 ? 99 : a.priority;
      const pb = b.priority === 0 ? 99 : b.priority;
      if (pa !== pb) return pa - pb;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, limit);
}
