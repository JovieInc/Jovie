import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPromotionBlocker,
  buildWriterProofReceipt,
  evaluateWriterPromotion,
  renderPromotionBlockerComment,
} from '../writer-owned-pr-promotion.mjs';

const scripts = fileURLToPath(new URL('../../', import.meta.url));
const head = 'a'.repeat(40);
function scenario({
  native = 'unknown',
  moved = false,
  ambiguousDraft = false,
  restart = false,
  initialState = 'OPEN',
  mergedAtRead = 0,
  ticketEvidence = 'attached',
  runs = 1,
  mergedOnUndo = false,
} = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'writer-promotion-')));
  try {
    mkdirSync(join(dir, 'lib'));
    mkdirSync(join(dir, 'bin'));
    for (const file of [
      'writer-owned-pr-promote.sh',
      'lib/gh-retry.sh',
      'lib/writer-owned-pr-promotion.mjs',
    ])
      copyFileSync(join(scripts, file), join(dir, file));
    writeFileSync(
      join(dir, 'lib/upsert-pr-comment.sh'),
      '#!/bin/sh\nprintf "%s" "$3" > "$FIXTURE/comment"\n'
    );
    writeFileSync(
      join(dir, 'native-merge-intent.mjs'),
      String.raw`import {appendFileSync} from 'node:fs'; appendFileSync(process.env.FIXTURE+'/calls', '\nnative-intent'); console.log(JSON.stringify({status:${JSON.stringify(native)},reason:'test-outcome'})); process.exitCode=${native === 'unknown' || native === 'blocked' ? 1 : 0};`
    );
    writeFileSync(
      join(dir, 'state'),
      JSON.stringify({
        id: 'PR_42',
        number: 42,
        state: initialState,
        head,
        draft: !restart,
        body: '',
        labels: [],
        queued: false,
        autoMerge: false,
      })
    );
    writeFileSync(
      join(dir, 'bin/gh'),
      String.raw`#!/usr/bin/env node
import fs from 'node:fs';
const dir=process.env.FIXTURE,args=process.argv.slice(2),path=dir+'/state';
fs.appendFileSync(dir+'/calls',JSON.stringify(args)+'\n');
let state=JSON.parse(fs.readFileSync(path));
if(args[0]==='api' && args[1]==='user'){console.log('writer');process.exit(0);}
if(args[0]==='api' && args[1]==='graphql'){
 let count=Number(fs.existsSync(dir+'/reads')?fs.readFileSync(dir+'/reads','utf8'):0)+1;
 fs.writeFileSync(dir+'/reads',String(count));
 if(${moved} && count>=2) state.head='b'.repeat(40);
 if(${mergedAtRead}>0 && count>=${mergedAtRead}) state.state='MERGED';
 if(${JSON.stringify(native)}==='intent-recorded' && count>=2)state.autoMerge=true;
 fs.writeFileSync(path,JSON.stringify(state));fs.writeSync(1,JSON.stringify(state));process.exit(0);
}
if(args[0]==='pr'&&args[1]==='edit')state.body=args[args.indexOf('--body')+1];
if(args[0]==='pr'&&args[1]==='ready'){
 if(${mergedOnUndo}&&args.includes('--undo')){state.state='MERGED';fs.writeFileSync(path,JSON.stringify(state));console.error('PR already merged');process.exit(1);}
 state.draft=args.includes('--undo');fs.writeFileSync(path,JSON.stringify(state));
 if(${ambiguousDraft}&&args.includes('--undo')){console.error('HTTP 502');process.exit(1);}
}
fs.writeFileSync(path,JSON.stringify(state));
`,
      { mode: 0o700 }
    );
    // .js-free executable is treated as ESM by explicit package type.
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    let result;
    for (let run = 0; run < runs; run++)
      result = spawnSync(
        'bash',
        [
          join(dir, 'writer-owned-pr-promote.sh'),
          '--pr',
          '42',
          '--issue',
          'JOV-1',
          '--head',
          head,
          '--writer',
          'writer',
          '--required-tests',
          'passed',
          '--review-sweep',
          'complete',
          '--ticket-evidence',
          ticketEvidence,
          '--pr-evidence',
          'attached',
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            FIXTURE: dir,
            PATH: `${join(dir, 'bin')}:${dirname(process.execPath)}:${process.env.PATH}`,
            GH_RETRY_BASE_DELAY: '0',
          },
        }
      );
    assert.equal(result.error, undefined, result.stderr);
    assert.ok(result.stderr.indexOf('SyntaxError') < 0, result.stderr);
    const calls = readFileSync(join(dir, 'calls'), 'utf8');
    const comment = existsSync(join(dir, 'comment'))
      ? readFileSync(join(dir, 'comment'), 'utf8')
      : '';
    return { ...result, calls, comment };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('ambiguous native request never compensates or retries, including ready restart', () => {
  for (const restart of [false, true]) {
    const r = scenario({ restart });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.calls.split('native-intent').length - 1, 1);
    assert.doesNotMatch(r.calls, /--undo|--disable-auto|dequeuePullRequest/);
    assert.match(r.comment, /native-intent-unknown/);
    assert.match(r.comment, /"attempted": false/);
  }
});

