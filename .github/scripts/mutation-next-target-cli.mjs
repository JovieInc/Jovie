#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeStates } from '../../scripts/lib/mutation-sweep.mjs';
import {
  api,
  archive,
  artifacts,
  atomic,
  base,
  command,
  directory,
  github,
  json,
  optional,
  publication,
  REPO,
  sha256,
  transport,
} from './mutation-next-api.mjs';
import {
  buildClaim,
  digest,
  finishMeasurement,
  planContinuation,
  selectRequest,
  validateRequests,
  verifyPublication,
} from './mutation-next-target.mjs';

const STATE = '.cache/jovie-mutation';
const LEDGER = 'next-target-ledger.json';
const assert = (value, reason) => {
  if (!value) throw new Error(reason);
};

export { github } from './mutation-next-api.mjs';

function requests() {
  const tracked = command([
    'git',
    'ls-files',
    '-z',
    '--',
    'packages/ui/',
  ]).split(String.fromCharCode(0));
  const result = validateRequests(json('.github/mutation-next-targets.json'), {
    tracked: new Set(tracked),
    isFile: path => lstatSync(path).isFile(),
  });
  assert(
    result.status === 'ready',
    'reason' in result ? result.reason : 'invalid request index'
  );
  return result.requests;
}
const own = () => ({
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  transportSha: process.env.GITHUB_SHA,
  testedSha: command(['git', 'rev-parse', 'HEAD']).trim(),
});
const output = (name, value) => {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const notice = reason => process.stdout.write(`Mutation handoff: ${reason}\n`);
async function history(request) {
  const claimArtifacts = await artifacts(
    `mutation-next-claim-${request.requestId}`
  );
  const claims = [],
    results = [];
  for (const artifact of claimArtifacts) {
    const zip = await archive(artifact);
    try {
      const claim = JSON.parse(zip.read('claim.json'));
      const t = await transport(claim.runId, claim.runAttempt);
      claims.push({ claim, artifact, ...t });
      // The canonical snapshot retains the result even after a later crash.
      if (t.run.status === 'completed') {
        try {
          const p = await publication({
            runId: claim.runId,
            runAttempt: claim.runAttempt,
            sha: claim.transportSha,
            cacheKey: `mutation-sweep-portable-v2-${claim.runId}-${claim.runAttempt}`,
            artifactName: `mutation-sweep-${claim.runId}`,
          });
          if (p.snapshotResult?.schema === 'jovie.mutation-next-result/v1')
            results.push({ result: p.snapshotResult, publication: p });
        } catch (error) {
          notice(`prior publication remains unknown: ${error.message}`);
        }
      }
    } finally {
      zip.close();
    }
  }
  return {
    claims: { complete: true, entries: claims },
    results: { complete: true, entries: results },
  };
}

async function select() {
  output('selected', 'false');
  output('hold', 'false');
  const pending = requests(),
    ledger = optional(join(STATE, LEDGER));
  const all = {
    claims: { complete: true, entries: [] },
    results: { complete: true, entries: [] },
  };
  for (const request of pending) {
    const h = await history(request);
    all.claims.entries.push(...h.claims.entries);
    all.results.entries.push(...h.results.entries);
  }
  const choice = selectRequest(pending, { ledger, ...all });
  if (choice.status === 'complete') {
    notice('reviewed targets already published');
    return;
  }
  assert(
    choice.status === 'ready',
    choice.reason ?? 'prior attempt remains unknown'
  );
  const evidence = await publication(choice.request.predecessor);
  const verified = verifyPublication(choice.request, evidence);
  assert(verified.status === 'ready', verified.reason);
  const state = optional(join(STATE, 'sweep-state.json'));
  const baseline = optional('.cache/jovie-mutation-baseline/sweep-state.json');
  const scoringState = baseline ? mergeStates(state ?? {}, baseline) : state;
  const claim = buildClaim(choice.request, {
    ...own(),
    ledgerDigest: digest(ledger),
    previousSequence: scoringState?.sweepSequences?.['packages/ui'] ?? 0,
  });
  assert(claim.status === 'ready', claim.reason);
  claim.claim.scoringStateDigest = digest([state, baseline]);
  atomic(join(directory(), 'claim.json'), claim.claim);
  output('selected', 'true');
  output('include', choice.request.file);
  output('max_files', '1');
  output('request_id', choice.request.requestId);
}

async function verifyClaim() {
  const claim = json(join(directory(), 'claim.json')),
    context = own();
  assert(
    claim.runId === context.runId &&
      claim.runAttempt === context.runAttempt &&
      claim.testedSha === context.testedSha &&
      claim.transportSha === context.transportSha,
    'claim transport changed'
  );
  const matches = await artifacts(`mutation-next-claim-${claim.requestId}`);
  const ownArtifacts = matches.filter(
    a => String(a.workflow_run?.id) === context.runId
  );
  assert(ownArtifacts.length === 1, 'immutable exact claim not published');
  const zip = await archive(ownArtifacts[0]);
  try {
    assert(
      digest(JSON.parse(zip.read('claim.json'))) === digest(claim),
      'immutable claim differs'
    );
  } finally {
    zip.close();
  }
  atomic(join(directory(), 'claim-verified.json'), {
    claimDigest: digest(claim),
    artifactId: String(ownArtifacts[0].id),
    ...context,
  });
  output('verified', 'true');
}

function begin() {
  const claim = json(join(directory(), 'claim.json')),
    context = own(),
    proof = json(join(directory(), 'claim-verified.json'));
  assert(
    proof.claimDigest === digest(claim) &&
      proof.runId === context.runId &&
      proof.runAttempt === context.runAttempt &&
      proof.testedSha === context.testedSha,
    'immutable claim verification changed'
  );
  const ledger = optional(join(STATE, LEDGER));
  assert(
    digest(ledger) === claim.ledgerDigest,
    'canonical request ledger changed'
  );
  assert(
    claim.scoringStateDigest ===
      digest([
        optional(join(STATE, 'sweep-state.json')),
        optional('.cache/jovie-mutation-baseline/sweep-state.json'),
      ]),
    'scoring or baseline state changed before admission'
  );
  const next = ledger ?? {
    schema: 'jovie.mutation-next-ledger/v1',
    requests: {},
  };
  next.requests[claim.requestId] = {
    requestDigest: claim.requestDigest,
    status: 'claimed',
    claim,
  };
  atomic(join(STATE, LEDGER), next);
}

function finish() {
  const claim = json(join(directory(), 'claim.json')),
    state = json(join(STATE, 'sweep-state.json'));
  const historyText = existsSync(join(STATE, 'sweep-state.json.runs.jsonl'))
    ? readFileSync(join(STATE, 'sweep-state.json.runs.jsonl'), 'utf8')
    : '';
  const result = finishMeasurement(claim, {
    state,
    history: historyText
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line)),
    runUrl: `https://github.com/${REPO}/actions/runs/${claim.runId}`,
  });
  const ledger = json(join(STATE, LEDGER));
  const measurement = result.status === 'measured' ? result.result : result;
  ledger.requests[claim.requestId] = {
    ...ledger.requests[claim.requestId],
    status:
      result.status === 'measured'
        ? 'measurement-prepared'
        : 'attempted-unknown',
    result: measurement,
  };
  atomic(join(STATE, LEDGER), ledger);
  atomic(join(STATE, 'next-target-result.json'), measurement);
}

