/**
 * Golden pin for the merge-queue jump policy. The policy lives as inline
 * github-script in .github/workflows/merge-queue-green-enroll.yml; this gate
 * pins its constants, its two function bodies (sha256 over comment-stripped,
 * whitespace-collapsed text) and label parity across every consumer, so a
 * policy change needs a visible pin edit. Comment-only and format-only edits
 * never trip; token edits do. Renames trip on purpose: that is friction, not
 * flake. Residual (stated): the pin does not cover the enroll-jump caller
 * block or the relabel-jump block — scripts/merge-queue-green-enroll.test.mjs
 * covers those behaviorally.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const { load } = createRequire(import.meta.url)('js-yaml');

const pin = JSON.parse(read('scripts/invariants/jump-policy-pin.json'));
const script = load(
  read('.github/workflows/merge-queue-green-enroll.yml')
).jobs.enroll.steps.find(step => step.with?.script).with.script;

// Strip block and line comments, then remove ALL whitespace. Comment-only
// and format-only edits (indent churn, line rewraps, spacing) never trip;
// any token change does.
const normalize = source =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '');

const sha256 = text => createHash('sha256').update(text).digest('hex');

const sliceStatement = anchor => {
  const start = script.indexOf(anchor);
  assert.notEqual(
    start,
    -1,
    `anchor not found in the enroll script: ${anchor}`
  );
  const end = script.indexOf(';', start);
  assert.notEqual(end, -1, `statement never terminates: ${anchor}`);
  return script.slice(start, end + 1);
};

const sliceBracedBlock = anchor => {
  const start = script.indexOf(anchor);
  assert.notEqual(
    start,
    -1,
    `anchor not found in the enroll script: ${anchor}`
  );
  const open = script.indexOf('{', start);
  assert.notEqual(open, -1, `block never opens: ${anchor}`);
  let depth = 0;
  for (let i = open; i < script.length; i++) {
    if (script[i] === '{') depth++;
    else if (script[i] === '}') {
      depth--;
      if (depth === 0) {
        assert.equal(
          script.slice(i, i + 2),
          '};',
          `block does not end with '};': ${anchor}`
        );
        return script.slice(start, i + 2);
      }
    }
  }
  assert.fail(`block never closes: ${anchor}`);
};

// Character-class-aware regex-literal parser: a bare '/' inside [...] does
// not terminate the literal, so COMPOUNDING_PATHS entries parse exactly.
const parseRegexLiteral = line => {
  const start = line.indexOf('/');
  if (start === -1) return null;
  let i = start + 1;
  let source = '';
  let inClass = false;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') {
      source += ch + (line[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (inClass) {
      source += ch;
      if (ch === ']') inClass = false;
      i++;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      source += ch;
      i++;
      continue;
    }
    if (ch === '/') {
      let j = i + 1;
      let flags = '';
      while (j < line.length && /[a-z]/.test(line[j])) {
        flags += line[j];
        j++;
      }
      return { source, flags, rest: line.slice(j).trim() };
    }
    if (ch === '\n') return null;
    source += ch;
    i++;
  }
  return null;
};

describe('jump-policy pin', () => {
  test('the pin carries the shipped schema and keys', () => {
    assert.equal(pin.schema, 'jovie-jump-policy-pin/v1');
    assert.deepEqual(Object.keys(pin).sort(), [
      'COMPOUNDING_LABEL',
      'COMPOUNDING_PATHS',
      'JUMP_BATCH_S',
      'JUMP_MAX_BUILD_S',
      'MARKETING_LABEL',
      'MAX_JUMPED',
      'isPriorityLabelSha256',
      'jumpPolicySha256',
      'jumpTrueSites',
      'schema',
    ]);
  });

  test('the enroll script constants line matches the pin exactly', () => {
    const match = script.match(
      /^const COMPOUNDING_LABEL = '([^']+)', MARKETING_LABEL = '([^']+)', MAX_JUMPED = (\d+), JUMP_MAX_BUILD_S = (\d+), JUMP_BATCH_S = (\d+);$/mu
    );
    assert.ok(match, 'the jump-policy constants line is missing or reshaped');
    assert.equal(match[1], pin.COMPOUNDING_LABEL);
    assert.equal(match[2], pin.MARKETING_LABEL);
    assert.equal(Number(match[3]), pin.MAX_JUMPED);
    assert.equal(Number(match[4]), pin.JUMP_MAX_BUILD_S);
    assert.equal(Number(match[5]), pin.JUMP_BATCH_S);
  });

  test('COMPOUNDING_PATHS matches the pin element by element', () => {
    const block = script.match(/^const COMPOUNDING_PATHS = \[$[\s\S]*?^\];$/mu);
    assert.ok(block, 'the COMPOUNDING_PATHS block is missing or reshaped');
    const literals = block[0]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('/') && line !== '];')
      .map(line => {
        const parsed = parseRegexLiteral(line);
        assert.ok(parsed, `unparseable COMPOUNDING_PATHS entry: ${line}`);
        assert.equal(
          parsed.rest,
          ',',
          `unexpected trailing content in COMPOUNDING_PATHS entry: ${line}`
        );
        return { source: parsed.source, flags: parsed.flags };
      });
    assert.deepEqual(literals, pin.COMPOUNDING_PATHS);
  });

  test('the pinned function bodies hash to the pin', () => {
    assert.equal(
      sha256(normalize(sliceStatement('const isPriorityLabel ='))),
      pin.isPriorityLabelSha256
    );
    assert.equal(
      sha256(normalize(sliceBracedBlock('const jumpPolicy = entries => {'))),
      pin.jumpPolicySha256
    );
  });

  test('the enroll script has exactly the pinned number of jump sites', () => {
    assert.equal(
      [...script.matchAll(/', jump: true'/gu)].length,
      pin.jumpTrueSites
    );
  });

  test('label parity: every consumer carries the pinned label strings', () => {
    assert.ok(
      read('scripts/lib/main-red-eject.mjs').includes(
        `const COMPOUNDING_LABEL = '${pin.COMPOUNDING_LABEL}';`
      ),
      'main-red-eject.mjs no longer names the pinned COMPOUNDING_LABEL'
    );
    assert.ok(
      read('scripts/lib/wins-ledger.mjs').includes(
        `includes('${pin.COMPOUNDING_LABEL}')`
      ),
      'wins-ledger.mjs no longer matches the pinned compounding label'
    );
    assert.ok(
      read('scripts/lanes/bindings.py').includes(
        `DEFERRED_ENQUEUE_LABELS = frozenset({"${pin.COMPOUNDING_LABEL}"})`
      ),
      'bindings.py DEFERRED_ENQUEUE_LABELS no longer matches the pin'
    );
    assert.ok(
      read('scripts/lanes/priority_admission.py').includes(
        `MARKETING_LABEL = "${pin.MARKETING_LABEL}"`
      ),
      'priority_admission.py no longer names the pinned MARKETING_LABEL'
    );
  });

  test('MERGE_QUEUE.md still names the jump caps', () => {
    const doc = read('.github/MERGE_QUEUE.md');
    for (const name of ['MAX_JUMPED', 'JUMP_MAX_BUILD_S', 'JUMP_BATCH_S']) {
      assert.ok(doc.includes(name), `MERGE_QUEUE.md no longer names ${name}`);
    }
  });
});
