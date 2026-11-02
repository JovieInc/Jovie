import assert from 'node:assert/strict';
import test from 'node:test';
import { readVisionConfig } from './vision.mjs';
import {
  checkCalibration,
  MIN_NEGATIVES,
  MIN_POSITIVES,
  measure,
  tasteJudgeLabels,
  verdict,
  wilsonLower,
} from './vision-calibration.mjs';

const FLOORS = { precisionMin: 0.9, recallMin: 0.8 };
const frames = (n, word, prefix) =>
  Array.from({ length: n }, (_, i) => ({
    key: `${prefix}${i}`,
    criteria: { polish: `${word} 0.9` },
  }));

test('checked-in config: every judge is shadow and the numbers are reported', () => {
  const { failures, shadow, judges } = checkCalibration(
    process.cwd(),
    readVisionConfig()
  );
  assert.deepEqual(failures, []);
  assert.ok(shadow.some(line => line.startsWith('vision polish: shadow')));
  for (const criterion of ['polish', 'hierarchy', 'mockup_quality'])
    assert.equal(judges[criterion].mayBlock, false);
});

test('deliberate red: setting a judge to blocking without calibration fails', () => {
  const config = { ...readVisionConfig(), judgeModes: { polish: 'blocking' } };
  const { failures } = checkCalibration(process.cwd(), config);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /polish is set to blocking but fails the floors/);
});

test('a tiny perfect sample is not enough: Wilson bound and minimum counts hold it back', () => {
  const obs = [...frames(3, 'unpolished', 'd'), ...frames(3, 'polished', 'c')];
  const labels = [
    ...obs
      .slice(0, 3)
      .map(o => ({ key: o.key, judge: 'polish', truth: 'defect' })),
    ...obs.slice(3).map(o => ({ key: o.key, judge: 'polish', truth: 'ok' })),
  ];
  const m = measure(obs, labels).polish;
  assert.equal(m.precision, 1);
  assert.equal(m.recall, 1);
  assert.equal(verdict(m, FLOORS).mayBlock, false);
});

test('a large, accurate sample earns promotion; a precise-but-leaky one does not', () => {
  const n = Math.max(MIN_POSITIVES, MIN_NEGATIVES) + 20;
  const good = [...frames(n, 'unpolished', 'd'), ...frames(n, 'polished', 'c')];
  const labels = [
    ...good
      .slice(0, n)
      .map(o => ({ key: o.key, judge: 'polish', truth: 'defect' })),
    ...good.slice(n).map(o => ({ key: o.key, judge: 'polish', truth: 'ok' })),
  ];
  assert.equal(verdict(measure(good, labels).polish, FLOORS).mayBlock, true);
  const leaky = good.map((o, i) =>
    i < n && i % 2 === 0 ? { ...o, criteria: { polish: 'polished 0.9' } } : o
  );
  const m = measure(leaky, labels).polish;
  assert.ok(m.recall < 0.8);
  assert.equal(verdict(m, FLOORS).mayBlock, false);
});

test('wilsonLower is conservative for small n', () => {
  assert.ok(wilsonLower(3, 3) < 0.5);
  assert.ok(wilsonLower(90, 100) < 0.9);
});

test('taste labels from Tim verdicts feed calibration and wait for a judge run', () => {
  const labels = tasteJudgeLabels(process.cwd());
  assert.ok(
    labels.some(
      l =>
        l.key === 'release-hero-blurred' &&
        l.judge === 'text_on_busy' &&
        l.truth === 'defect'
    )
  );
  const { judges } = checkCalibration(process.cwd(), readVisionConfig());
  assert.ok(judges.text_on_busy.unmatched >= 2);
});
