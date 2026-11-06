import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../..', import.meta.url);

const STUBS = [
  'docs/AGENT_OS_ARCHITECTURE.md',
  'docs/HERMES_AIR.md',
  'docs/MEMORY_ADR.md',
  'docs/MEMORY_CORE_ARCHITECTURE.md',
  'docs/AUTOMATION_AUDIT.md',
  'docs/spikes/eve-agent-sdk-fit.md',
  'docs/operations/SUMMER_RUNTIME_RETIREMENT.md',
  '.claude/rules/hermes-air.md',
];

const FORBIDDEN = [
  'launchctl bootstrap',
  'bootstrap-air.sh',
  '~/.hermes/config.yaml',
  'Why WDK stays',
  'Accepted for v1',
  'free-model-router.ts',
  'gemma3:4b',
  'Historical documents are retained',
];

test('retired AgentOS and Hermes notes stay pointers', () => {
  for (const relativePath of STUBS) {
    const text = readFileSync(new URL(relativePath, ROOT), 'utf8');
    assert.ok(
      text.length < 2500,
      `${relativePath} is ${text.length} chars; the runbook grew back`
    );
    for (const phrase of FORBIDDEN) {
      assert.equal(
        text.includes(phrase),
        false,
        `${relativePath} contains retired procedure: ${phrase}`
      );
    }
  }
});
