/**
 * Shared fixture for testflight-release-lease tests. Extracted from
 * testflight-release-lease.test.mjs to keep that file under its size budget.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SOURCE = 'a'.repeat(40);
export const CONTROLLER_HEAD = 'b'.repeat(40);
export const TRANSPORT = 'c'.repeat(40);
export const MAIN = 'd'.repeat(40);
export const NEXT = 'e'.repeat(40);
export const REPOSITORY = 'JovieInc/Jovie';
export const NOW = Date.parse('2026-10-16T08:00:00Z');

// Shell date and the isolated CLI do not inherit the parent Node clock shim.

export function fixture() {
  const policy = JSON.parse(
    readFileSync(new URL('../testflight-release-policy.json', import.meta.url))
  );
  const run = {
    id: 80,
    run_attempt: 1,
    workflow_id: 2,
    path: '.github/workflows/ios-testflight.yml',
    event: 'workflow_run',
    head_branch: 'main',
    head_sha: TRANSPORT,
    head_repository: { full_name: REPOSITORY },
    status: 'in_progress',
  };
  const controller = {
    ...run,
    id: 70,
    workflow_id: 1,
    path: '.github/workflows/production-controller.yml',
    head_sha: CONTROLLER_HEAD,
    status: 'completed',
    conclusion: 'success',
    display_title: `Production Controller ${SOURCE} from CI 60 attempt 1`,
  };
  const marker = {
    sha: SOURCE,
    controllerRun: '70',
    controllerAttempt: '1',
    deploymentId: 'dpl_fixture',
  };
  const artifacts = [
    {
      id: 5,
      name: `production-generation-verified-${SOURCE}`,
      expired: false,
      workflow_run: { id: 70, head_sha: CONTROLLER_HEAD },
    },
  ];
  const jobs = [
    {
      id: 9,
      name: 'Production Verified',
      head_sha: CONTROLLER_HEAD,
      status: 'completed',
      conclusion: 'success',
      completed_at: '2026-10-16T07:59:00Z',
    },
  ];
  const intents = [];
  const payloads = new Map([[5, marker]]);
  let main = MAIN;
  const table = new Map([
    [
      'actions/workflows/ios-testflight.yml',
      { id: 2, name: 'iOS TestFlight', path: run.path, state: 'active' },
    ],
    [
      'actions/workflows/production-controller.yml',
      {
        id: 1,
        name: 'Production Controller',
        path: controller.path,
        state: 'active',
      },
    ],
    [
      'actions/workflows/ci.yml',
      { id: 3, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
    ],
    ['actions/runs/80', run],
    ['actions/runs/80/attempts/1', run],
    ['actions/runs/70', controller],
    ['actions/runs/70/attempts/1', controller],
    [
      'actions/runs/60/attempts/1',
      {
        ...controller,
        id: 60,
        workflow_id: 3,
        path: '.github/workflows/ci.yml',
        event: 'push',
        head_sha: SOURCE,
      },
    ],
  ]);
  table.set('actions/runs/60', table.get('actions/runs/60/attempts/1'));
  const order = [SOURCE, CONTROLLER_HEAD, TRANSPORT, MAIN, NEXT];
  const api = route => {
    const path = route.replace(`repos/${REPOSITORY}/`, '');
    if (path === 'commits/main') return { sha: main };
    if (path === 'actions/artifacts/5') return artifacts[0];
    if (path.startsWith('contents/'))
      return {
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(policy)).toString('base64'),
      };
    if (path.startsWith('compare/')) {
      const [older, newer] = path.slice(8).split('...');
      return {
        status:
          order.indexOf(older) < order.indexOf(newer) ? 'ahead' : 'behind',
        merge_base_commit: { sha: older },
      };
    }
    if (
      path.startsWith(`actions/artifacts?name=production-generation-verified-`)
    )
      return { total_count: artifacts.length, artifacts };
    if (path.startsWith('actions/artifacts?name=testflight-upload-intent'))
      return {
        total_count: intents.filter(a => path.includes(`name=${a.name}&`))
          .length,
        artifacts: intents.filter(a => path.includes(`name=${a.name}&`)),
      };
    if (path === 'actions/runs/70/attempts/1/jobs?per_page=100')
      return { total_count: jobs.length, jobs };
    assert.ok(table.has(path), `Unexpected API request ${path}`);
    return table.get(path);
  };
  const input = {
    repository: REPOSITORY,
    sourceSha: SOURCE,
    transportSha: TRANSPORT,
    workflowRun: '80',
    workflowAttempt: '1',
    controllerRun: '70',
    controllerAttempt: '1',
    now: NOW,
    api,
    readArtifact: id => payloads.get(id),
  };
  const reserve = lease => {
    intents.push({
      id: 6,
      name: `testflight-upload-intent-${lease.baselineSha || 'bootstrap'}`,
      expired: false,
      workflow_run: { id: 80 },
    });
    payloads.set(6, structuredClone(lease));
  };
  return {
    input,
    policy,
    run,
    controller,
    marker,
    artifacts,
    jobs,
    intents,
    payloads,
    table,
    reserve,
    moveMain: sha => {
      main = sha;
    },
  };
}

export function addReservation(f, { id, source, baseline = '', run = id }) {
  const prior = {
    schema: 'jovie-testflight-release-lease/v1',
    repository: REPOSITORY,
    sourceSha: source,
    transportSha: TRANSPORT,
    baselineSha: baseline,
    intentName: `testflight-upload-intent-${baseline || 'bootstrap'}`,
    workflowRun: String(run),
    workflowAttempt: '1',
  };
  f.intents.push({
    id,
    name: prior.intentName,
    expired: false,
    workflow_run: { id: run },
  });
  f.payloads.set(id, prior);
  f.table.set(`actions/runs/${run}/attempts/1`, {
    ...f.run,
    id: run,
    head_sha: TRANSPORT,
  });
}