test('definite blocked request compensates once only on same head', () => {
  const r = scenario({ native: 'blocked' });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.calls.split('--undo').length - 1, 1);
  assert.match(r.comment, /"verified": true/);
});

test('head movement before compensation prevents all risky effects', () => {
  const r = scenario({ native: 'blocked', moved: true });
  assert.equal(r.status, 2, r.stderr);
  assert.doesNotMatch(r.calls, /--undo|--disable-auto|dequeuePullRequest/);
  assert.match(r.comment, /"verified": false/);
});

test('uncertain draft response is never retried', () => {
  const r = scenario({ native: 'blocked', ambiguousDraft: true });
  assert.equal(r.calls.split('--undo').length - 1, 1);
  assert.match(r.comment, /"verified": false/);
});

test('confirmed native intent and writer receipt complete together', () => {
  const r = scenario({ native: 'intent-recorded' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /writer promotion complete/);
  assert.doesNotMatch(r.calls, /--undo|--disable-auto|dequeuePullRequest/);
});

test('already merged with missing ticket evidence remains an owned acceptance failure on replay', () => {
  const r = scenario({
    initialState: 'MERGED',
    ticketEvidence: 'missing: runtime pickup',
    runs: 2,
  });
  assert.equal(r.status, 2, r.stderr);
  assert.doesNotMatch(
    r.calls,
    /native-intent|--undo|--disable-auto|dequeuePullRequest|"edit"/
  );
  assert.match(
    r.stderr,
    /source merged; acceptance blocked: gate-ticket-evidence; owner=writer/
  );
  assert.match(r.comment, /"status": "merged-acceptance-blocked"/);
  assert.match(r.comment, /"attempted": false/);
  assert.equal(JSON.parse(r.stdout).acceptance.owner, 'writer');
});

test('merge before compensation preserves failure without attempting a draft conversion', () => {
  const r = scenario({ native: 'blocked', mergedAtRead: 2 });
  assert.equal(r.status, 2, r.stderr);
  assert.doesNotMatch(r.calls, /--undo|--disable-auto|dequeuePullRequest/);
  assert.match(r.comment, /"sourceDisposition": "merged"/);
  assert.match(r.comment, /"attempted": false/);
  assert.match(r.comment, /"verified": false/);
  assert.match(r.comment, /test-outcome/);
});

test('closed unmerged PR with missing proof never attempts compensation', () => {
  const r = scenario({ initialState: 'CLOSED', ticketEvidence: 'missing' });
  assert.equal(r.status, 2, r.stderr);
  assert.doesNotMatch(
    r.calls,
    /native-intent|--undo|--disable-auto|dequeuePullRequest|"edit"/
  );
  assert.match(r.comment, /"sourceDisposition": "closed"/);
  assert.doesNotMatch(r.comment, /Source merged/);
});

test('terminal exact-head observation does not certify proof or another head', () => {
  const receipt = buildWriterProofReceipt({
    issueId: 'JOV-1',
    prNumber: 42,
    headSha: head,
    writerLogin: 'writer',
    requiredTests: 'passed',
    reviewSweep: 'complete',
    ticketEvidence: 'missing',
    prEvidence: 'attached',
  });
  const input = {
    receipt,
    expectedHeadSha: head,
    writerLogin: 'writer',
    prNumber: 42,
    state: { state: 'MERGED', head },
  };
  const result = evaluateWriterPromotion(input);
  assert.equal(result.ok, false);
  assert.equal(result.action, 'merged-proof-blocked');
  assert.equal(result.proofReason, 'gate-ticket-evidence');
  assert.equal(
    evaluateWriterPromotion({
      ...input,
      state: { state: 'MERGED', head: 'b'.repeat(40) },
    }).action,
    'block'
  );
  assert.equal(
    evaluateWriterPromotion({ ...input, state: { state: 'CLOSED', head } })
      .action,
    'block'
  );
});

test('merged different head never renders an exact-head recovery receipt', () => {
  const blocker = buildPromotionBlocker({
    headSha: head,
    writerLogin: 'writer',
    reason: 'head-mismatch',
    compensation: { state: { state: 'MERGED', head: 'b'.repeat(40) } },
  });
  assert.equal(blocker.status, 'terminal-blocker');
  assert.equal(blocker.sourceDisposition, 'merged-other-head');
  assert.doesNotMatch(
    renderPromotionBlockerComment(blocker),
    /Source merged at the exact head/
  );
  const r = scenario({ native: 'blocked', mergedAtRead: 2, moved: true });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.calls, /--undo|--disable-auto|dequeuePullRequest/);
  assert.doesNotMatch(r.comment, /Source merged at the exact head/);
  assert.doesNotMatch(r.stderr, /source merged; acceptance blocked/);
  assert.match(r.comment, /"attempted": false/);
});

test('merge after compensation read but before draft mutation is reread without replay', () => {
  const r = scenario({ native: 'blocked', mergedOnUndo: true });
  assert.equal(r.status, 2);
  assert.equal(r.calls.split('--undo').length - 1, 1);
  assert.match(r.comment, /"sourceDisposition": "merged"/);
  assert.match(r.comment, /"attempted": true/);
  assert.match(r.comment, /"verified": false/);
});
