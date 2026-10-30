import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coldPrompt,
  criteriaFor,
  IMAGERY_CRITERIA,
  loadDogfoodRubric,
  parseCold,
  parseRubric,
  rubricPrompt,
} from '../../../apps/web/scripts/imagery/dogfood-adapter.mjs';

// A stand-in with the dogfood rubric's exported shape (rubric.mjs, PR #23746).
const rubric = {
  SEVERITIES: ['blocker', 'major', 'minor'],
  CRITERIA: IMAGERY_CRITERIA.map((slug, i) => ({
    id: `TT-${i + 1}`,
    slug,
    title: slug,
    severity: 'major',
    look: `look ${slug}`,
    fail: ['f'],
    pass: ['p'],
  })),
  buildColdPrompt: images => `cold for ${images[0].name}`,
  parseColdOutput: (raw, names) =>
    names.map(name => ({ image: name, issues: raw.images[0].issues })),
  coldFails: issues => issues.some(i => i.credible && i.severity !== 'minor'),
  stepVerdict: findings =>
    findings.filter(f => f.severity === 'blocker').length > 0 ||
    findings.filter(f => f.severity === 'major').length >= 2
      ? 'fail'
      : 'pass',
};

describe('dogfood adapter', () => {
  it('reuses the cold prompt and tells the model the image is attached', () => {
    const prompt = coldPrompt(rubric);
    assert.match(prompt, /attached to this message/);
    assert.match(prompt, /cold for image/);
    assert.match(prompt, /Reply with JSON only/);
  });

  it('fails cold only on a credible blocker or major, tolerating a missing bbox', () => {
    const minor = parseCold(rubric, {
      issues: [{ credible: true, severity: 'minor', detail: 'x' }],
    });
    assert.equal(minor.fails, false);
    const major = parseCold(rubric, {
      issues: [
        { credible: true, severity: 'major', detail: 'y', bbox: [0, 0, 1, 1] },
      ],
    });
    assert.equal(major.fails, true);
    assert.deepEqual(major.issues[0].bbox, [0, 0, 1, 1]);
    assert.equal(parseCold(rubric, {}).fails, false);
  });

  it('builds the taste prompt from the imagery criteria only and applies the verdict rule', () => {
    assert.equal(criteriaFor(rubric).length, 4);
    assert.match(rubricPrompt(rubric), /look matte-monochrome/);
    const raw = {
      findings: [
        { criterion: 'TT-1', pass: false, severity: 'major', detail: 'glow' },
        {
          criterion: 'TT-9',
          pass: false,
          severity: 'blocker',
          detail: 'not ours',
        },
        { criterion: 'TT-2', pass: true, severity: 'major', detail: '' },
      ],
    };
    const parsed = parseRubric(rubric, raw);
    assert.equal(parsed.findings.length, 1);
    assert.equal(parsed.fails, false);
    raw.findings.push({
      criterion: 'TT-3',
      pass: false,
      severity: 'major',
      detail: 'b',
    });
    assert.equal(parseRubric(rubric, raw).fails, true);
  });

  it('reports unavailable when no rubric exists', async () => {
    assert.equal(await loadDogfoodRubric('/nonexistent', {}), null);
    assert.throws(
      () => criteriaFor({ CRITERIA: [] }, ['nope']),
      /no criterion nope/
    );
  });
});
