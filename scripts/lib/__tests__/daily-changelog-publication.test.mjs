import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../changelog-parser.mjs';
import { collectCustomerCandidates } from '../daily-changelog-collector.mjs';
import {
  checkPublicationBinding,
  evaluateCustomerNoteContract,
  isTrustedControllerRun,
  planDailyPublication,
  readCustomerNote,
} from '../daily-changelog-publication.mjs';

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
describe('customer release metadata', () => {
  it.each([
    'Codex shipper: safer dispatch.',
    'PersistentAudioBar tests: align labels.',
    'Update apps/web/lib/source.ts: faster imports.',
  ])('excludes implementation copy at public intake: %s', text => {
    expect(readCustomerNote(body({ ...note, text })).reason).toBe(
      'failed-validation'
    );
  });
  it('requires explicit rollout scope for new public notes and retains it in the publication receipt', () => {
    const scope = {
      status: 'limited',
      prerequisites: ['Eligible artist profiles'],
    };
    const scoped = { ...note, availability: scope };
    const result = planDailyPublication(
      input({
        candidates: [
          candidate({ pr: { ...candidate().pr, body: body(scoped) } }),
        ],
      })
    );
    expect(result.result.receipt.stories[0].availability).toEqual(scope);
    expect(
      readCustomerNote(
        body({
          ...note,
          availability: { status: 'limited', prerequisites: [] },
        })
      ).reason
    ).toBe('failed-validation');
    expect(
      evaluateCustomerNoteContract({
        files: ['apps/web/lib/profile.ts'],
        createdAt: '2026-10-03T00:00:00Z',
        body: body({ ...note, availability: undefined }),
      })
    ).toMatchObject({ passed: false, reason: 'missing-availability' });
  });
  it('requires a public/internal decision for new customer code without reclassifying existing PRs', () => {
    const event = {
      files: ['apps/web/components/features/profile/Profile.tsx'],
      createdAt: '2026-10-03T01:00:00Z',
      body: '',
    };
    expect(evaluateCustomerNoteContract(event).passed).toBe(false);
    expect(
      evaluateCustomerNoteContract({ ...event, body: body(note) }).passed
    ).toBe(true);
    expect(
      evaluateCustomerNoteContract({
        ...event,
        body: body({ releaseWorthy: false }),
      }).passed
    ).toBe(true);
    expect(
      evaluateCustomerNoteContract({
        ...event,
        createdAt: '2026-10-02T01:00:00Z',
      }).applicable
    ).toBe(false);
    expect(
      evaluateCustomerNoteContract({
        ...event,
        files: ['apps/web/lib/profile.test.ts', 'scripts/internal.mjs'],
      }).applicable
    ).toBe(false);
  });
  it('never manufactures copy from a PR title or malformed metadata', () => {
    expect(readCustomerNote('feat: Great new feature')).toEqual({
      reason: 'missing-metadata',
    });
    expect(readCustomerNote('<!-- customer-changelog/v1 nope -->')).toEqual({
      reason: 'malformed',
    });
    expect(readCustomerNote(`${body(note)}${body(note)}`)).toEqual({
      reason: 'ambiguous',
    });
    expect(readCustomerNote(body({ releaseWorthy: false }))).toEqual({
      reason: 'internal',
    });
  });
  it('rejects unsafe public copy and off-origin evidence before making requests', () => {
    for (const value of [
      null,
      {},
      { ...note, text: 'Deploy the CI pipeline' },
      { ...note, text: '<script>oops</script>' },
      { ...note, section: 'Made up' },
      { ...note, evidence: [{ url: 'garbage', contains: 'ok' }] },
      ...[
        'http://jov.ie',
        'https://evil.test',
        'https://x:y@jov.ie',
        'https://jov.ie:8000',
      ].map(url => ({ ...note, evidence: [{ url, contains: 'Claim' }] })),
      { ...note, evidence: [{ url: 'https://jov.ie', contains: '' }] },
    ])
      expect(readCustomerNote(body(value)).note).toBeUndefined();
    expect(readCustomerNote(body(note)).note).toEqual(note);
  });
  it('accepts optional details and a first-party action destination', () => {
    const value = {
      ...note,
      details: ['Fans opt in per artist; nothing is sent without a signup.'],
      action: {
        label: 'See it on a demo profile',
        href: '/demo/showcase/tim-white-profile?mode=subscribe',
      },
    };
    expect(readCustomerNote(body(value)).note).toEqual(value);
  });
  it.each([
    { action: { label: 'Go', href: 'javascript:alert(1)' } },
    { action: { label: 'Go', href: 'https://example.com/' } },
    { action: { label: 'Go', href: '//jov.ie.evil.test' } },
    { action: { label: 'x'.repeat(81), href: '/support' } },
    { action: { label: 'Go' } },
    { action: '/support' },
    { details: ['<img src=x onerror=alert(1)>'] },
    { details: ['Codex shipper hardening: safer dispatch.'] },
    { details: ['a'.repeat(241)] },
    { details: 'not-an-array' },
  ])('rejects malformed details or an unsafe action: %o', patch => {
    expect(readCustomerNote(body({ ...note, ...patch })).reason).toBe(
      'failed-validation'
    );
  });
});
describe('source → published changelog', () => {
  it('defers a verified superseded public generation while malformed bindings still fail', () => {
    expect(
      checkPublicationBinding(
        marker,
        { ...buildInfo, commitSha: MERGE },
        controller
      )
    ).toMatchObject({
      status: 'deferred',
      reason: 'public-generation-advanced',
    });
    expect(checkPublicationBinding(marker, buildInfo, controller)).toEqual({
      status: 'bound',
    });
    expect(() =>
      checkPublicationBinding(
        { ...marker, authSmoke: 'failed' },
        buildInfo,
        controller
      )
    ).toThrow();
  });
  it('publishes approved copy from an ancestor merge in a coalesced deployment', () => {
    const plan = planDailyPublication(input());
    expect(plan.status).toBe('publish');
    expect(plan.result.receipt.mergeShas).toEqual([MERGE]);
    expect(plan.result.receipt.deployments).toEqual([
      { id: 'dpl_1', sha: HEAD },
    ]);
    const release = parseChangelog(plan.content).releases[0];
    expect(release.sections.added).toEqual([note.text]);
    expect(release.date).toBe('2026-10-02');
    expect(plan.content).not.toContain('undefined');
  });
  it('carries note details and the action destination into the published story', () => {
    const value = {
      ...note,
      details: ['Fans opt in per artist; nothing is sent without a signup.'],
      action: {
        label: 'See it on a demo profile',
        href: '/demo/showcase/tim-white-profile?mode=subscribe',
      },
    };
    const plan = planDailyPublication(
      input({
        candidates: [
          candidate({ pr: { ...candidate().pr, body: body(value) } }),
        ],
      })
    );
    expect(plan.status).toBe('publish');
    const story = plan.result.stories[0];
    expect(story.bullets).toEqual([
      'Fans opt in per artist; nothing is sent without a signup.',
    ]);
    expect(story.action).toEqual(value.action);
  });
  it('appends within one daily identity, preserves published copy and consumes each source once', () => {
    const first = planDailyPublication(input());
    const replay = planDailyPublication(input({ markdown: first.content }));
    expect(replay.status).toBe('no-change');
    expect(replay.content).toBe(first.content);
    const second = candidate({
      pr: {
        ...candidate().pr,
        number: 2,
        body: body({ ...note, outcomeKey: 'second' }),
      },
    });
    const sameDay = planDailyPublication(
      input({ markdown: first.content, candidates: [second] })
    );
    expect(sameDay.status).toBe('publish');
    expect(parseChangelog(sameDay.content).releases).toHaveLength(1);
    expect(sameDay.content.match(/## \[2026-10-02\]/g)).toHaveLength(1);
    expect(sameDay.result.stories).toHaveLength(2);
    expect(sameDay.result.receipt.sourceReceiptIds).toHaveLength(2);
    const nextDay = planDailyPublication(
      input({
        markdown: first.content,
        candidates: [second],
        windowKey: '2026-10-03',
        observedAt: '2026-10-03T00:15:00Z',
      })
    );
    expect(nextDay.status).toBe('publish');
    expect(parseChangelog(nextDay.content).releases).toHaveLength(2);
  });
  it('preserves same-day outcome copy, proof and the three-outcome cap across append attempts', () => {
    const first = planDailyPublication(
      input({
        candidates: [
          candidate({
            evidenceReceipts: [{ url: 'https://jov.ie', sha256: 'receipt' }],
          }),
        ],
      })
    );
    const make = (number, outcomeKey, text = note.text) =>
      candidate({
        pr: {
          ...candidate().pr,
          number,
          body: body({ ...note, outcomeKey, text }),
        },
      });
    const grouped = planDailyPublication(
      input({ markdown: first.content, candidates: [make(2, note.outcomeKey)] })
    );
    expect(grouped.result.stories).toHaveLength(1);
    expect(grouped.result.stories[0].sourceIds).toHaveLength(2);
    expect(grouped.result.receipt.runtimeEvidence).toEqual([
      { url: 'https://jov.ie', sha256: 'receipt' },
    ]);
    expect(() =>
      planDailyPublication(
        input({
          markdown: first.content,
          candidates: [make(2, note.outcomeKey, 'Changed claim')],
        })
      )
    ).toThrow('Conflicting approved copy');
    const capped = planDailyPublication(
      input({
        markdown: first.content,
        candidates: [make(2, 'second'), make(3, 'third'), make(4, 'fourth')],
      })
    );
    expect(capped.result.stories).toHaveLength(3);
    expect(capped.deferred).toHaveLength(1);
    for (const field of ['sourceReceiptIds', 'mergeShas', 'deployments']) {
      const malformed = first.content.replace(
        new RegExp(`"${field}":\\[[\\s\\S]*?\\]`),
        `"${field}":null`
      );
      expect(() =>
        planDailyPublication(input({ markdown: malformed }))
      ).toThrow('Published daily story provenance missing');
    }
    const legacyReceipt = first.content.replace(
      /,"stories":\[[\s\S]*?\],"publicationHead"/,
      ',"publicationHead"'
    );
    expect(() =>
      planDailyPublication(input({ markdown: legacyReceipt }))
    ).toThrow('Published daily story provenance missing');
  });
  it('fails closed on missing or mismatched production evidence and invented dates', () => {
    for (const change of [
      { marker: { ...marker, authSmoke: 'failed' } },
      { marker: { ...marker, terminalReason: 'noop' } },
      { marker: { ...marker, selectedLanes: [] } },
      { buildInfo: { ...buildInfo, deploymentId: 'another' } },
      { buildInfo: { ...buildInfo, commitSha: MERGE } },
      { controller: { ...controller, verified: false } },
      { controller: { ...controller, attempt: 2 } },
      { windowKey: '2026-09-01' },
      { markdown: '<!-- daily-changelog-receipt/v1 {broken} -->' },
    ])
      expect(() => planDailyPublication(input(change))).toThrow();
  });
  it('emits audited no-change for internal, unavailable and missing-copy sources', () => {
    const candidates = [
      candidate({ pr: { ...candidate().pr, body: '' } }),
      candidate({
        pr: {
          ...candidate().pr,
          number: 2,
          body: body({ releaseWorthy: false }),
        },
      }),
      candidate({ ancestor: false }),
      candidate({ evidencePassed: false }),
      candidate({ pr: { ...candidate().pr, state: 'OPEN' } }),
    ];
    const plan = planDailyPublication(input({ candidates }));
    expect(plan.status).toBe('no-change');
    expect(plan.audit.map(row => row.reason)).toEqual([
      'missing-metadata',
      'internal',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    expect(plan.content).toBe(input().markdown);
  });
  it('groups reciprocal sources, rejects conflicting copy and retains overflow', () => {
    const second = candidate({ pr: { ...candidate().pr, number: 2 } });
    const grouped = planDailyPublication(
      input({ candidates: [candidate(), second] })
    );
    expect(grouped.result.stories).toHaveLength(1);
    expect(grouped.result.stories[0].sourceIds).toHaveLength(2);
    expect(() =>
      planDailyPublication(
        input({
          candidates: [
            candidate(),
            candidate({
              pr: {
                ...second.pr,
                body: body({ ...note, text: 'Different claim.' }),
              },
            }),
          ],
        })
      )
    ).toThrow('Conflicting');
    const many = Array.from({ length: 4 }, (_, number) =>
      candidate({
        pr: {
          ...candidate().pr,
          number: number + 1,
          body: body({ ...note, outcomeKey: `outcome-${number}` }),
        },
      })
    );
    const capped = planDailyPublication(input({ candidates: many }));
    expect(capped.result.stories).toHaveLength(3);
    expect(capped.result.receipt.deferred).toEqual([
      `JovieInc/Jovie#4@${MERGE}`,
    ]);
  });
});
describe('production candidate collection', () => {
  async function collect(overrides = {}) {
    const calls = [];
    const result = await collectCustomerCandidates({
      markdown: '',
      marker,
      observedAt,
      git: async (args, options) =>
        options?.status ? 0 : 'feature (#1)\ninternal (#2)',
      graphql: async () => ({
        data: {
          repository: {
            p1: candidate().pr,
            p2: {
              ...candidate().pr,
              number: 2,
              body: body({ releaseWorthy: false }),
            },
          },
        },
      }),
      fetchPage: async url => {
        calls.push(url);
        return { ok: true, status: 200, text: async () => 'Claim' };
      },
      ...overrides,
    });
    return { result, calls };
  }
  it('checks actual ancestry and customer-path readback, avoiding internal requests', async () => {
    const { result, calls } = await collect();
    expect(result[0]).toMatchObject({ ancestor: true, evidencePassed: true });
    expect(result[0].evidenceReceipts[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result[1].evidenceReceipts).toEqual([]);
    expect(calls).toEqual(['https://jov.ie/']);
  });
  it('fails closed on missing PR provenance and collection limits', async () => {
    await expect(
      collect({ graphql: async () => ({ errors: ['bad'] }) })
    ).rejects.toThrow('provenance');
    await expect(
      collect({ graphql: async () => ({ data: { repository: {} } }) })
    ).rejects.toThrow('Missing');
    await expect(
      collect({ git: async () => Array(5001).fill('x').join('\n') })
    ).rejects.toThrow('budget');
    await expect(collect({ seed: [{ number: -1 }] })).rejects.toThrow(
      'Invalid'
    );
  });
  it('carries overflow and supports explicit recovery without changing old PRs', async () => {
    const markdown = `<!-- daily-changelog-receipt/v1 ${JSON.stringify({ publicationHead: MERGE, deferred: [`JovieInc/Jovie#2@${MERGE}`] })} -->`;
    const { result } = await collect({
      markdown,
      seed: [{ number: 3, note }],
      git: async (args, options) => (options?.status ? 0 : ''),
      graphql: async () => ({
        data: {
          repository: {
            p2: { ...candidate().pr, number: 2, body: '' },
            p3: { ...candidate().pr, number: 3, body: '' },
          },
        },
      }),
    });
    expect(result.map(row => row.pr.number)).toEqual([2, 3]);
    expect(result[1].evidencePassed).toBe(true);
  });
  it('never promotes a failed, redirected, mismatched or unreachable customer path', async () => {
    for (const fetchPage of [
      async () => {
        throw new Error('timeout');
      },
      async () => ({ ok: false, status: 404, text: async () => 'Claim' }),
      async () => ({ ok: true, status: 200, text: async () => 'Unavailable' }),
    ])
      expect((await collect({ fetchPage })).result[0].evidencePassed).toBe(
        false
      );
    expect(
      (
        await collect({
          git: async (args, options) => (options?.status ? 1 : 'feature (#1)'),
        })
      ).result[0].ancestor
    ).toBe(false);
  });
});
describe('publication transport', () => {
  it('runs only after exact production verification and preserves the release DAG', () => {
    const workflow =
      /** @type {{ jobs: Record<string, {needs: string[], if: string, steps: Array<{name?: string, run?: string}>}> }} */ (
        load(
          readFileSync(
            new URL(
              '../../../.github/workflows/production-controller.yml',
              import.meta.url
            ),
            'utf8'
          )
        )
      );
    const job = workflow.jobs['publish-customer-changelog'];
    expect(job.needs).toEqual(['authorize-production', 'production-verified']);
    expect(job.if).toContain("outputs.verified == 'true'");
    expect(
      job.steps.find(
        step => step.name === 'Prepare the one customer-notes release PR'
      ).run
    ).not.toContain('gh pr merge');
    expect(workflow.jobs['coalesce-production'].steps.at(-1).run).toContain(
      'exact SHA stayed current through the bounded coalescing window'
    );
    expect(workflow.jobs['production-verified'].needs).not.toContain(
      'publish-customer-changelog'
    );
  });
});

describe('controller run trust', () => {
  const deployed = 'd'.repeat(40);
  const later = 'c'.repeat(40);
  const marker = { sha: deployed };
  const run = head => ({
    path: '.github/workflows/production-controller.yml',
    head_branch: 'main',
    event: 'workflow_run',
    head_sha: head,
  });

  it('trusts the exact deployed head and a workflow_run head that descends from it', () => {
    expect(isTrustedControllerRun(run(deployed), marker, null)).toBe(true);
    // Run 37144574062 deployed ddd83d2 while its run head was c75c559.
    expect(
      isTrustedControllerRun(run(later), marker, {
        status: 'ahead',
        merge_base_commit: { sha: deployed },
      })
    ).toBe(true);
  });

  it('rejects unrelated heads, other workflows, branches and events', () => {
    expect(isTrustedControllerRun(run(later), marker, null)).toBe(false);
    for (const status of ['behind', 'diverged', 'identical']) {
      expect(
        isTrustedControllerRun(run(later), marker, {
          status,
          merge_base_commit: { sha: deployed },
        })
      ).toBe(false);
    }
    expect(
      isTrustedControllerRun(run(later), marker, {
        status: 'ahead',
        merge_base_commit: { sha: 'e'.repeat(40) },
      })
    ).toBe(false);
    expect(
      isTrustedControllerRun(
        { ...run(deployed), path: '.github/workflows/ci.yml' },
        marker,
        null
      )
    ).toBe(false);
    expect(
      isTrustedControllerRun(
        { ...run(deployed), head_branch: 'x' },
        marker,
        null
      )
    ).toBe(false);
    expect(
      isTrustedControllerRun({ ...run(deployed), event: 'push' }, marker, null)
    ).toBe(false);
    expect(isTrustedControllerRun(run(deployed), { sha: 'bad' }, null)).toBe(
      false
    );
  });
});

describe('controller run trust replay: run 37144574062 (#20386)', () => {
  // Exact production evidence from 2026-10-03; compare bodies are the recorded
  // GitHub `compare/{deployed}...{head}` fields the publisher reads.
  const deployed = 'ddd83d2278061a9cece22a21e23e47fe09d2c6cb';
  const marker = { sha: deployed };
  const controller = head => ({
    path: '.github/workflows/production-controller.yml',
    head_branch: 'main',
    event: 'workflow_run',
    head_sha: head,
  });

  it('accepts the workflow_run head c75c559 that descends from deployed ddd83d2', () => {
    expect(
      isTrustedControllerRun(
        controller('c75c559a06e94a26a7afb258f85dc951775332bd'),
        marker,
        {
          status: 'ahead',
          ahead_by: 3,
          behind_by: 0,
          merge_base_commit: { sha: deployed },
        }
      )
    ).toBe(true);
  });

  it('rejects the pre-freeze head 4777fd7, which is not a descendant', () => {
    expect(
      isTrustedControllerRun(
        controller('4777fd7d6887596d22de3c3edae5c7c16bf1b0bd'),
        marker,
        {
          status: 'behind',
          ahead_by: 0,
          behind_by: 194,
          merge_base_commit: {
            sha: '4777fd7d6887596d22de3c3edae5c7c16bf1b0bd',
          },
        }
      )
    ).toBe(false);
  });
});
