import {
  assertRepoSuccess,
  currentBranch,
  OVERNIGHT_BASE_BRANCH,
  runRepoCommand,
} from './repo-git';
import type { PullRequestInfo } from './types';

interface GithubPullRequestView {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state: string;
}

export function findOpenPrForCurrentBranch() {
  const result = runRepoCommand([
    'gh',
    'pr',
    'view',
    '--json',
    'number,url,title,state',
  ]);

  if (result.code !== 0) {
    return null;
  }

  const view = JSON.parse(result.stdout) as GithubPullRequestView;
  if (view.state !== 'OPEN') {
    return null;
  }

  return {
    number: view.number,
    url: view.url,
    title: view.title,
    branch: currentBranch(),
  } satisfies PullRequestInfo;
}

export function ensureDraftPr(params: {
  readonly title: string;
  readonly body: string;
}): PullRequestInfo {
  const existing = findOpenPrForCurrentBranch();
  if (existing) {
    assertRepoSuccess(
      runRepoCommand([
        'gh',
        'pr',
        'edit',
        String(existing.number),
        '--title',
        params.title,
        '--body',
        params.body,
      ]),
      `Failed to update PR #${existing.number}.`
    );
    return {
      ...existing,
      title: params.title,
    };
  }

  const create = runRepoCommand([
    'gh',
    'pr',
    'create',
    '--draft',
    '--base',
    OVERNIGHT_BASE_BRANCH,
    '--title',
    params.title,
    '--body',
    params.body,
  ]);
  assertRepoSuccess(create, 'Failed to create draft PR.');

  const created = findOpenPrForCurrentBranch();
  if (!created) {
    throw new Error('PR was created but could not be reloaded.');
  }

  return created;
}

export function applyLabels(prNumber: number, labels: readonly string[]) {
  if (labels.length === 0) {
    return;
  }

  assertRepoSuccess(
    runRepoCommand([
      'gh',
      'pr',
      'edit',
      String(prNumber),
      '--add-label',
      labels.join(','),
    ]),
    `Failed to apply labels to PR #${prNumber}.`
  );
}

export function enableAutoMerge(prNumber: number) {
  assertRepoSuccess(
    runRepoCommand([
      'gh',
      'pr',
      'merge',
      String(prNumber),
      '--auto',
      '--squash',
      '--delete-branch',
    ]),
    `Failed to enable auto-merge for PR #${prNumber}.`
  );
}

export function buildPrBody(params: {
  readonly issueSummary: string;
  readonly evidencePaths: readonly string[];
  readonly verificationLabels: readonly string[];
  readonly riskReasons: readonly string[];
}) {
  return [
    '## Summary',
    params.issueSummary,
    '',
    '## Evidence',
    ...(params.evidencePaths.length > 0
      ? params.evidencePaths.map(path => `- ${path}`)
      : ['- No local evidence files were recorded.']),
    '',
    '## Verification',
    ...(params.verificationLabels.length > 0
      ? params.verificationLabels.map(label => `- ${label}`)
      : ['- Verification pending']),
    '',
    '## Risk Notes',
    ...(params.riskReasons.length > 0
      ? params.riskReasons.map(reason => `- ${reason}`)
      : ['- No additional risk notes.']),
  ].join('\n');
}
