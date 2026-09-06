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

const scripts = fileURLToPath(new URL('../../', import.meta.url));
const head = 'a'.repeat(40);
function scenario({
  native = 'unknown',
  moved = false,
  ambiguousDraft = false,
  restart = false,
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
        state: 'OPEN',
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
 if(${JSON.stringify(native)}==='intent-recorded' && count>=2)state.autoMerge=true;
 fs.writeFileSync(path,JSON.stringify(state));fs.writeSync(1,JSON.stringify(state));process.exit(0);
}
if(args[0]==='pr'&&args[1]==='edit')state.body=args[args.indexOf('--body')+1];
if(args[0]==='pr'&&args[1]==='ready'){
 state.draft=args.includes('--undo');fs.writeFileSync(path,JSON.stringify(state));
 if(${ambiguousDraft}&&args.includes('--undo')){console.error('HTTP 502');process.exit(1);}
}
fs.writeFileSync(path,JSON.stringify(state));
`,
      { mode: 0o700 }
    );
    // .js-free executable is treated as ESM by explicit package type.
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const result = spawnSync(
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
        'attached',
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
    assert.ok(existsSync(join(dir, 'comment')), result.stderr + result.stdout);
    const comment = readFileSync(join(dir, 'comment'), 'utf8');
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
