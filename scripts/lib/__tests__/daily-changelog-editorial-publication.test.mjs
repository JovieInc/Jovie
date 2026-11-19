import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicationEditorialFindings } from '../customer-changelog-editorial.mjs';
import { planDailyPublication } from '../daily-changelog-publication.mjs';

const HEAD = 'a'.repeat(40),
  MERGE = 'b'.repeat(40);
const observedAt = '2026-10-02T12:00:00Z';
const note = {
  issueId: 'JOV-7447',
  outcomeKey: 'profile-claim',
  section: 'Added',
  audience: 'public',
  visibility: 'public',
  releaseWorthy: true,
  text: 'Choose your profile link: Start with a name on the homepage.',
  availability: { status: 'ga', prerequisites: [] },
  evidence: [{ url: 'https://jov.ie/', contains: 'Claim' }],
};
const body = value => `<!-- customer-changelog/v1 ${JSON.stringify(value)} -->`;
const marker = {
  sha: HEAD,
  deploymentId: 'dpl_1',
  controllerRun: '123',
  controllerAttempt: '1',
  authSmoke: 'passed',
  terminalReason: 'promoted',
  selectedLanes: ['web'],
};
const buildInfo = {
  commitSha: HEAD,
  deploymentId: 'dpl_1',
  environment: 'production',
};
const controller = { verified: true, runId: 123, attempt: 1 };
const candidate = (overrides = {}) => ({
  pr: {
    number: 1,
    state: 'MERGED',
    baseRefName: 'main',
    mergeCommit: { oid: MERGE },
    url: 'https://github.com/JovieInc/Jovie/pull/1',
    body: body(note),
  },
  ancestor: true,
  evidencePassed: true,
  ...overrides,
});
const input = overrides => ({
  markdown: '# Changelog\n\n## [Unreleased]\n',
  marker,
  buildInfo,
  controller,
  candidates: [candidate()],
  windowKey: '2026-10-02',
  observedAt,
  ...overrides,
});
describe('publication editorial preflight', () => {
  it('reports planned copy that would fail the published editorial guard, and accepts an overlay', () => {
    const legacyNote = {
      ...note,
      text: 'The Inbox is calmer: statuses are quieter.',
    };
    const plan = planDailyPublication(
      input({
        candidates: [
          candidate({ pr: { ...candidate().pr, body: body(legacyNote) } }),
        ],
      })
    );
    const overlay = { schema: 'customer-changelog-editorial/v1', entries: {} };
    const migrations = { entries: [] };
    expect(
      publicationEditorialFindings({
        content: plan.content,
        overlay,
        migrations,
      })
    ).toEqual([expect.stringContaining('followed by a lowercase explanation')]);
    overlay.entries['customer-update:profile-claim'] = {
      headline: 'The Inbox is calmer',
    };
    expect(
      publicationEditorialFindings({
        content: plan.content,
        overlay,
        migrations,
      })
    ).toEqual([]);
  });
});

describe('daily changelog writer runs its content checks before pushing (JOV-13111)', () => {
  const writer = readFileSync(
    new URL('../../publish-daily-changelog.mjs', import.meta.url),
    'utf8'
  );
  const publishGuard = writer.indexOf(
    "process.argv.includes('--write') && plan.status === 'publish'"
  );
  const changelogWrite = writer.indexOf(
    "writeFileSync('CHANGELOG.md', plan.content)",
    publishGuard
  );
  const editorialCheck = writer.indexOf(
    'check-customer-changelog-editorial.mjs'
  );

  it('spawns the canonical editorial check inside the publish --write path', () => {
    expect(publishGuard).toBeGreaterThan(-1);
    expect(editorialCheck).toBeGreaterThan(publishGuard);
  });

  it('checks the bytes about to be pushed, after the CHANGELOG.md write', () => {
    expect(changelogWrite).toBeGreaterThan(publishGuard);
    expect(editorialCheck).toBeGreaterThan(changelogWrite);
    // The canonical check reads the committed CHANGELOG.md (the file just
    // written) and exits nonzero on a violation, so a failing writer blocks
    // the caller's push step instead of opening a PR that fails Source
    // Validation minutes in.
    expect(writer).toContain('fileURLToPath(');
    expect(writer).toContain('execFileSync(');
  });
});
