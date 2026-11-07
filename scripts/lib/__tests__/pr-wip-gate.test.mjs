import assert from 'node:assert/strict';
import test from 'node:test';
import { wipAdmission, wipGate } from '../pr-wip-gate.mjs';

const python =
  (status, stdout, stderr = '') =>
  () => ({
    status,
    stdout,
    stderr,
  });
const over = python(
  3,
  '{"allowed":false,"producer":"hyperagent","used":36,"cap":5}'
);

test('wipAdmission refuses only on exit 3 with a decision, and fails open otherwise', () => {
  const refused = wipAdmission('hyperagent/x', over, '.');
  assert.equal(refused.allowed, false);
  assert.match(refused.message, /wip-cap: `hyperagent\/` already owns 36/);
  const unknown = wipAdmission('codex/x', python(1, '', 'gh down'), '.');
  assert.equal(unknown.allowed, true);
  assert.match(unknown.message, /admitting/);
  const within = wipAdmission(
    'codex/x',
    python(0, '{"allowed":true,"producer":"codex","used":2,"cap":8}'),
    '.'
  );
  assert.deepEqual(within, { allowed: true, message: null });
});

test('wipGate refuses over the cap, and a recorded override labels instead', () => {
  const rows = [];
  const out = [];
  const env = execute => ({
    execute,
    log: x => out.push(x),
    record: row => rows.push(row),
  });
  const refused = wipGate({ repo: '.' }, 'hyperagent/x', env(over));
  assert.deepEqual(refused, { refused: true, override: false });
  assert.match(out.join('\n'), /FAIL {2}wip-cap/);
  const short = wipGate(
    { repo: '.', wipOverride: 'too short' },
    'hyperagent/x',
    env(over)
  );
  assert.equal(short.refused, true, 'a reasonless override does not count');
  const reason = 'this PR installs the cap itself';
  const overridden = wipGate(
    { repo: '.', wipOverride: reason },
    'hyperagent/x',
    env(over)
  );
  assert.deepEqual(overridden, { refused: false, override: true });
  assert.equal(rows.at(-1).override, reason);
  const admitted = wipGate(
    { repo: '.' },
    'codex/x',
    env(python(0, '{"allowed":true,"producer":"codex","used":1,"cap":8}'))
  );
  assert.deepEqual(admitted, { refused: false, override: false });
});
