import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateQueueScopeContract } from './queue-scope-contract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function source(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('queue scope invariant contract', () => {
  it('accepts scoped queue safety contract', () => {
    assert.deepEqual(evaluateQueueScopeContract(), []);
  });

  it('deliberate red: rejects stale lane-capacity schema', () => {
    const path = 'scripts/backlog-orchestrator/lane-capacity.mjs';
    const failures = evaluateQueueScopeContract({
      files: {
        [path]: source(path).replace(
          "export const LANE_CAPACITY_SCHEMA = 'jovie-lane-capacity/v2';",
          "export const LANE_CAPACITY_SCHEMA = 'jovie-lane-capacity/v1';"
        ),
      },
    });

    assert.match(failures.join('\n'), /jovie-lane-capacity\/v2/);
    assert.match(failures.join('\n'), /jovie-lane-capacity\/v1/);
  });

  it('deliberate red: rejects queue receipts without repository identity', () => {
    const path = 'scripts/lib/queue-deferral-receipt.mjs';
    const failures = evaluateQueueScopeContract({
      files: {
        [path]: source(path)
          .replace("errors.push('repository must be owner/name');", '')
          .replace('repository: r.repository,', ''),
      },
    });

    assert.match(failures.join('\n'), /repository must be owner\/name/);
    assert.match(failures.join('\n'), /repository: r\.repository/);
  });
});
