import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { main } from '../../native-queue-eval.mjs';

// Exercise the production collector with an isolated GitHub command transport.
const fakeGh = `
const fs = require('node:fs');
const args = process.argv.slice(2), query = args.join(' ');
fs.appendFileSync(process.env.COLLECTOR_CALLS, JSON.stringify(args)+'\\n');
if (args[0] !== 'api' || query.includes('mutation')) throw Error('unexpected mutation');
if (process.env.COLLECTOR_CASE === 'api-error') { process.stderr.write('HTTP 502'); process.exit(1); }
const head='a'.repeat(40), repo='JovieInc/Jovie';
const check={name:'PR Ready',head_sha:head,app:{id:1},id:1,status:'completed',conclusion:'success',started_at:'2026-01-01T00:00:00Z',completed_at:'2026-01-01T00:00:01Z'};
let result;
if(query.includes('git/ref/heads/main')) result={object:{sha:head}};
else if(query.includes('rules/branches/main')) result=[{type:'required_status_checks',ruleset_id:1,parameters:{required_status_checks:[{context:'PR Ready'}]}},{type:'pull_request',ruleset_id:1,parameters:{required_approving_review_count:0}},{type:'merge_queue',ruleset_id:1,parameters:{grouping_strategy:'ALLGREEN'}}];
else if(query.includes('rulesets/1')) result={enforcement:'active',bypass_actors:[]};
else if(query.includes('branchProtectionRule')) result={data:{repository:{ref:{branchProtectionRule:null}}}};
else if(query.includes('contents/')) {
  const path=args[1].split('/contents/')[1].split('?')[0];
  const content=path.endsWith('.yml')?'on:\\n  workflow_run:\\nconcurrency:\\n  group: merge-queue-drain-mutex\\n  cancel-in-progress: false\\njobs:\\n  fleet-policy:\\n    timeout-minutes: 5\\n  enroll:\\n    steps: []\\n':'DRAIN_MAX_SECONDS="'+ '$' +'{DRAIN_MAX_SECONDS:-900}"';
  result={path,encoding:'base64',content:Buffer.from(content).toString('base64'),sha:require('node:crypto').createHash('sha1').update('blob '+Buffer.byteLength(content)+'\\0').update(content).digest('hex')};
} else if(query.includes('pullRequests(')) {
  const mode=process.env.COLLECTOR_CASE;
  result={data:{repository:{pullRequests:{nodes:[{number:123,title:'Fixture PR',state:'OPEN',isDraft:false,headRefOid:head,baseRefOid:head,baseRefName:'main',mergeable:'MERGEABLE',isInMergeQueue:false,labels:{nodes:[],pageInfo:{hasNextPage:false}},files:{nodes:[],pageInfo:{hasNextPage:false}},commits:{nodes:[{commit:{oid:mode==='wrong-head'?'b'.repeat(40):head,statusCheckRollup:mode==='no-checks'?null:{contexts:{nodes:[],pageInfo:{hasNextPage:true}}}}}]}}],pageInfo:{hasNextPage:false,endCursor:null}}}}};
} else if(query.includes('check-runs?')) result=[{check_runs:[check]}];
else if(query.includes('/statuses?')) result=[[{context:'Fork PR Gate',id:2,state:'success',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:01Z',creator:{login:'jovie-bot'}}]];
else if(query.includes('merge-queue-autoenroll.yml/runs')) result={workflow_runs:[]};
else if(query.includes('/pulls/123/files?')) result=[[{filename:'CHANGELOG.md'}]];
else if(query.includes('/pulls/123')) result={merged:true,head:{sha:head},merge_commit_sha:head};
else if(query.includes('pullRequest(number:')) result={data:{repository:{pullRequest:{timelineItems:{nodes:[],pageInfo:{hasPreviousPage:false}}}}}};
else if(query.includes('ci.yml/runs?')) result={workflow_runs:[{id:123,run_attempt:1,head_sha:head,repository:{full_name:repo},path:'.github/workflows/ci.yml',status:'completed',conclusion:'success'}]};
else if(query.includes('/jobs?')) result=[{jobs:process.env.COLLECTOR_CASE==='merged-no-job'?[]:[{id:321,run_id:123,run_attempt:1,head_sha:head,name:'PR Ready',status:'completed',conclusion:'success'},{id:322,run_id:123,run_attempt:1,head_sha:head,name:'ci-fast (remaining)',status:'completed',conclusion:'success'}]}];
else if(query.includes('/artifacts?')) result=[{artifacts:[{name:'product-lane-final-'+head+'-1',expired:process.env.COLLECTOR_CASE==='merged-expired',workflow_run:{id:123,head_sha:head}}]}];
else if(query.includes('/compare/')) result={status:'identical',base_commit:{sha:head},merge_base_commit:{sha:head}};
else throw Error('unhandled fixture request: '+query);
const mode=process.env.COLLECTOR_CASE;
if(query.includes('pullRequests(')) {
  const c=result.data.repository.pullRequests, p=c.nodes[0];
  if(mode==='truncated-files') p.files.pageInfo.hasNextPage=true;
  if(mode==='missing-cursor') c.pageInfo.hasNextPage=true;
  if(mode==='paged') { c.pageInfo={hasNextPage:!query.includes('after:'),endCursor:'next'}; if(query.includes('after:')) c.nodes=[]; }
  if(mode==='inline-checks') p.commits.nodes[0].commit.statusCheckRollup.contexts={pageInfo:{hasNextPage:false},nodes:[{name:'PR Ready',databaseId:1,status:'COMPLETED',conclusion:'SUCCESS',startedAt:'2026-01-01T00:00:00Z',completedAt:'2026-01-01T00:00:01Z',checkSuite:{app:{databaseId:1}}},{id:'status',context:'Fork PR Gate',state:'PENDING',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:01Z'}]};
}
if(mode==='validation-pending' && query.includes('ci.yml/runs?')) result.workflow_runs[0].status='in_progress';
if(mode==='merged-no-run' && query.includes('ci.yml/runs?')) result.workflow_runs=[];
if(mode==='graphql-error') result={errors:[{message:'fixture rejected query'}]};
process.stdout.write(mode==='invalid-json'?'invalid JSON':JSON.stringify(result));
`;

