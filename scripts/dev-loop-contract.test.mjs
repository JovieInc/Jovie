// Contracts for the local (pre-CI) dev loop: git hooks and Claude Code hooks.
// Each assertion is a regression that silently shipped once (2026-09-25 sweep).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');

function trackedModes(pathspec) {
  return new Map(
    execFileSync('git', ['ls-files', '-s', '--', pathspec], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [mode, , , path] = line.split(/\s+/);
        return [path, mode];
      })
  );
}

function claudeHookCommands() {
  const settings = JSON.parse(
    readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8')
  );
  return Object.values(settings.hooks ?? {})
    .flat()
    .flatMap(matcher => matcher.hooks ?? [])
    .map(hook => hook.command);
}

function hookScriptPath(command) {
  const match = command.match(/\.claude\/hooks\/[\w.-]+/);
  return match?.[0];
}

test('every git hook is tracked executable (git skips 100644 hooks silently)', () => {
  const modes = trackedModes('.husky');
  const hooks = [...modes].filter(([path]) => !path.startsWith('.husky/_/'));
  assert.ok(hooks.length > 0);
  for (const [path, mode] of hooks) {
    assert.equal(mode, '100755', `${path} must be executable`);
  }
});

test('every Claude hook command points at a tracked script', () => {
  const modes = trackedModes('.claude/hooks');
  for (const command of claudeHookCommands()) {
    const script = hookScriptPath(command);
    assert.ok(script, `unrecognized hook command: ${command}`);
    assert.ok(existsSync(resolve(ROOT, script)), `${script} is missing`);
    assert.ok(modes.has(script), `${script} is not tracked`);
    if (!/^\s*bash\s/.test(command)) {
      assert.equal(modes.get(script), '100755', `${script} is run directly`);
    }
  }
});

// Claude Code passes hook input as JSON on stdin; $TOOL_INPUT is never set,
// so hooks that read it are silent no-ops. Ratchet: fix one → delete its
// entry; new offenders fail. Tracked in JOV-6613.
const TOOL_INPUT_ENV_READERS = new Set([
  '.claude/hooks/bash-safety-check.sh',
  '.claude/hooks/console-check.sh',
  '.claude/hooks/db-patterns-check.sh',
  '.claude/hooks/file-protection-check.sh',
  '.claude/hooks/file-size-check.sh',
  '.claude/hooks/infra-guardrails-check.sh',
  '.claude/hooks/lint-check.sh',
  '.claude/hooks/orchestrator-boundary-check.sh',
  '.claude/hooks/ts-strict-check.sh',
  '.claude/hooks/typecheck.sh',
]);

test('no new Claude hook reads the unset $TOOL_INPUT env var (JOV-6613 ratchet)', () => {
  const scripts = new Set(
    claudeHookCommands().map(hookScriptPath).filter(Boolean)
  );
  for (const script of scripts) {
    const readsEnv = /\$\{?TOOL_INPUT/.test(
      readFileSync(resolve(ROOT, script), 'utf8')
    );
    if (TOOL_INPUT_ENV_READERS.has(script)) {
      assert.ok(readsEnv, `${script} is fixed; remove it from the ratchet`);
    } else {
      assert.ok(!readsEnv, `${script} must read hook input from stdin`);
    }
  }
});
