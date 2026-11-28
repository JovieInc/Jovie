import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { parseReviewResult } from './warden-result.mjs';
import {
  reviewFixtureEnv,
  structuredResult,
} from './warden-review-fixture.mjs';

const script = resolve(import.meta.dirname, 'warden-local-review.sh');
const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function configuredEnv(extraEnv = {}) {
  const cache = mkdtempSync(join(tmpdir(), 'jovie-warden-cache-'));
  temporaryDirectories.push(cache);
  return {
    WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real',
    WARDEN_TRIAGE: 'off',
    WARDEN_PUSH_REVIEW: 'on',
    XDG_CACHE_HOME: cache,
    WARDEN_OBSERVATION_DIR: join(cache, 'observations'),
    ...extraEnv,
  };
}

function makeStub(name, body) {
  const directory = mkdtempSync(join(tmpdir(), `jovie-${name}-stub-`));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return directory;
}

function fixture(
  content = 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
  path = 'app.ts'
) {
  const repo = mkdtempSync(join(tmpdir(), 'jovie-warden-input-'));
  temporaryDirectories.push(repo);
  const git = args => {
    const result = spawnSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-q']);
  writeFileSync(join(repo, path), content);
  git(['add', path]);
  const env = configuredEnv({
    WARDEN_TRIAGE: 'on',
    WARDEN_ANTHROPIC_API_KEY: '',
  });
  const invoke = (extra = {}, bin = '') =>
    spawnSync('bash', [script, 'staged'], {
      cwd: repo,
      encoding: 'utf8',
      env: reviewFixtureEnv({ ...env, ...extra }, bin),
    });
  const events = () =>
    readFileSync(
      join(env.WARDEN_OBSERVATION_DIR, 'stage-events.ndjson'),
      'utf8'
    )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
  const observation = () =>
    events()
      .filter(row => row.observation)
      .at(-1).observation;
  return { repo, git, env, invoke, events, observation };
}

describe('local review observations through the real hook', () => {
  it('runs free triage before key checks and sends skips to the canonical timing consumer', () => {
    const f = fixture('docs\n', 'notes.md');
    const result = f.invoke();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /free first pass: only docs/);
    assert.doesNotMatch(result.stderr, /no WARDEN_ANTHROPIC_API_KEY/);
    const observation = f.observation();
    assert.equal(observation.outcome, 'skipped');
    assert.equal(observation.commandAttempted, false);
    assert.equal(observation.knownCostUsd, null);
    assert.equal(observation.findingCount, null);
    assert.equal(observation.identityComplete, true);
    const snapshot = JSON.parse(
      readFileSync(
        join(f.env.WARDEN_OBSERVATION_DIR, 'stage-timings-latest.json'),
        'utf8'
      )
    );
    const stages = snapshot.entities['local-review'].stages;
    assert.equal(stages.decision['24h'].n, 1);
    assert.equal(stages.review['24h'].n, 0);
    assert.equal(stages.finished['24h'].n, 1);
    assert.ok(Object.hasOwn(stages.decision['24h'], 'p95'));
  });

  it('binds the actual index and full worktree context, policy and model config without reusing unproven output', () => {
    const f = fixture();
    f.invoke();
    const first = f.observation();
    assert.equal(first.outcome, 'unavailable');
    assert.equal(first.head, null);
    assert.match(first.stagedTree, /^[a-f0-9]{40}$/);
    f.invoke();
    assert.equal(f.observation().inputDigest, first.inputDigest);
    writeFileSync(join(f.repo, 'app.ts'), 'different staged input\n');
    f.git(['add', 'app.ts']);
    f.invoke();
    const staged = f.observation();
    assert.notEqual(staged.stagedTree, first.stagedTree);
    assert.notEqual(staged.diffDigest, first.diffDigest);
    assert.notEqual(staged.inputDigest, first.inputDigest);
    mkdirSync(join(f.repo, 'linked-context'));
    writeFileSync(
      join(f.repo, 'linked-context', 'instruction.md'),
      'context\n'
    );
    symlinkSync('linked-context', join(f.repo, 'context-link'));
    writeFileSync(join(f.repo, 'context.md'), 'new relevant context\n');
    f.invoke();
    const context = f.observation();
    assert.equal(context.identityComplete, true);
    assert.equal(context.diffDigest, staged.diffDigest);
    assert.notEqual(context.contextDigest, staged.contextDigest);
    writeFileSync(join(f.repo, 'AGENTS.md'), 'Changed review instructions\n');
    f.invoke();
    const policy = f.observation();
    assert.notEqual(policy.policyDigest, context.policyDigest);
    writeFileSync(
      join(f.repo, 'warden.toml'),
      '[defaults.agent]\nmodel = "other-model"\n'
    );
    f.invoke();
    const config = f.observation();
    assert.notEqual(config.modelConfigDigest, policy.modelConfigDigest);
    f.invoke({ WARDEN_TIMEOUT_SECONDS: '42' });
    assert.notEqual(f.observation().policyDigest, config.policyDigest);
    assert.equal(f.observation().reuseEligible, false);
    assert.match(f.observation().reuseReason, /No verified complete/);
  });

  it('records runtime/provider failures without claiming findings, and never reuses a zero exit as clean proof', () => {
    const f = fixture();
    for (const [body, expected, code] of [
      ['echo runtime-error >&2\nexit 7', 'runtime-error', 7],
      ['echo authentication_error >&2\nexit 1', 'provider-error', 1],
      ['exit 0', 'completed', 0],
    ]) {
      const bin = makeStub('warden', body);
      const result = f.invoke(
        {
          WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real',
          WARDEN_LOCAL_REVIEW: 'strict',
        },
        bin
      );
      assert.equal(result.status, code);
      const observation = f.observation();
      assert.equal(observation.outcome, expected);
      assert.equal(observation.modelActuallyAttempted, null);
      assert.equal(observation.findingCount, null);
      assert.equal(observation.reuseEligible, false);
      assert.equal(observation.resultProof, null);
      assert.doesNotMatch(result.stderr, /findings reported/);
    }
    assert.equal(f.events().filter(row => row.stage === 'review').length, 3);
  });

  it('excludes CI and survives telemetry I/O failure without weakening strict mode', () => {
    const f = fixture();
    const marker = join(f.repo, 'invoked');
    const bin = makeStub('warden', `echo invoked > "${marker}"\nexit 9`);
    const invalidDir = join(f.repo, 'file-not-directory');
    writeFileSync(invalidDir, 'not a directory');
    const env = {
      WARDEN_OBSERVATION_DIR: invalidDir,
      WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real',
    };
    assert.equal(
      f.invoke({ ...env, WARDEN_LOCAL_REVIEW: 'strict' }, bin).status,
      9
    );
    assert.equal(f.invoke(env, bin).status, 0);
    rmSync(marker, { force: true });
    assert.equal(f.invoke({ CI: 'true' }, bin).status, 0);
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(f.env.WARDEN_OBSERVATION_DIR), false);
  });

  it('records interrupted and superseded attempts distinctly', () => {
    const f = fixture();
    const interrupted = makeStub('warden', 'kill -INT $$');
    assert.equal(
      f.invoke({ WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real' }, interrupted)
        .status,
      0
    );
    assert.equal(f.observation().outcome, 'interrupted');
    const mutated = makeStub('warden', 'echo changed-context > context.txt');
    assert.equal(
      f.invoke({ WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real' }, mutated)
        .status,
      0
    );
    assert.equal(f.observation().outcome, 'superseded');
  });
});

describe('conservative exact-input structured result reuse', () => {
  it('replays original findings with the original strict exit and invalidates every bound context', () => {
    const f = fixture();
    writeFileSync(
      join(f.repo, 'warden.toml'),
      '[[skills]]\nname = "security-review"\n[[skills]]\nname = "code-review"\n'
    );
    const logDir = mkdtempSync(join(tmpdir(), 'jovie-warden-proof-'));
    temporaryDirectories.push(logDir);
    const payload = join(logDir, 'output');
    const marker = join(logDir, 'invocations');
    const output = structuredResult({
      findings: [
        {
          sourceSnippet: {
            path: 'app.ts',
            language: 'typescript',
            startLine: 1,
            endLine: 3,
            targetStartLine: 1,
            targetEndLine: 1,
            lines: [{ line: 1, content: 'fixture source', highlighted: true }],
          },
          id: 'fixture-finding',
          description: 'Fixture description',
          title: 'Fixture finding',
          location: { path: 'app.ts', startLine: 1 },
          severity: 'high',
        },
      ],
    });
    writeFileSync(payload, output);
    const bin = makeStub(
      'npm',
      `cat "${payload}"\necho invoked >> "${marker}"\nexit 1`
    );
    const env = {
      WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real',
      WARDEN_LOCAL_REVIEW: 'strict',
    };
    assert.equal(f.invoke(env, bin).status, 1);
    const first = f.observation();
    assert.equal(first.outcome, 'completed');
    assert.equal(first.reuseEligible, true);
    assert.equal(first.findingCount, 1);
    assert.equal(first.modelActuallyAttempted, null);
    assert.deepEqual(first.requestedModelsWithUsage, ['requested-model']);
    assert.equal(first.knownCostUsd, null);
    assert.equal(first.runtimeReportedCostUsd, 0.004);
    const second = f.invoke(env, bin);
    assert.equal(second.status, 1);
    assert.match(second.stdout, /reusing completed JSONL/);
    assert.ok(second.stdout.includes(output));
    assert.equal(f.observation().reusedFrom, first.id);
    assert.equal(f.observation().outcome, 'skipped');
    assert.equal(f.observation().commandAttempted, false);
    assert.equal(f.observation().knownCostUsd, null);
    assert.equal(readFileSync(marker, 'utf8').trim().split('\n').length, 1);
    writeFileSync(join(f.repo, 'context.md'), 'changed context\n');
    assert.equal(f.invoke(env, bin).status, 1);
    assert.equal(f.observation().reusedFrom, undefined);
    writeFileSync(join(f.repo, 'AGENTS.md'), 'changed policy\n');
    f.invoke(env, bin);
    assert.equal(f.observation().reusedFrom, undefined);
    writeFileSync(
      join(f.repo, 'warden.toml'),
      readFileSync(join(f.repo, 'warden.toml'), 'utf8') +
        '\n# model configuration changed\n'
    );
    f.invoke(env, bin);
    assert.equal(f.observation().reusedFrom, undefined);
    writeFileSync(join(f.repo, 'app.ts'), 'changed staged input\n');
    f.git(['add', 'app.ts']);
    f.invoke(env, bin);
    assert.equal(f.observation().reusedFrom, undefined);
    assert.equal(readFileSync(marker, 'utf8').trim().split('\n').length, 5);
  });

  it('does not reuse partial/error/unknown JSONL or terminal-only completion', () => {
    const f = fixture();
    writeFileSync(
      join(f.repo, 'warden.toml'),
      '[[skills]]\nname = "security-review"\n[[skills]]\nname = "code-review"\n'
    );
    const logDir = mkdtempSync(join(tmpdir(), 'jovie-warden-bad-proof-'));
    temporaryDirectories.push(logDir);
    const payload = join(logDir, 'output');
    const bin = makeStub('npm', `cat "${payload}"`);
    for (const output of [
      structuredResult({ failed: true }),
      structuredResult().split('\n').slice(0, 1).join('\n'),
      'terminal says clean\n',
    ]) {
      writeFileSync(payload, output);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = f.invoke(
          { WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real' },
          bin
        );
        assert.doesNotMatch(result.stdout, /reusing completed JSONL/);
        assert.equal(f.observation().reuseEligible, false);
      }
    }
  });
});

describe('effective policy and structured proof audit regressions', () => {
  it('denies reuse while ignored local skill overrides or service memory can supply context', () => {
    const f = fixture();
    writeFileSync(join(f.repo, '.gitignore'), '.warden/\n.agents/\n.claude/\n');
    writeFileSync(
      join(f.repo, 'warden.toml'),
      '[[skills]]\nname = "security-review"\n[[skills]]\nname = "code-review"\n'
    );
    const bin = makeStub('npm', `echo '${structuredResult().trim()}'`);
    const env = { WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real' };
    f.invoke(env, bin);
    const original = f.observation();
    assert.equal(original.reuseEligible, true);
    for (const directory of ['.warden', '.agents', '.claude']) {
      const override = join(f.repo, directory, 'skills', 'security-review');
      mkdirSync(override, { recursive: true });
      writeFileSync(join(override, 'SKILL.md'), 'override one');
      f.invoke(env, bin);
      assert.equal(f.observation().reusedFrom, undefined);
      assert.equal(f.observation().reuseEligible, false);
      writeFileSync(join(override, 'SKILL.md'), 'override two');
      f.invoke(env, bin);
      assert.equal(f.observation().reusedFrom, undefined);
      assert.equal(f.observation().reuseEligible, false);
      rmSync(override, { recursive: true });
      f.invoke(env, bin);
      assert.equal(f.observation().reusedFrom, original.id);
      const flatOverride = `${override}.md`;
      writeFileSync(flatOverride, 'flat override');
      f.invoke(env, bin);
      assert.equal(f.observation().reuseEligible, false);
      assert.equal(f.observation().reusedFrom, undefined);
      rmSync(flatOverride);
      f.invoke(env, bin);
      assert.equal(f.observation().reusedFrom, original.id);
    }
    const service = {
      ...env,
      WARDEN_SERVICE_URL: 'https://warden.example.test',
      WARDEN_SERVICE_TOKEN: 'fixture-token',
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      f.invoke(service, bin);
      assert.equal(f.observation().reusedFrom, undefined);
      assert.equal(f.observation().reuseEligible, false);
      assert.match(f.observation().reuseReason, /service/);
      assert.equal(f.observation().identityComplete, false);
    }
    const mutating = makeStub(
      'npm',
      `mkdir -p .warden/skills/security-review\necho changed > .warden/skills/security-review/SKILL.md\necho '${structuredResult().trim()}'`
    );
    f.invoke({ ...env, WARDEN_TIMEOUT_SECONDS: '42' }, mutating);
    assert.equal(f.observation().outcome, 'superseded');
    assert.equal(f.observation().reuseEligible, false);
  });

  it('rejects malformed findings and inconsistent severity summaries and leaves unproven accounting unknown', () => {
    const skills = ['security-review', 'code-review'];
    assert.equal(
      parseReviewResult(
        structuredResult({ findings: [{ unexpected: 'not a finding' }] }),
        skills
      ),
      null
    );
    const valid = JSON.parse(
      JSON.stringify({
        id: 'one',
        title: 'Finding',
        description: 'Description',
        severity: 'high',
      })
    );
    const rows = structuredResult({ findings: [valid] })
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    rows.at(-1).bySeverity.high = 0;
    assert.equal(
      parseReviewResult(
        rows.map(row => JSON.stringify(row)).join('\n'),
        skills
      ),
      null
    );
    for (const sourceSnippet of [
      { path: 'app.ts' },
      {
        path: 'app.ts',
        startLine: 1,
        endLine: 1,
        targetStartLine: 1,
        targetEndLine: 1,
        lines: [{ line: 0, content: 'source' }],
      },
    ]) {
      assert.equal(
        parseReviewResult(
          structuredResult({ findings: [{ ...valid, sourceSnippet }] }),
          skills
        ),
        null
      );
    }
    const costRows = structuredResult()
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    costRows.at(-1).usageBreakdown = {
      total: { usage: { inputTokens: 20, outputTokens: 4, costUSD: 999999 } },
    };
    const parsed = parseReviewResult(
      costRows.map(row => JSON.stringify(row)).join('\n'),
      skills
    );
    const arithmetic = structuredResult()
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    arithmetic.at(-1).usageBreakdown.scan.usage.costUSD = 999999;
    arithmetic.at(-1).usageBreakdown.total.usage.costUSD = 999999;
    assert.equal(
      parseReviewResult(
        arithmetic.map(row => JSON.stringify(row)).join('\n'),
        skills
      ).runtimeReportedCostUsd,
      null
    );
    assert.equal(parsed.complete, true);
    assert.equal(parsed.knownCostUsd, null);
    assert.equal(
      parsed.runtimeReportedCostUsd,
      null,
      'summary has no validated scan/auxiliary components'
    );
  });
});