function collect(mode) {
  const directory = mkdtempSync(join(tmpdir(), 'queue-collector-test-'));
  try {
    const file = join(directory, 'bundle.json'),
      calls = join(directory, 'calls.jsonl');
    const downloaded = [];
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const runner = (command, args) => {
        expect(command).toBe('gh');
        if (args[0] === 'run' && args[1] === 'download') {
          if (mode === 'merged-download-error')
            throw new Error('fixture download error');
          const target = args[args.indexOf('--dir') + 1];
          downloaded.push(target);
          writeFileSync(
            join(target, 'final.json'),
            JSON.stringify({
              provenance: { sha: 'a'.repeat(40), runId: 123, runAttempt: 1 },
              selectedLanes: [],
            })
          );
          return '';
        }
        if (args[1]?.endsWith('/logs')) return 'fixture exact job log';
        let stdout = '';
        runInNewContext(fakeGh, {
          require: createRequire(import.meta.url),
          Buffer,
          process: {
            argv: ['node', 'gh', ...args],
            env: { COLLECTOR_CASE: mode, COLLECTOR_CALLS: calls },
            stdout: {
              write: text => {
                stdout += text;
              },
            },
            stderr: { write: () => {} },
            exit: code => {
              throw new Error(`fixture API error ${code}`);
            },
          },
        });
        return stdout;
      };
      main(
        [
          'collect',
          file,
          ...(mode.startsWith('validation') ? ['a'.repeat(40)] : []),
        ],
        runner
      );
      if (mode.startsWith('merged')) {
        const seed = JSON.parse(readFileSync(file, 'utf8'));
        const p = seed.snapshots[0].prs[0];
        p.isInMergeQueue = true;
        p.mergeQueueEntry = {
          id: 'entry',
          position: 1,
          enqueuedAt: seed.startedAt,
          headCommit: { oid: p.headRefOid },
          baseCommit: { oid: p.baseRefOid },
        };
        writeFileSync(file, JSON.stringify(seed));
        main(['collect', file], runner);
      }
    } finally {
      output.mockRestore();
    }
    return {
      downloaded,
      bundle: JSON.parse(readFileSync(file, 'utf8')),
      result: JSON.parse(readFileSync(`${file}.result.json`, 'utf8')),
      calls: readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('read-only native queue collector CLI', () => {
  it('collects immutable merge, exact job and artifact receipts and removes only its temporary download', () => {
    const { bundle, downloaded } = collect('merged');
    expect(bundle.snapshots.at(-1).complete).toBe(true);
    expect(bundle.merges[0].gateEvidence.readyJob.run_id).toBe(123);
    expect(bundle.merges[0].gateEvidence.laneReceipt.provenance.sha).toBe(
      'a'.repeat(40)
    );
    expect(bundle.policySources['a'.repeat(40)].readAt).toBeTruthy();
    expect(downloaded).toHaveLength(1);
    expect(downloaded.every(path => !existsSync(path))).toBe(true);
  });
  it.each([
    'merged-no-job',
    'merged-expired',
  ])('does not fabricate unavailable artifact proof for %s', mode => {
    expect(collect(mode).bundle.merges[0].gateEvidence).toBeNull();
  });
  it('binds hosted validation to the requested evaluator revision and exact job', () => {
    const { bundle } = collect('validation');
    expect(bundle.evaluatorSha).toBe('a'.repeat(40));
    expect(bundle.validation.run.id).toBe(123);
    expect(bundle.validation.job.name).toBe('ci-fast (remaining)');
    expect(bundle.validation.log).toBe('fixture exact job log');
  });
  it('records pending validation without fetching an unavailable job log', () => {
    const { bundle } = collect('validation-pending');
    expect(bundle.validation.job).toBeNull();
    expect(bundle.validation.log).toBeNull();
  });
  it('rejects invalid commands before issuing a GitHub request', () => {
    const runner = vi.fn();
    expect(() => main(['invalid'], runner)).toThrow('Usage:');
    expect(() => main(['collect', 'unused', 'invalid'], runner)).toThrow(
      'Invalid evaluator SHA'
    );
    expect(runner).not.toHaveBeenCalled();
  });
  it('paginates truncated check evidence and never certifies an incomplete lifecycle', () => {
    const { bundle, result, calls } = collect('truncated');
    expect(bundle.snapshots[0].complete).toBe(true);
    expect(bundle.snapshots[0].prs[0].checks[0].sha).toBe('a'.repeat(40));
    expect(calls.some(args => args.includes('--paginate'))).toBe(true);
    expect(result.status).toBe('BLOCKED');
    expect(result.blocked).toContain('two-distinct-native-merges-required');
    expect(
      calls.every(
        args => args[0] === 'api' && !args.join(' ').includes('mutation')
      )
    ).toBe(true);
  });
  it.each([
    'api-error',
    'wrong-head',
    'missing-cursor',
    'graphql-error',
    'invalid-json',
  ])('persists a non-green result for %s', mode => {
    const { bundle, result } = collect(mode);
    expect(bundle.snapshots[0].complete).toBe(false);
    expect(bundle.snapshots[0].errors.length).toBeGreaterThan(0);
    expect(result.status).toBe('BLOCKED');
  });
  it.each([
    'truncated-files',
    'paged',
    'inline-checks',
  ])('completes bounded pagination and normalization for %s', mode => {
    const { bundle, calls } = collect(mode),
      snapshot = bundle.snapshots[0];
    expect(snapshot.complete).toBe(true);
    if (mode === 'truncated-files')
      expect(snapshot.prs[0].files).toEqual(['CHANGELOG.md']);
    if (mode === 'inline-checks')
      expect(snapshot.prs[0].checks.map(c => c.state)).toEqual([
        'success',
        'pending',
      ]);
    if (mode === 'paged')
      expect(
        calls.filter(args => args.join(' ').includes('pullRequests('))
      ).toHaveLength(2);
  });
  it('persists artifact transport failure instead of inventing a successful merge receipt', () => {
    const { bundle } = collect('merged-download-error');
    expect(bundle.snapshots.at(-1).complete).toBe(false);
    expect(bundle.merges).toEqual([]);
  });
  it('rejects malformed saved evidence without contacting GitHub', () => {
    const dir = mkdtempSync(join(tmpdir(), 'queue-invalid-'));
    try {
      const file = join(dir, 'invalid.json');
      writeFileSync(file, 'invalid JSON');
      const runner = vi.fn();
      expect(() => main(['evaluate', file], runner)).toThrow();
      expect(runner).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('represents an authoritative empty check rollup as ineligible', () => {
    const { bundle, result } = collect('no-checks');
    expect(bundle.snapshots[0].complete).toBe(true);
    expect(bundle.snapshots[0].prs[0].checks).toEqual([]);
    expect(result.inventory[0].type).toBe('INELIGIBLE');
  });
});
