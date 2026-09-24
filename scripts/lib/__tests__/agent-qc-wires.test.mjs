import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PINNED_JOB_CONTEXTS } from '../merge-queue-guard.mjs';
import {
  ADVISORY_CHECK_NAMES,
  REQUIRED_CHECK_NAMES,
} from '../pr-check-failures.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function readRepo(relativePath) {
  return readFileSync(`${repoRoot}/${relativePath}`, 'utf8');
}

function extractLivePrPredicates(source) {
  return [
    ...source.matchAll(
      /jq -e --arg expected_head "\$PR_HEAD_SHA" '([\s\S]*?)'\s*<<<"\$CURRENT_STATE"/g
    ),
  ].map(match => match[1]);
}

describe('agent QC wire honesty (JOV-5235)', () => {
  const pipeline = readRepo('.github/workflows/agent-pipeline.yml');
  const landing = readRepo('.github/workflows/agent-landing-sweep.yml');
  const slop = readRepo('.github/workflows/slop-gate.yml');
  const autoPr = readRepo('.github/workflows/auto-pr-on-push.yml');
  const architecture = readRepo('docs/AGENT_OS_ARCHITECTURE.md');

  it('retires the Scope Judge producer and stops advertising a passed gate', () => {
    expect(pipeline).not.toMatch(
      /workflows:\s*\[["']CI["'],\s*["']Scope Judge["']\]/
    );
    expect(pipeline).not.toContain('CI + Scope Judge both pass');
    expect(pipeline).not.toContain('context == "scope-judge"');
    expect(pipeline).not.toContain('[x] Scope judge');
    expect(landing).not.toContain('scope-judge-passed');
    expect(landing).not.toContain('Scope judge = success');
    expect(landing).not.toContain('context == "scope-judge"');
    expect(autoPr).not.toContain('scope judge');
    expect(architecture).toMatch(
      /github\.scope-judge.*retired|retired.*github\.scope-judge/i
    );
  });

  it('keeps Slop Gate post-merge informational and off PR Ready', () => {
    expect(slop).toMatch(/^\s*schedule:/m);
    expect(slop).toMatch(/^\s*workflow_dispatch:/m);
    expect(slop).not.toMatch(/^\s*pull_request(_target)?:/m);
    expect(slop).not.toMatch(/^\s*merge_group:/m);
    expect(slop).toMatch(/post-merge informational/i);
    expect(slop).not.toMatch(/flip to blocking/i);
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'Slop Gate (advisory)'
    );
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'Slop Gate'
    );
    expect(ADVISORY_CHECK_NAMES).toContain('Slop Gate (advisory)');
    expect(FORBIDDEN_PINNED_JOB_CONTEXTS).toEqual(
      expect.arrayContaining(['Slop Gate (advisory)', 'Slop Gate'])
    );
  });

  it('does not consume self-attested GStack comments for auto-approve', () => {
    expect(pipeline).not.toContain('check-agent-gate-evidence.ts');
    expect(pipeline).not.toContain('issues/$PR_NUMBER/comments');
    expect(pipeline).not.toContain('id: gstack-gates');
  });

  it('routes retry exhaustion to automation without creating a human hold', () => {
    expect(pipeline).not.toContain('scripts/lib/needs-human-autoclose.mjs');
    expect(pipeline).not.toMatch(/--add-label(?:=|\s+)["']?needs-human/);
    expect(pipeline).toContain('SLACK_WEBHOOK_URL');
    expect(pipeline).toContain('LINEAR_API_KEY');
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'needs-human'
    );
    expect(FORBIDDEN_PINNED_JOB_CONTEXTS).not.toContain('needs-human');
  });

  it('leaves required reviews to GitHub without a bot self-approval prerequisite', () => {
    const finish = pipeline.match(
      /      - name: Request native GitHub Merge when ready[\s\S]*?(?=\n      - name:)/
    )?.[0];
    expect(finish).toBeDefined();
    expect(finish).toContain(
      "steps.check-statuses.outputs.all_passed == 'true'"
    );
    expect(finish).toContain("steps.sensitive-check.outputs.is_safe == 'true'");
    expect(pipeline).not.toContain('id: auto-approve');
    expect(pipeline).not.toContain('steps.auto-approve.outputs');
    expect(pipeline).not.toContain('-f event="APPROVE"');
  });

  it('requests native auto-merge only for the current ungated exact head', () => {
    const head = 'a'.repeat(40);
    const match = pipeline.match(
      /      - name: Request native GitHub Merge when ready[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      - name:)/
    );
    expect(match).not.toBeNull();
    const script = match[1]
      .split('\n')
      .map(line => (line.startsWith('          ') ? line.slice(10) : line))
      .join('\n');
    const livePredicates = extractLivePrPredicates(pipeline);
    expect(livePredicates).toHaveLength(1);
    expect(pipeline).toContain('ref: main');
    expect(pipeline).toContain('persist-credentials: false');
    expect(pipeline).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(pipeline).not.toContain('steps.queue-pressure.outputs');
    expect(pipeline).not.toContain('labels[]=auto-approved');
    expect(pipeline).not.toContain('queue-deferred');

    const hasCurrentOpenHead = (predicate, state) =>
      spawnSync('jq', ['-e', '--arg', 'expected_head', head, predicate], {
        encoding: 'utf8',
        input: JSON.stringify(state),
      }).status === 0;
    for (const predicate of livePredicates) {
      const currentState = {
        state: 'OPEN',
        isDraft: false,
        headRefOid: head,
        labels: [],
      };
      expect(hasCurrentOpenHead(predicate, currentState)).toBe(true);
      for (const label of [
        'queue-deferred',
        'needs-conflict-resolution',
        'fast',
      ]) {
        expect(
          hasCurrentOpenHead(predicate, {
            ...currentState,
            labels: [{ name: label }],
          })
        ).toBe(true);
      }
      for (const label of ['hold', 'gated', 'incident']) {
        expect(
          hasCurrentOpenHead(predicate, {
            ...currentState,
            labels: [{ name: label }],
          })
        ).toBe(false);
      }
      expect(
        hasCurrentOpenHead(predicate, {
          ...currentState,
          headRefOid: 'b'.repeat(40),
        })
      ).toBe(false);
      expect(
        hasCurrentOpenHead(predicate, { ...currentState, isDraft: true })
      ).toBe(false);
    }

    const directory = mkdtempSync(join(tmpdir(), 'native-agent-finish-'));
    const log = join(directory, 'mutations');
    const gh = join(directory, 'gh');
    writeFileSync(
      gh,
      `#!/usr/bin/env bash
if [[ "$1 $2" == 'pr view' ]]; then
  printf '%s\\n' "$MOCK_STATE"
elif [[ "$1 $2" == 'pr merge' ]]; then
  printf '%s\\n' "$*" >> "$MOCK_LOG"
  exit "${'${MOCK_MERGE_EXIT:-0}'}"
else
  exit 91
fi
`
    );
    chmodSync(gh, 0o755);
    try {
      const run = (state, expectedHead = head, mergeExit = '0') => {
        writeFileSync(log, '');
        const result = spawnSync('bash', ['-c', script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            GH_TOKEN: 'synthetic-token',
            GH_REPO: 'JovieInc/Jovie',
            PR_NUMBER: '42',
            PR_HEAD_SHA: expectedHead,
            MOCK_STATE: JSON.stringify(state),
            MOCK_LOG: log,
            MOCK_MERGE_EXIT: mergeExit,
          },
        });
        return { status: result.status, mutations: readFileSync(log, 'utf8') };
      };
      const state = {
        state: 'OPEN',
        isDraft: false,
        headRefOid: head,
        labels: [],
      };
      expect(run(state)).toEqual({
        status: 0,
        mutations: `pr merge 42 -R JovieInc/Jovie --auto --match-head-commit ${head}\n`,
      });
      for (const label of [
        'queue-deferred',
        'needs-conflict-resolution',
        'fast',
      ]) {
        expect(run({ ...state, labels: [{ name: label }] })).toEqual({
          status: 0,
          mutations: `pr merge 42 -R JovieInc/Jovie --auto --match-head-commit ${head}\n`,
        });
      }
      for (const blocked of [
        { ...state, headRefOid: 'b'.repeat(40) },
        { ...state, isDraft: true },
        { ...state, labels: [{ name: 'hold' }] },
        { ...state, labels: [{ name: 'gated' }] },
        { ...state, labels: [{ name: 'incident' }] },
      ]) {
        expect(run(blocked)).toEqual({ status: 1, mutations: '' });
      }
      expect(run(state, head, '42').status).toBe(42);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('classifies agent-pipeline branches with the shared allowlist', () => {
    expect(pipeline).toContain('scripts/lib/agent-branch-pattern.mjs --match');
    expect(pipeline).not.toMatch(
      /\$BRANCH" =~ \^\(main\|dependabot\/\|gh-readonly-queue\/\|renovate\/\)/
    );
    expect(pipeline).not.toContain(
      'test("^(main|dependabot/|gh-readonly-queue/|renovate/)")'
    );
  });
});
