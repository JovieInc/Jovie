/**
 * In-memory GitHub, production, and Linear for the validation lifecycle
 * tests. Main history is linear: every later commit contains the earlier
 * ones, which is what GitHub's compare API reports for main.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatValidationReceipt } from '../../validation-lifecycle.mjs';

export const HARNESS_MANIFEST = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../../.github/ci-harness/manifest.json'
    ),
    'utf8'
  )
);
/** A matrix with no UI rows: changes owe no founder taste receipt. */
export const NO_UI_MATRIX = Object.freeze({ rows: [] });
/** A deterministic JOV-7713 UI row that `apps/web/components/` invalidates. */
export const UI_MATRIX = Object.freeze({
  rows: [
    {
      id: 'AM-020',
      failureClass: 'ui-state-completeness',
      invalidatesOn: ['apps/web/components/'],
      ui: {
        judgment: 'deterministic',
        requiredEvidence: ['web-desktop', 'web-mobile'],
      },
    },
  ],
});
/** The taste row: only this owes the founder (JOV-7759). */
export const TASTE_MATRIX = Object.freeze({
  rows: [
    {
      id: 'AM-024',
      failureClass: 'ui-visual-taste',
      invalidatesOn: ['apps/web/components/'],
      ui: {
        judgment: 'taste',
        requiredEvidence: ['web-desktop', 'macos-electron'],
      },
    },
  ],
});
export const REPO = 'JovieInc/Jovie';
const sha = (/** @type {string} */ seed) => seed.repeat(40).slice(0, 40);
/** Main history, oldest first. Every later commit contains the earlier ones. */
export const MAIN = [sha('1'), sha('2'), sha('3'), sha('4'), sha('5')];
export const STATES = [
  'Todo',
  'In Progress',
  'In Review',
  'Rework',
  'Merging',
  'Validating',
  'Done',
  'Canceled',
].map(name => ({
  id: `state-${name}`,
  name,
  type:
    name === 'Done'
      ? 'completed'
      : name === 'Canceled'
        ? 'canceled'
        : name === 'Todo'
          ? 'unstarted'
          : 'started',
}));

/**
 * In-memory Linear + GitHub + production. Every mutation is recorded, so
 * replay and ordering tests can count writes.
 */
