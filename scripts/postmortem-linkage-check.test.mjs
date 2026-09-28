import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  effectiveMode,
  evaluateLinkage,
  lintPostmortem,
  loadPolicy,
  parseFrontmatter,
} from './postmortem-linkage-check.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const VALID_PATH = 'docs/postmortems/2026-09-30-widget-outage.md';
const VALID_FRONTMATTER = `---
id: 2026-09-30-widget-outage
status: draft
severity: sev2
detected: 2026-09-30T01:00Z
repaired: 2026-09-30T02:00Z
failure_classes: [silent-production-staleness]
incident_issue: JOV-6700
actions: [JOV-6701, JOV-6702]
gbrain: ops/postmortems/2026-09-30-widget-outage
---

# Widget outage
`;

test('existing dated post-mortems pass the frontmatter lint', () => {
  for (const file of [
    'docs/postmortems/2026-09-26-production-freeze.md',
    'docs/postmortems/2026-09-27-sbom-provenance-freeze.md',
  ]) {
    assert.deepEqual(
      lintPostmortem(file, readFileSync(resolve(REPO_ROOT, file), 'utf8')),
      [],
      file
    );
  }
});

test('valid fixture frontmatter passes', () => {
  assert.deepEqual(lintPostmortem(VALID_PATH, VALID_FRONTMATTER), []);
});

test('missing frontmatter is flagged', () => {
  const errors = lintPostmortem(VALID_PATH, '# No frontmatter\n');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /frontmatter/);
});

test('frontmatter lint rejects bad status, taxonomy, actions, and gbrain', () => {
  const bad = VALID_FRONTMATTER.replace('status: draft', 'status: shipped')
    .replace(
      'failure_classes: [silent-production-staleness]',
      'failure_classes: [made-up-class]'
    )
    .replace('actions: [JOV-6701, JOV-6702]', 'actions: [fix it later]')
    .replace(
      'gbrain: ops/postmortems/2026-09-30-widget-outage',
      'gbrain: wiki/widget'
    );
  const errors = lintPostmortem(VALID_PATH, bad);
  assert.equal(errors.length, 4);
  assert.match(errors.join('\n'), /status/);
  assert.match(errors.join('\n'), /taxonomy/);
  assert.match(errors.join('\n'), /actions entry/);
  assert.match(errors.join('\n'), /gbrain/);
});

test('frontmatter id must match the filename slug', () => {
  const errors = lintPostmortem(
    VALID_PATH,
    VALID_FRONTMATTER.replace('id: 2026-09-30-widget-outage', 'id: other')
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /filename slug/);
});

test('linkage flags an incident PR with no post-mortem (deliberate red fixture)', () => {
  const violations = evaluateLinkage({
    changedFiles: ['apps/web/lib/foo.ts'],
    incidentIssues: ['JOV-6621'],
    prText: 'Closes JOV-6621',
    existsOnBase: () => false,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /JOV-6621/);
});

test('linkage passes when the PR adds a post-mortem', () => {
  assert.deepEqual(
    evaluateLinkage({
      changedFiles: [VALID_PATH],
      incidentIssues: ['JOV-6621'],
      prText: '',
      existsOnBase: () => false,
    }),
    []
  );
});

test('linkage passes when the PR links a post-mortem already on base', () => {
  assert.deepEqual(
    evaluateLinkage({
      changedFiles: ['apps/web/lib/foo.ts'],
      incidentIssues: ['JOV-6621'],
      prText: 'Post-mortem: docs/postmortems/2026-09-26-production-freeze.md',
      existsOnBase: path =>
        path === 'docs/postmortems/2026-09-26-production-freeze.md',
    }),
    []
  );
});

test('linkage ignores linked post-mortem paths absent from base', () => {
  const violations = evaluateLinkage({
    changedFiles: [],
    incidentIssues: ['JOV-6621'],
    prText: 'see docs/postmortems/2099-01-01-not-real.md',
    existsOnBase: () => false,
  });
  assert.equal(violations.length, 1);
});

test('no incident issues means no linkage requirement', () => {
  assert.deepEqual(
    evaluateLinkage({
      changedFiles: ['apps/web/lib/foo.ts'],
      incidentIssues: [],
      prText: 'Closes JOV-6621',
      existsOnBase: () => false,
    }),
    []
  );
});

test('policy is warn until blockingAfter, then blocking', () => {
  const policy = loadPolicy(
    resolve(REPO_ROOT, '.github/postmortem-linkage-policy.json')
  );
  assert.equal(effectiveMode(policy, new Date('2026-09-27T00:00:00Z')), 'warn');
  assert.equal(
    effectiveMode(policy, new Date('2026-10-05T00:00:00Z')),
    'blocking'
  );
  assert.equal(
    effectiveMode({ ...policy, mode: 'blocking' }, new Date('2026-09-27')),
    'blocking'
  );
});

test('parseFrontmatter reads scalars and inline lists', () => {
  assert.deepEqual(parseFrontmatter(VALID_FRONTMATTER), {
    id: '2026-09-30-widget-outage',
    status: 'draft',
    severity: 'sev2',
    detected: '2026-09-30T01:00Z',
    repaired: '2026-09-30T02:00Z',
    failure_classes: ['silent-production-staleness'],
    incident_issue: 'JOV-6700',
    actions: ['JOV-6701', 'JOV-6702'],
    gbrain: 'ops/postmortems/2026-09-30-widget-outage',
  });
  assert.equal(parseFrontmatter('no fence'), null);
});
