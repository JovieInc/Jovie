import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CONFIG_PATH,
  configErrors,
  hitsIn,
  scannable,
  tighten,
  violations,
} from '../../subscription-cli-guard.mjs';

const lines = text => hitsIn(text).map(hit => hit.line);

describe('subscription-cli-guard', () => {
  it('flags subscription CLI model calls in every shape', () => {
    expect(lines("const child = spawn('claude', args, {")).toEqual([1]);
    expect(lines('run: claude -p "review this" --output-format json')).toEqual([
      1,
    ]);
    expect(lines('"$CLAUDE_BIN" -p "$prompt" --max-turns 3')).toEqual([1]);
    expect(lines('claude --model opus --print "x"')).toEqual([1]);
    expect(lines('  codex exec --sandbox read-only -')).toEqual([1]);
    expect(lines('return ["claude", "-p", "--model", m]')).toEqual([1]);
    expect(lines("runCli(\n  'claude',\n  [\n    '-p',\n  ])")).toEqual([2]);
    expect(lines('run(\n  CODEX_BIN,\n  [\n    "exec",')).toEqual([2]);
    expect(lines('base = [cli(), "exec", "--json"]')).toEqual([1]);
    expect(lines('gemini -p "x"')).toEqual([1]);
    // Conservative: spawning the binary from JS is flagged whatever its args.
    expect(lines("spawnSync('claude', ['auth', 'status'])")).toEqual([1]);
  });

  it('ignores comments, model ids and other subcommands', () => {
    expect(lines('// spawns `claude -p` on the subscription')).toEqual([]);
    expect(lines('# codex exec is the lane executor')).toEqual([]);
    expect(lines("execFileSync('codexx', ['exec'])")).toEqual([]);
    expect(lines("const model = 'claude-opus-5-5';")).toEqual([]);
    expect(lines("['codex', 'login', 'status']")).toEqual([]);
  });

  it('scans automation code and workflows, skips tests and vendored skills', () => {
    expect(scannable('scripts/buyer-eval/judge.mjs')).toBe(true);
    expect(scannable('.github/workflows/ci.yml')).toBe(true);
    expect(scannable('scripts/lanes/claude_lane.py')).toBe(true);
    expect(scannable('scripts/tests/test_claude_lane.py')).toBe(false);
    expect(scannable('scripts/buyer-eval/buyer-eval.test.mjs')).toBe(false);
    expect(scannable('.agents/skills/gstack/x.ts')).toBe(false);
  });

  it('allowlists only named mesh executors, never eval or CI paths', () => {
    expect(
      configErrors({
        allowlist: {
          'scripts/buyer-eval/judge.mjs': { executor: 'x', reason: 'y' },
          '.github/workflows/a.yml': { executor: 'x', reason: 'y' },
          'scripts/lanes/codex_lane.py': { executor: 'fleet:lane-codex' },
        },
      })
    ).toEqual([
      'scripts/buyer-eval/judge.mjs: eval/CI paths cannot be allowlisted',
      '.github/workflows/a.yml: eval/CI paths cannot be allowlisted',
      'scripts/lanes/codex_lane.py: allowlist entry needs executor and reason',
    ]);
  });

  it('fails a new or grown site, passes allowlisted executors, and only shrinks', () => {
    const hit = { line: 1, text: 'x' };
    const found = { a: [hit, hit], b: [hit], lane: [hit, hit, hit] };
    const config = {
      allowlist: { lane: { executor: 'fleet:lane-codex', reason: 'r' } },
      ratchet: { a: 1 },
    };
    expect(
      violations(found, config).map(v => [v.file, v.found, v.allowed])
    ).toEqual([
      ['a', 2, 1],
      ['b', 1, 0],
    ]);
    expect(tighten({ a: [hit] }, { a: 3, gone: 1 })).toEqual({ a: 1 });
  });

  it('the committed config is valid and the buyer eval is off the subscription', () => {
    const config = JSON.parse(
      readFileSync(new URL(`../../../${CONFIG_PATH}`, import.meta.url), 'utf8')
    );
    expect(configErrors(config)).toEqual([]);
    expect(config.ratchet['scripts/buyer-eval/judge.mjs']).toBeUndefined();
    expect(config.allowlist['scripts/lanes/claude_lane.py']).toBeUndefined();
  });
});
