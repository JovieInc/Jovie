import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(resolve('scripts/codex-setup.sh'), 'utf8');

describe('codex setup failure policy', () => {
  it('keeps strict error handling for normal setup', () => {
    assert.match(source, /set -euo pipefail/);
    assert.match(
      source,
      /else\n  bash "\$REPO_ROOT\/scripts\/setup\.sh" "\$@"/
    );
  });

  it('makes only Codex hook setup best-effort', () => {
    assert.match(
      source,
      /bash "\$REPO_ROOT\/scripts\/setup\.sh" "\$@" >&2 \|\| true/
    );
  });
});