export function createWorld(overrides = {}) {
  const world = {
    served: MAIN[2].slice(0, 7),
    markers: new Set([MAIN[2], MAIN[4]]),
    openPulls: [],
    /** @type {Record<number, { mergeSha: string, mergedAt: string, files: string[], base?: string, title?: string, body?: string, headRef?: string }>} */
    pulls: {
      101: {
        mergeSha: MAIN[1],
        mergedAt: '2026-10-03T10:00:00Z',
        files: ['apps/web/components/Card.tsx'],
      },
    },
    issues: {
      'JOV-1': {
        id: 'uuid-1',
        identifier: 'JOV-1',
        title: 'Profiles: editorial card replaces the carousel',
        description: '',
        state: 'In Review',
        labels: [],
        children: [],
        attachments: ['https://github.com/JovieInc/Jovie/pull/101'],
        history: [],
        comments: [],
      },
    },
    clock: Date.parse('2026-10-03T12:00:00Z'),
    updates: [],
    comments: [],
    /** @type {string[]} */
    descriptions: [],
    failVersion: false,
    refuseDescription: false,
    stateChangeDuringRead: null,
    ...overrides,
  };
  const position = commit => MAIN.indexOf(commit);
  const byKey = key =>
    Object.values(world.issues).find(
      issue => issue.id === key || issue.identifier === key
    );
  const ok = body => ({
    ok: true,
    headers: { get: () => '' },
    json: async () => body,
  });

  /** @type {any} */
  const fetchImpl = async (url, init) => {
    const href = String(url);
    if (href === 'https://jov.ie/api/version') {
      if (world.failVersion)
        return { ok: false, status: 503, json: async () => ({}) };
      return ok({ buildId: world.served });
    }
    if (href.startsWith('https://api.github.com/')) {
      const path = href.slice('https://api.github.com/'.length);
      if (path.startsWith(`repos/${REPO}/pulls?state=open`))
        return ok(world.openPulls);
      let match = /^repos\/JovieInc\/Jovie\/pulls\/(\d+)\/files/.exec(path);
      if (match) {
        const files = world.pulls[Number(match[1])]?.files ?? [];
        return ok(files.map(filename => ({ filename })));
      }
      match = /^repos\/JovieInc\/Jovie\/pulls\/(\d+)$/.exec(path);
      if (match) {
        const record = world.pulls[Number(match[1])];
        if (!record) return { ok: false, status: 404, json: async () => ({}) };
        return ok({
          html_url: `https://github.com/${REPO}/pull/${match[1]}`,
          merged_at: record.mergedAt,
          merge_commit_sha: record.mergeSha,
          base: { ref: record.base ?? 'main' },
          title: record.title ?? 'feat(profile): editorial card',
          body: record.body ?? '',
          head: { ref: record.headRef ?? 'tim/jov-1-editorial-card' },
        });
      }
      match = /^repos\/JovieInc\/Jovie\/commits\/([0-9a-f]+)$/.exec(path);
      if (match) {
        const full = MAIN.find(commit => commit.startsWith(match[1]));
        return full
          ? ok({ sha: full })
          : { ok: false, status: 404, json: async () => ({}) };
      }
      match =
        /^repos\/JovieInc\/Jovie\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(
          path
        );
      if (match) {
        const [base, head] = [position(match[1]), position(match[2])];
        const status =
          base === head ? 'identical' : head > base ? 'ahead' : 'behind';
        return ok({ status });
      }
      match = /name=production-generation-verified-([0-9a-f]{40})/.exec(path);
      if (match) {
        return ok({
          artifacts: world.markers.has(match[1])
            ? [
                {
                  name: `production-generation-verified-${match[1]}`,
                  expired: false,
                  workflow_run: { head_branch: 'main' },
                },
              ]
            : [],
        });
      }
      throw new Error(`unexpected GitHub path ${path}`);
    }
    const { query, variables } = JSON.parse(String(init?.body ?? '{}'));
    if (query.includes('LifecycleSweep')) {
      return ok({
        data: {
          issues: {
            nodes: Object.values(world.issues)
              .filter(issue => variables.states.includes(issue.state))
              .map(issue => ({
                identifier: issue.identifier,
                updatedAt: issue.updatedAt ?? '2026-10-03T12:00:00Z',
              })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    if (query.includes('IssueLifecycleState')) {
      const issue = byKey(variables.issueId);
      if (world.stateChangeDuringRead) {
        issue.state = world.stateChangeDuringRead;
        world.stateChangeDuringRead = null;
      }
      return ok({
        data: {
          issue: issue && {
            id: issue.id,
            state: { id: `state-${issue.state}`, name: issue.state },
          },
        },
      });
    }
    if (query.includes('IssueLifecycle(')) {
      const issue = byKey(variables.issueId);
      if (!issue) return ok({ data: { issue: null } });
      const state = STATES.find(entry => entry.name === issue.state);
      return ok({
        data: {
          issue: {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            state,
            labels: { nodes: issue.labels.map(name => ({ name })) },
            comments: {
              nodes: issue.comments,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
            children: {
              nodes: issue.children.map(([identifier, type]) => ({
                identifier,
                state: { type },
              })),
            },
            attachments: { nodes: issue.attachments.map(url => ({ url })) },
            history: { nodes: issue.history },
            team: { states: { nodes: STATES } },
          },
        },
      });
    }
    if (query.includes('IssueLifecycleDescription')) {
      const issue = byKey(variables.issueId);
      return ok({
        data: { issue: issue ? { description: issue.description } : null },
      });
    }
    if (query.includes('SetLifecycleDescription')) {
      const issue = byKey(variables.issueId);
      issue.description = variables.description;
      world.descriptions.push(issue.identifier);
      return ok({ data: { issueUpdate: { success: true } } });
    }
    if (query.includes('issueUpdate')) {
      const issue = byKey(variables.issueId);
      const state = STATES.find(entry => entry.id === variables.stateId);
      issue.state = state.name;
      world.updates.push(`${issue.identifier}:${state.name}`);
      return ok({
        data: {
          issueUpdate: {
            success: true,
            issue: { state: { name: state.name } },
          },
        },
      });
    }
    if (query.includes('commentCreate')) {
      const issue = byKey(variables.issueId);
      world.clock += 1000;
      const comment = {
        body: variables.body,
        createdAt: new Date(world.clock).toISOString(),
      };
      issue.comments.push(comment);
      world.comments.push(
        `${issue.identifier}:${variables.body.split('\n')[0]}`
      );
      return ok({ data: { commentCreate: { success: true } } });
    }
    throw new Error(`unexpected Linear query ${query.slice(0, 60)}`);
  };
  return { world, fetchImpl };
}

export function receiptComment(identifier, overrides, createdAt) {
  return {
    body: formatValidationReceipt({
      issue: identifier,
      kind: 'outcome',
      status: 'pass',
      sha: MAIN[2],
      evidence: 'https://example.test/outcome/1',
      ...overrides,
    }),
    createdAt,
  };
}

/** Wrap the world's fetch to rewrite or replace one class of response. */
export function intercept(fetchImpl, handler) {
  return async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const replaced = await handler(String(url), body, () =>
      fetchImpl(url, init)
    );
    return replaced ?? fetchImpl(url, init);
  };
}

export const json = body => ({
  ok: true,
  headers: { get: () => '' },
  json: async () => body,
});

export function validClosure(identifier, deployedSha) {
  return `<!-- escaped-defect-closure:v1\n${JSON.stringify({
    schema: 'jovie.escaped-defect-closure/v1',
    originatingIssue: identifier,
    reproduction: { evidenceRef: 'https://example.test/repro/1' },
    productRepair: {
      fixRef: 'https://github.com/JovieInc/Jovie/pull/101',
      journeyRetestRef: 'https://example.test/retest/1',
      deployedBuild: {
        sha: deployedSha,
        url: 'https://jov.ie',
        deploymentId: 'dpl_example_1',
        evidenceRef: 'https://example.test/deploy/1',
        verifiedAt: '2026-10-03T11:00:00Z',
      },
    },
    detection: {
      originatingIssue: identifier,
      gapAnalysis: 'The canary never exercised the 320px profile dock.',
      gapClass: 'coverage-gap',
      detectorRef: 'https://example.test/detector/1',
      coveredClass: 'profile primary actions at narrow widths',
      deliberateRedRef: 'https://example.test/red/1',
      learningCompiler: {
        issue: 'JOV-7084',
        outputRef: 'https://example.test/learning/1',
      },
      verification: {
        status: 'live-verified',
        evidenceRef: 'https://example.test/detector-live/1',
        verifiedAt: '2026-10-03T11:10:00Z',
      },
    },
    remediation: { mode: 'not-automatic' },
  })}\n-->`;
}

/**
 * The issue as the merge-sync reader returns it, straight from the world.
 *
 * @param {any} world
 * @param {string} identifier
 */
export function snapshotFor(world, identifier) {
  const issue = world.issues[identifier];
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    labels: [...issue.labels],
    state: STATES.find(entry => entry.name === issue.state),
    states: STATES,
    commentRecords: [...issue.comments],
    attachmentUrls: [...issue.attachments],
    reopenedAfterDone: issue.history.some(
      entry =>
        entry?.fromState?.type === 'completed' &&
        entry?.toState?.type !== 'completed'
    ),
  };
}

/**
 * Linear writes against the world, through the same port shape the
 * merge-sync writer supplies.
 *
 * @param {any} world
 */
export function portFor(world) {
  const byId = id => Object.values(world.issues).find(issue => issue.id === id);
  return {
    readStateId: async id => {
      const issue = byId(id);
      if (world.stateChangeDuringRead) {
        issue.state = world.stateChangeDuringRead;
        world.stateChangeDuringRead = null;
      }
      return `state-${issue.state}`;
    },
    setState: async (id, stateId) => {
      const issue = byId(id);
      const state = STATES.find(entry => entry.id === stateId);
      if (world.refuseUpdate) return '';
      issue.state = state.name;
      world.updates.push(`${issue.identifier}:${state.name}`);
      return state.name;
    },
    addComment: async (id, body) => {
      if (world.refuseComment) return false;
      const issue = byId(id);
      world.clock += 1000;
      issue.comments.push({
        body,
        createdAt: new Date(world.clock).toISOString(),
      });
      world.comments.push(`${issue.identifier}:${body.split('\n')[0]}`);
      return true;
    },
    readDescription: async id => byId(id).description,
    setDescription: async (id, description) => {
      if (world.refuseDescription) return false;
      const issue = byId(id);
      issue.description = description;
      world.descriptions.push(issue.identifier);
      return true;
    },
  };
}