async function inventory() {
  const entries = [];
  for (const status of ['in_progress', 'pending', 'queued']) {
    const r = await api(
      `${base}/actions/workflows/mutation-diff.yml/runs?status=${status}&branch=main&per_page=100`
    );
    assert(
      Array.isArray(r.workflow_runs) &&
        r.total_count === r.workflow_runs.length,
      'producer inventory incomplete'
    );
    entries.push(
      ...r.workflow_runs.map(v => ({ id: String(v.id), status: v.status }))
    );
  }
  return { complete: true, entries };
}

async function published() {
  const context = own(),
    predecessor = {
      ...context,
      sha: context.transportSha,
      artifactName: `mutation-sweep-${context.runId}`,
      cacheKey: `mutation-sweep-portable-v2-${context.runId}-${context.runAttempt}`,
    };
  // The current job is not terminal yet. Its successful publication steps and immutable
  // bytes gate continuation; a later target consumer separately requires terminal provenance.
  const p = await publication(predecessor);
  assert(
    p.receipt.sha === context.testedSha &&
      p.receipt.runId === context.runId &&
      p.receipt.runAttempt === context.runAttempt &&
      sha256(p.stateText) === p.receipt.stateSha256 &&
      (p.historyText === null ? null : sha256(p.historyText)) ===
        p.receipt.attemptsSha256,
    'current publication does not bind exact scoring bytes'
  );
  assert(
    p.cache.key === predecessor.cacheKey &&
      p.artifact.name === predecessor.artifactName,
    'current cache/artifact publication mismatch'
  );
  const reserved = await artifacts(`mutation-next-wake-${context.runId}`);
  const planned = planContinuation({
    ...context,
    publicationVerified: true,
    inventory: await inventory(),
    pending: process.env.NEXT_PENDING === 'true',
    rollingEligible: process.env.ROLLING_ELIGIBLE === 'true',
    outboxes: { complete: true, entries: reserved },
  });
  output('wake', 'false');
  if (planned.status !== 'ready') {
    notice(planned.reason ?? planned.status);
    return;
  }
  atomic(join(directory(), 'outbox.json'), planned.outbox);
  output('wake', 'true');
}

