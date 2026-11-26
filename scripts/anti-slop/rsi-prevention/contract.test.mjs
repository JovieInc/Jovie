/**
 * RSI AI-slop prevention contract (ASR-042..046).
 *
 * For each versioned rule: one deliberate-red fixture must trigger, one
 * legitimate counterexample must pass. No model-only merge gate — this is a
 * cheap node:test suite that anti-slop validate proves exists via evidence.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decideOutcomeResidual } from '../../lib/outcome-residual-policy.mjs';
import { loadRegistry, REPO_ROOT } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const RULE_IDS = ['ASR-042', 'ASR-043', 'ASR-044', 'ASR-045', 'ASR-046'];

function fixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function matcherHits(rule, text) {
  const hits = [];
  for (const matcher of rule.enforcement.matchers ?? []) {
    const re = new RegExp(matcher.pattern, matcher.flags ?? 'iu');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      re.lastIndex = 0;
      if (re.test(line)) hits.push({ line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

test('ASR-042..046 are registered as shadow rules with dated sources', () => {
  const reg = loadRegistry(REPO_ROOT);
  for (const id of RULE_IDS) {
    const rule = reg.rules.find(r => r.id === id);
    assert.ok(rule, `missing ${id}`);
    assert.equal(rule.enforcement.status, 'shadow');
    assert.match(rule.source.date, /^\d{4}-\d{2}-\d{2}$/u);
    for (const path of rule.enforcement.evidence ?? []) {
      assert.ok(
        readFileSync(join(REPO_ROOT, path), 'utf8').length > 0,
        `empty evidence ${path}`
      );
    }
  }
});

test('fixture pack is complete (one bad + one good per rule)', () => {
  const names = new Set(readdirSync(FIXTURES));
  for (const id of RULE_IDS) {
    const bad = [...names].find(n => n.startsWith(`${id}.bad.`));
    const good = [...names].find(n => n.startsWith(`${id}.good.`));
    assert.ok(bad, `missing ${id}.bad.*`);
    assert.ok(good, `missing ${id}.good.*`);
  }
});

test('ASR-042 bad fixture triggers stream-pacing matchers; good control does not', () => {
  const rule = loadRegistry(REPO_ROOT).rules.find(r => r.id === 'ASR-042');
  const badHits = matcherHits(rule, fixture('ASR-042.bad.ts'));
  const goodHits = matcherHits(rule, fixture('ASR-042.good.ts')).filter(h =>
    /smoothStream/u.test(h.text)
  );
  assert.ok(
    badHits.some(h => /smoothStream|setTimeout/u.test(h.text)),
    `expected ASR-042 bad hit, got ${JSON.stringify(badHits)}`
  );
  assert.equal(
    goodHits.length,
    0,
    'backoff/debounce must not count as stream pacing'
  );
});

test('ASR-043 bad fixture triggers dead-warm matchers; good control does not', () => {
  const rule = loadRegistry(REPO_ROOT).rules.find(r => r.id === 'ASR-043');
  const badHits = matcherHits(rule, fixture('ASR-043.bad.ts'));
  const goodText = fixture('ASR-043.good.ts');
  // Good is SSR-only (no warm) — bare members(id) / presence warm patterns miss.
  const bare = /queryKeys\.audience\.members\(\s*[A-Za-z_][\w.]*\s*\)/u;
  assert.ok(
    badHits.some(h => /audience\.members|dspEnrichment\.presence/u.test(h.text))
  );
  assert.equal(bare.test(goodText), false);
  assert.equal(/queryKeys\.dspEnrichment\.presence\(/u.test(goodText), false);
  assert.ok(/SSR-only/u.test(goodText));
});

test('ASR-044 bad coerces missing to zero; good keeps null and prior rows', () => {
  const rule = loadRegistry(REPO_ROOT).rules.find(r => r.id === 'ASR-044');
  const badHits = matcherHits(rule, fixture('ASR-044.bad.ts'));
  const goodHits = matcherHits(rule, fixture('ASR-044.good.ts'));
  assert.ok(badHits.length > 0, 'total ?? 0 must trigger');
  assert.equal(goodHits.length, 0);
  assert.ok(/priorRows/u.test(fixture('ASR-044.good.ts')));
});

test('ASR-045 fixture registration: hover ring and focus→Attach are bad; keyboard ring is good', () => {
  // Review-only / human+vision rule — this case pins fixture text only; it does
  // not exercise a shipped static review path.
  const bad = fixture('ASR-045.bad.ts');
  const good = fixture('ASR-045.good.ts');
  assert.ok(/hover:ring/u.test(bad));
  assert.ok(/openAttach\(\)/u.test(bad));
  assert.ok(/focus-visible:ring/u.test(good));
  assert.equal(/hover:ring/u.test(good), false);
  assert.equal(/openAttach/u.test(good), false);
  assert.ok(/innerRadius:\s*8/u.test(good));
});

test('ASR-046 unverifiable mandatory item cannot claim aggregate PASS', () => {
  const bad = JSON.parse(fixture('ASR-046.bad.json'));
  const good = JSON.parse(fixture('ASR-046.good.json'));
  const badDecision = decideOutcomeResidual(bad.items);
  const goodDecision = decideOutcomeResidual(good.items);
  assert.equal(badDecision.status, 'hold');
  assert.equal(badDecision.reason, 'mandatory-unverifiable');
  assert.notEqual(bad.claimedAggregate, badDecision.status);
  assert.equal(goodDecision.status, 'pass');
  assert.equal(good.claimedAggregate, 'pass');
});

test('RSI RF ledger + ASR registry registration are present (fixture/registration check)', () => {
  // Registration only: reads preseeded RF-0003..0007 ledger lines and ASR
  // registry ids. Does not exercise dry-run review ingestion.
  const ledger = readFileSync(
    join(REPO_ROOT, 'apps/web/review-findings/findings.jsonl'),
    'utf8'
  );
  assert.ok(/RF-000[3-7]/u.test(ledger), 'RSI RF entries missing from ledger');
  const reg = loadRegistry(REPO_ROOT);
  assert.equal(
    RULE_IDS.every(id => reg.rules.some(r => r.id === id)),
    true
  );
});
