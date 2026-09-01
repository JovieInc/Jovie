import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateFleetAutonomy } from './fleet-autonomy.mjs';

const RED_FILES = {
  'scripts/hermes/gem-priority-gate.py':
    'def observe_main(repo):\n    raise ValueError("Main Release Ready check is missing")\n',
  'scripts/drain-pr-queue.sh':
    'select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated"))\n',
  'scripts/merge-queue-backend.mjs':
    "export const SELECTOR_BLOCKING_LABELS = new Set([\n  'needs-human',\n  'hold',\n  'gated',\n]);\n",
  '.github/workflows/pr-targets-main.yml':
    'name: Other\non:\n  pull_request:\n    branches: [main]\n',
  'scripts/backlog-orchestrator/admitter.mjs':
    'if (!queueShapeValid) { reasons.push(QUEUE_UNKNOWN); }\n',
};

describe('JOV-INV-023 fleet autonomy', () => {
  it('accepts the checked-in drain, fleet gate, and main-only PR contract', () => {
    assert.deepEqual(validateFleetAutonomy(), []);
  });

  it('deliberate red: observation-gap freeze, human enrollment holds, and stacked bases are rejected', () => {
    const errors = validateFleetAutonomy('/unused', {
      readFile: path => {
        if (!(path in RED_FILES)) throw new Error(`unexpected path ${path}`);
        return RED_FILES[path];
      },
    });
    assert.ok(errors.length >= 6, errors.join('\n'));
    assert.match(
      errors.join('\n'),
      /observe Main Release Ready from the CI workflow job/
    );
    assert.match(errors.join('\n'), /bound-green factory/);
    assert.match(errors.join('\n'), /needs-human\/hold\/gated/);
    assert.match(errors.join('\n'), /every pull_request base/);
    assert.match(errors.join('\n'), /fail closed when base is not main/);
  });
});