async function dispatch() {
  const context = own(),
    outbox = json(join(directory(), 'outbox.json'));
  const existing = await artifacts(`mutation-next-wake-${context.runId}`);
  assert(
    existing.length === 1 &&
      String(existing[0].workflow_run?.id) === context.runId,
    'missing or conflicting immutable wake reservation'
  );
  const zip = await archive(existing[0]);
  try {
    assert(
      digest(JSON.parse(zip.read('outbox.json'))) === digest(outbox),
      'wake reservation differs'
    );
  } finally {
    zip.close();
  }
  const payload = join(directory(), 'dispatch.json');
  assert(
    digest(outbox.payload) === outbox.payloadDigest,
    'wake payload differs from immutable reservation'
  );
  const live = await inventory();
  assert(
    live.entries.length === 1 &&
      live.entries[0].id === context.runId &&
      live.entries[0].status === 'in_progress',
    'producer custody changed after reservation; no dispatch'
  );
  writeFileSync(
    join(directory(), 'dispatch-attempt.json'),
    JSON.stringify({ outboxDigest: digest(outbox), ...context }),
    { flag: 'wx', mode: 0o600 }
  );
  atomic(payload, outbox.payload);
  const response = await github([
    'api',
    '--method',
    'POST',
    `${base}/actions/workflows/mutation-diff.yml/dispatches`,
    '--input',
    payload,
  ]);
  const result = JSON.parse(String(response));
  assert(
    Number.isSafeInteger(result.workflow_run_id) && result.workflow_run_id > 0,
    'wake acknowledgement unknown; immutable reservation prevents retry'
  );
  atomic(join(directory(), 'dispatch-result.json'), {
    outbox,
    childRunId: String(result.workflow_run_id),
  });
  notice(`continuation accepted as run ${result.workflow_run_id}`);
}

export async function main(mode = process.argv[2]) {
  assert(
    process.env.GITHUB_REPOSITORY === REPO &&
      process.env.GITHUB_REF === 'refs/heads/main',
    'canonical main producer only'
  );
  try {
    if (mode === 'select') await select();
    else if (mode === 'verify-claim') await verifyClaim();
    else if (mode === 'begin') begin();
    else if (mode === 'finish') finish();
    else if (mode === 'published') await published();
    else if (mode === 'dispatch') await dispatch();
    else throw new Error('unknown mutation handoff operation');
    return 0;
  } catch (error) {
    notice(error.message);
    output('hold', 'true');
    if (mode === 'select') return 0;
    return 75;
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = await main();
