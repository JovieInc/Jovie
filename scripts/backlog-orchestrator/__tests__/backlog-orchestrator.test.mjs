import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const classifier = await import('../classifier.mjs');
const scorer = await import('../scorer.mjs');
const workstreamer = await import('../workstreamer.mjs');
const reporter = await import('../reporter.mjs');

function makeIssue(overrides = {}) {
  return {
    id: 'test-id',
    identifier: overrides.identifier || 'TEST-001',
    title: overrides.title || 'Test issue',
    description: overrides.description || 'A test issue',
    url: 'https://linear.app/jovie/issue/TEST-001',
    createdAt: overrides.createdAt || '2026-07-01T00:00:00Z',
    updatedAt: overrides.updatedAt || '2026-07-01T12:00:00Z',
    priority: overrides.priority ?? 0,
    estimate: overrides.estimate ?? null,
    assignee: null,
    creator: null,
    labels: {
      nodes: overrides.labels ? overrides.labels.map(n => ({ name: n })) : [],
    },
    parent: null,
    children: { nodes: [] },
    relations: { nodes: overrides.relations || [] },
    state: {
      id: 'triage-id',
      name: overrides.state || 'Triage',
      type: 'triage',
    },
    comments: overrides.comments
      ? { nodes: overrides.comments }
      : { nodes: [] },
  };
}

describe('classifier', () => {
  it('classifies a standard issue as triageable', () => {
    const issue = makeIssue({
      identifier: 'JOV-100',
      title: 'Fix login button color',
    });
    const c = classifier.classifyDeterministic(issue, [issue]);
    assert.equal(c.category, 'triageable');
    assert.equal(c.mrrCategory, 'activation');
    assert.ok(c.fingerprint.length === 16);
  });

  it('detects exact duplicates', () => {
    const issues = [
      makeIssue({
        identifier: 'JOV-101',
        title: 'Fix button',
        relations: [
          {
            type: 'duplicate',
            relatedIssue: {
              id: 'o',
              identifier: 'JOV-100',
              title: 'Fix login button',
            },
          },
        ],
      }),
      makeIssue({ identifier: 'JOV-100' }),
    ];
    const c = classifier.classifyDeterministic(issues[0], issues);
    assert.equal(c.category, 'duplicate');
  });

  it('classifies area from labels', () => {
    const c = classifier.classifyDeterministic(
      makeIssue({ title: 'UI fix', labels: ['area:ui'] }),
      []
    );
    assert.equal(c.area, 'ui');
  });

  it('scores duplicates as 0', () => {
    const c = new classifier.IssueClassification(makeIssue());
    c.category = 'duplicate';
    assert.equal(scorer.scoreIssue(c).score, 0);
  });
});

describe('workstreamer', () => {
  it('bundles trivial issues in same area', () => {
    const issues = [
      makeIssue({
        identifier: 'JOV-1',
        title: 'Fix button pad',
        labels: ['area:ui'],
        estimate: 1,
      }),
      makeIssue({
        identifier: 'JOV-2',
        title: 'Fix button col',
        labels: ['area:ui'],
        estimate: 1,
      }),
    ];
    const cs = issues.map(i => classifier.classifyDeterministic(i, issues));
    const ws = workstreamer.bundleWorkstreams(cs);
    assert.ok(ws.some(b => b.issueIds.length >= 2));
  });
});

describe('reporter', () => {
  it('generates valid report', () => {
    const cs = [
      classifier.classifyDeterministic(
        makeIssue({
          identifier: 'JOV-1',
          title: 'Fix sign-in',
          labels: ['launch-blocker'],
        }),
        []
      ),
    ];
    const report = reporter.generateShadowReport({
      total: 1,
      classifications: cs,
      workstreams: [],
      skipped: 0,
    });
    assert.ok(report.includes('JOV-1'));
    assert.ok(report.includes('CLASSIFICATION SUMMARY'));
  });
});
