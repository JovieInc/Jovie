import { describe, expect, it, vi } from 'vitest';
import {
  collectObservationCoverage,
  inspectObservationIssue,
  MINIMUM_OBSERVATION_MS,
  OBSERVATION_SCHEMA,
  observeSentryHistory,
  runSentryValidationObservations,
} from '../sentry-validation-observation.mjs';
import {
  currentReceiptsByKind,
  formatValidationReceipt,
  parseValidationReceipts,
} from '../validation-lifecycle.mjs';

const BINDING = 'b'.repeat(40);
const ARTIFACT = 'a'.repeat(40);
const DESCENDANT = 'c'.repeat(40);
const START = '2026-10-16T14:22:48Z';
const END = '2026-10-23T14:22:48Z';
const marker = (name, value) =>
  `<!-- ${name}:v1\n${JSON.stringify(value)}\n-->`;
const sources = ['JOVIE-WEB-XZ', 'JOVIE-WEB-S7', 'JOVIE-WEB-8D'];
const PLAN = {
  schema: OBSERVATION_SCHEMA,
  issue: 'JOV-8523',
  bindingSha: BINDING,
  organization: 'jovie',
  episodeStartedAt: null,
  start: START,
  end: END,
  incidents: sources.map(shortId => ({ shortId })),
};
const issue = (plan = PLAN) => ({
  id: 'uuid',
  identifier: 'JOV-8523',
  state: { name: 'Validating' },
  description: marker('sentry-observation', plan),
  history: [],
  comments: [
    {
      body: marker('validation-manifest', {
        schema: 'jovie.validation-manifest/v1',
        issue: 'JOV-8523',
        bindingSha: BINDING,
      }),
      createdAt: START,
    },
  ],
});
const link = (results, cursor = '0:100:0') =>
  `<https://sentry.io/ignored>; rel="next"; results="${results}"; cursor="${cursor}"`;
const event = (release = DESCENDANT) => ({
  eventID: 'd'.repeat(32),
  dateCreated: '2026-10-17T14:22:48Z',
  release,
  tags: [{ key: 'environment', value: 'vercel-production' }],
});

function sentryPort(events = []) {
  return vi.fn(async path =>
    path.includes('/shortids/')
      ? {
          ok: true,
          body: {
            group: {
              id: String(
                [...sources, 'JOVIE-WEB-AB', 'JOVIE-WEB-QH'].indexOf(
                  path.split('/').at(-2)
                ) + 1
              ),
              shortId: path.split('/').at(-2),
            },
          },
        }
      : { ok: true, body: events, link: link(false) }
  );
}

const REPAIR_BINDING = 'f'.repeat(40);
const FAILED_RELEASE = 'd'.repeat(40);
function sameEpisodeRepairIssue() {
  const boundary = '2026-10-17T00:00:00.000Z';
  const successor = {
    ...PLAN,
    bindingSha: REPAIR_BINDING,
    start: boundary,
    end: '2026-10-24T00:00:00.000Z',
    originalObservation: PLAN,
  };
  return {
    ...issue(successor),
    comments: [
      ...issue().comments,
      {
        body: marker('sentry-observation', PLAN),
        createdAt: '2026-10-16T19:00:00Z',
      },
      {
        body: formatValidationReceipt({
          issue: PLAN.issue,
          kind: 'outcome',
          status: 'fail',
          sha: FAILED_RELEASE,
          evidence: `https://jovie.sentry.io/issues/2/events/${'e'.repeat(32)}/`,
          episodeStartedAt: null,
          note: 'Observed configured production incident recurrence.',
        }),
        createdAt: '2026-10-16T20:00:00Z',
      },
      {
        body: marker('validation-manifest', {
          schema: 'jovie.validation-manifest/v1',
          issue: PLAN.issue,
          bindingSha: REPAIR_BINDING,
        }),
        createdAt: boundary,
      },
    ],
  };
}

const SECOND_REPAIR_BINDING = '9'.repeat(40);
const SECOND_FAILED_RELEASE = '8'.repeat(40);
function repeatedRepairIssue() {
  const first = sameEpisodeRepairIssue();
  const firstPlan = {
    ...JSON.parse(first.description.match(/\n([\s\S]*?)\n-->/)[1]),
    end: '2026-10-25T00:00:00.000Z',
    incidents: [...PLAN.incidents, { shortId: 'JOVIE-WEB-AB', issueId: '4' }],
  };
  const successor = {
    ...firstPlan,
    bindingSha: SECOND_REPAIR_BINDING,
    start: '2026-10-18T00:00:00.000Z',
    end: '2026-10-26T00:00:00.000Z',
  };
  return {
    ...first,
    description: marker('sentry-observation', successor),
    comments: [
      ...first.comments,
      {
        body: marker('sentry-observation', firstPlan),
        createdAt: '2026-10-17T01:00:00Z',
      },
      {
        body: formatValidationReceipt({
          issue: PLAN.issue,
          kind: 'outcome',
          status: 'fail',
          sha: SECOND_FAILED_RELEASE,
          evidence: `https://jovie.sentry.io/issues/2/events/${'f'.repeat(32)}/`,
          episodeStartedAt: null,
        }),
        createdAt: '2026-10-17T18:00:00Z',
      },
      {
        body: marker('validation-manifest', {
          schema: 'jovie.validation-manifest/v1',
          issue: PLAN.issue,
          bindingSha: SECOND_REPAIR_BINDING,
        }),
        createdAt: successor.start,
      },
    ],
  };
}

describe('explicit Sentry observation registration', () => {
  it('binds the complete incident denominator and original public-deploy window', () => {
    expect(inspectObservationIssue(issue())).toMatchObject({
      status: 'registered',
      plan: PLAN,
      episodeStartedAt: null,
    });
    expect(Date.parse(END) - Date.parse(START)).toBe(MINIMUM_OBSERVATION_MS);
    for (const plan of [
      { ...PLAN, incidents: PLAN.incidents.slice(0, 2) },
      { ...PLAN, start: '2026-10-16T14:22:47Z' },
      { ...PLAN, end: '2026-10-23T14:22:47Z' },
      { ...PLAN, incidents: [PLAN.incidents[0], PLAN.incidents[0]] },
      { ...PLAN, bindingSha: 'old' },
    ])
      expect(inspectObservationIssue(issue(plan)).status).toBe('unknown');
  });

  it('reads a fenced registration that survives Linear description Markdown normalization', () => {
    const registered = issue();
    registered.description = `\`\`\`json\n${registered.description}\n\`\`\``;
    expect(inspectObservationIssue(registered)).toMatchObject({
      status: 'registered',
      plan: PLAN,
    });
    // A bare marker was observed with escaped JSON brackets/terminator on
    // live description readback. It cannot be silently repaired into proof.
    registered.description = marker('sentry-observation', PLAN)
      .replaceAll('[', '\\[')
      .replaceAll(']', '\\]')
      .replace('-->', '\\-->');
    expect(inspectObservationIssue(registered).status).toBe('unknown');
  });

  it('retains both the immutable original and a second failed repair without shrinking acceptance', () => {
    const current = repeatedRepairIssue();
    expect(inspectObservationIssue(current)).toMatchObject({
      status: 'registered',
      plan: { bindingSha: SECOND_REPAIR_BINDING, originalObservation: PLAN },
      predecessorFailure: {
        sha: SECOND_FAILED_RELEASE,
        bindingSha: REPAIR_BINDING,
        window: {
          start: '2026-10-17T00:00:00.000Z',
          end: '2026-10-25T00:00:00.000Z',
        },
      },
    });
    const plan = JSON.parse(current.description.match(/\n([\s\S]*?)\n-->/)[1]);
    for (const change of [
      { end: '2026-10-25T00:00:00.000Z' },
      { incidents: PLAN.incidents },
      {
        incidents: [
          ...PLAN.incidents,
          { shortId: 'JOVIE-WEB-AB', issueId: '5' },
        ],
      },
    ])
      expect(
        inspectObservationIssue({
          ...current,
          description: marker('sentry-observation', { ...plan, ...change }),
        }).status
      ).toBe('unknown');
    for (const transform of [
      comments =>
        comments.filter(
          comment => comment.createdAt !== '2026-10-17T01:00:00Z'
        ),
      comments =>
        comments.map(comment =>
          comment.createdAt === '2026-10-17T01:00:00Z'
            ? {
                ...comment,
                body: comment.body.replace(
                  '2026-10-16T14:22:48Z',
                  '2026-10-16T14:22:49Z'
                ),
              }
            : comment
        ),
      comments =>
        comments.map(comment =>
          comment.createdAt === '2026-10-17T01:00:00Z'
            ? { ...comment, createdAt: '2026-10-17T19:00:00Z' }
            : comment
        ),
      comments =>
        comments.map(comment =>
          comment.createdAt === '2026-10-17T18:00:00Z'
            ? {
                ...comment,
                body: comment.body.replace(
                  '"status":"fail"',
                  '"status":"pass"'
                ),
              }
            : comment
        ),
      comments =>
        comments.filter(
          comment => comment.createdAt !== '2026-10-16T19:00:00Z'
        ),
    ])
      expect(
        inspectObservationIssue({
          ...current,
          comments: transform(current.comments),
        }).status
      ).toBe('unknown');
  });

  it('keeps the timely original archive when identical content is repeated after its failure', () => {
    const current = sameEpisodeRepairIssue();
    current.comments.push({
      body: marker('sentry-observation', PLAN),
      createdAt: '2026-10-16T20:30:00Z',
    });
    expect(inspectObservationIssue(current)).toMatchObject({
      status: 'registered',
      predecessorFailure: {
        sha: FAILED_RELEASE,
        recordedAt: '2026-10-16T20:00:00Z',
      },
    });
  });

  it.each([
    {
      name: 'identical later archive',
      change: {},
      removeTimely: false,
      status: 'registered',
    },
    {
      name: 'changed latest content',
      change: { end: '2026-10-25T00:00:01.000Z' },
      removeTimely: false,
      status: 'unknown',
    },
    {
      name: 'future-only archive',
      change: {},
      removeTimely: true,
      status: 'unknown',
    },
    {
      name: 'non-current episode only',
      change: { episodeStartedAt: '2026-10-17T00:00:00.000Z' },
      removeTimely: true,
      status: 'unknown',
    },
    {
      name: 'non-current episode alongside current proof',
      change: { episodeStartedAt: '2026-10-17T00:00:00.000Z' },
      removeTimely: false,
      status: 'registered',
    },
  ])(
    'preserves predecessor chronology with $name',
    ({ change, removeTimely, status }) => {
      const current = repeatedRepairIssue();
      const timely = current.comments.find(
        comment => comment.createdAt === '2026-10-17T01:00:00Z'
      );
      if (!timely) throw new Error('Missing retained predecessor fixture');
      const plan = JSON.parse(timely.body.match(/\n([\s\S]*?)\n-->/)[1]);
      if (removeTimely)
        current.comments = current.comments.filter(
          comment => comment !== timely
        );
      current.comments.push({
        body: marker('sentry-observation', { ...plan, ...change }),
        createdAt: '2026-10-17T19:00:00Z',
      });
      expect(inspectObservationIssue(current).status).toBe(status);
    }
  );

  it('validates a later failed repair inside a reopened episode against its own retained predecessor', () => {
    const episode = '2026-10-24T00:00:00.000Z';
    const predecessor = {
      ...PLAN,
      bindingSha: REPAIR_BINDING,
      episodeStartedAt: episode,
      start: episode,
      end: '2026-10-31T00:00:00.000Z',
      originalObservation: PLAN,
    };
    const successor = {
      ...predecessor,
      bindingSha: SECOND_REPAIR_BINDING,
      start: '2026-10-25T00:00:00.000Z',
      end: '2026-11-01T00:00:00.000Z',
    };
    const current = {
      ...issue(successor),
      history: [
        {
          createdAt: episode,
          fromState: { type: 'completed' },
          toState: { type: 'started' },
        },
      ],
      comments: [
        ...issue().comments,
        {
          body: marker('sentry-observation', PLAN),
          createdAt: '2026-10-16T19:00:00Z',
        },
        {
          body: marker('validation-manifest', {
            schema: 'jovie.validation-manifest/v1',
            issue: PLAN.issue,
            bindingSha: REPAIR_BINDING,
          }),
          createdAt: episode,
        },
        {
          body: marker('sentry-observation', predecessor),
          createdAt: '2026-10-24T01:00:00Z',
        },
        {
          body: formatValidationReceipt({
            issue: PLAN.issue,
            kind: 'outcome',
            status: 'fail',
            sha: SECOND_FAILED_RELEASE,
            evidence: `https://jovie.sentry.io/issues/2/events/${'e'.repeat(32)}/`,
            episodeStartedAt: episode,
          }),
          createdAt: '2026-10-24T18:00:00Z',
        },
        {
          body: marker('validation-manifest', {
            schema: 'jovie.validation-manifest/v1',
            issue: PLAN.issue,
            bindingSha: SECOND_REPAIR_BINDING,
          }),
          createdAt: successor.start,
        },
      ],
    };
    expect(inspectObservationIssue(current)).toMatchObject({
      status: 'registered',
      episodeStartedAt: episode,
      predecessorFailure: {
        bindingSha: REPAIR_BINDING,
        sha: SECOND_FAILED_RELEASE,
      },
    });
    expect(
      inspectObservationIssue({
        ...current,
        comments: current.comments.filter(
          comment => comment.createdAt !== '2026-10-24T18:00:00Z'
        ),
      }).status
    ).toBe('unknown');
  });

  it('holds stale or unreadable episodes, mismatched manifests and ambiguous registration', () => {
    const reopened = {
      ...issue(),
      history: [
        {
          createdAt: '2026-10-16T16:00:00Z',
          fromState: { type: 'completed' },
          toState: { type: 'started' },
        },
      ],
    };
    expect(inspectObservationIssue(reopened).reason).toBe(
      'stale_acceptance_episode'
    );
    reopened.history[0].createdAt = 'unreadable';
    expect(inspectObservationIssue(reopened).reason).toBe(
      'acceptance_episode_unreadable'
    );
    expect(inspectObservationIssue({ ...issue(), comments: [] }).reason).toBe(
      'binding_manifest_mismatch'
    );
    expect(
      inspectObservationIssue({
        ...issue(),
        description: issue().description.repeat(2),
      }).reason
    ).toBe('observation_registration_ambiguous');
    expect(
      inspectObservationIssue({
        ...issue(),
        description: '<!-- sentry-observation:v1 {bad} -->',
      }).reason
    ).toBe('observation_registration_unreadable');
  });

  it('retains the original8523 registration while accepting a new full reopened episode', () => {
    const episode = '2026-10-24T00:00:00.000Z';
    const successor = {
      ...PLAN,
      bindingSha: 'f'.repeat(40),
      episodeStartedAt: episode,
      start: episode,
      end: '2026-10-31T00:00:00.000Z',
      originalObservation: PLAN,
    };
    const reopened = {
      ...issue(successor),
      history: [
        {
          createdAt: episode,
          fromState: { type: 'completed' },
          toState: { type: 'started' },
        },
      ],
      comments: [
        ...issue().comments,
        {
          body: marker('sentry-observation', PLAN),
          createdAt: '2026-10-16T14:22:49Z',
        },
        {
          body: marker('validation-manifest', {
            issue: PLAN.issue,
            bindingSha: successor.bindingSha,
          }),
          createdAt: episode,
        },
      ],
    };
    expect(inspectObservationIssue(reopened)).toMatchObject({
      status: 'registered',
      plan: successor,
    });
    for (const originalObservation of [
      undefined,
      { ...PLAN, start: '2026-10-16T14:22:47Z' },
    ]) {
      expect(
        inspectObservationIssue({
          ...reopened,
          description: marker('sentry-observation', {
            ...successor,
            originalObservation,
          }),
        }).reason
      ).toBe('incident_acceptance_changed');
    }
    for (const comments of [
      reopened.comments.filter(
        comment => !comment.body.includes('sentry-observation')
      ),
      reopened.comments.map(comment =>
        comment.body.includes('sentry-observation')
          ? { ...comment, createdAt: episode }
          : comment
      ),
    ]) {
      expect(inspectObservationIssue({ ...reopened, comments }).reason).toBe(
        'original_observation_provenance_unavailable'
      );
    }
    const old = {
      ...PLAN,
      incidents: [...PLAN.incidents, { shortId: 'JOVIE-WEB-EXTRA' }],
    };
    expect(
      inspectObservationIssue({
        ...reopened,
        description: marker('sentry-observation', {
          ...successor,
          originalObservation: old,
        }),
        comments: reopened.comments.map(comment =>
          comment.body.includes('sentry-observation')
            ? { ...comment, body: marker('sentry-observation', old) }
            : comment
        ),
      }).reason
    ).toBe('original_observation_provenance_unavailable');
    expect(
      inspectObservationIssue({
        ...reopened,
        description: marker('sentry-observation', {
          ...successor,
          end: '2026-10-30T00:00:00.000Z',
        }),
      }).reason
    ).toBe('invalid_observation_registration');
  });

  it('accepts a same-episode repair window only after retained failure and a later new binding manifest', () => {
    const repaired = sameEpisodeRepairIssue();
    expect(inspectObservationIssue(repaired)).toMatchObject({
      status: 'registered',
      episodeStartedAt: null,
      predecessorFailure: {
        sha: FAILED_RELEASE,
        recordedAt: '2026-10-16T20:00:00Z',
      },
    });
    const successor = JSON.parse(
      repaired.description.match(/\n([\s\S]*?)\n-->/)[1]
    );
    for (const change of [
      { bindingSha: BINDING },
      { start: '2026-10-16T23:59:59Z' },
    ]) {
      const changed = {
        ...repaired,
        description: marker('sentry-observation', { ...successor, ...change }),
      };
      if (change.bindingSha)
        changed.comments = repaired.comments.map(comment =>
          comment.createdAt === successor.start
            ? {
                ...comment,
                body: marker('validation-manifest', {
                  schema: 'jovie.validation-manifest/v1',
                  issue: PLAN.issue,
                  bindingSha: BINDING,
                }),
              }
            : comment
        );
      expect(inspectObservationIssue(changed).reason).toBe(
        'repair_window_precedes_new_binding'
      );
    }
    const malformedManifest = {
      ...repaired,
      comments: repaired.comments.map(comment =>
        comment.createdAt === successor.start
          ? {
              ...comment,
              body: marker('validation-manifest', {
                issue: PLAN.issue,
                bindingSha: REPAIR_BINDING,
              }),
            }
          : comment
      ),
    };
    expect(inspectObservationIssue(malformedManifest).reason).toBe(
      'repair_manifest_provenance_unavailable'
    );
    const failureIndex = 2;
    for (const change of [
      null,
      { ...repaired.comments[failureIndex], createdAt: '2026-10-17T00:00:01Z' },
      {
        ...repaired.comments[failureIndex],
        body: repaired.comments[failureIndex].body.replace(
          '"status":"fail"',
          '"status":"pass"'
        ),
      },
      {
        ...repaired.comments[failureIndex],
        body: repaired.comments[failureIndex].body.replace(
          ',"episodeStartedAt":null',
          ''
        ),
      },
      {
        ...repaired.comments[failureIndex],
        body: repaired.comments[failureIndex].body.replaceAll(
          'https://jovie.sentry.io/',
          'https://example.com/'
        ),
      },
    ]) {
      const comments = repaired.comments.flatMap((comment, index) =>
        index === failureIndex ? (change ? [change] : []) : [comment]
      );
      expect(inspectObservationIssue({ ...repaired, comments }).reason).toBe(
        'failed_observation_provenance_unavailable'
      );
    }
  });

  it('permits a new generic episode only with a new full window and matching binding', () => {
    const plan = {
      ...PLAN,
      issue: 'JOV-9000',
      start: '2026-10-17T00:00:00Z',
      end: '2026-10-24T00:00:00Z',
      episodeStartedAt: '2026-10-17T00:00:00.000Z',
    };
    const reopened = {
      ...issue(plan),
      identifier: plan.issue,
      comments: [
        {
          body: marker('validation-manifest', {
            issue: plan.issue,
            bindingSha: BINDING,
          }),
          createdAt: plan.start,
        },
      ],
      history: [
        {
          createdAt: plan.start,
          fromState: { type: 'completed' },
          toState: { type: 'started' },
        },
      ],
    };
    expect(inspectObservationIssue(reopened).status).toBe('registered');
    reopened.description = marker('sentry-observation', {
      ...plan,
      start: START,
    });
    expect(inspectObservationIssue(reopened).reason).toBe(
      'invalid_observation_registration'
    );
  });
});

describe('seven-day Sentry event observation', () => {
  it('keeps a complete empty elapsed window pending and a full empty window unknown', async () => {
    const sentry = sentryPort();
    const facts = { contains: vi.fn() };
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date(START),
        sentry,
        facts,
      })
    ).toMatchObject({ status: 'pending', reason: 'observation_not_started' });
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date('2026-10-20T00:00:00Z'),
        sentry,
        facts,
      })
    ).toEqual({
      status: 'pending',
      reason: 'full_observation_window_pending',
      earliestCompletion: END,
    });
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date(END),
        sentry,
        facts,
      })
    ).toEqual({
      status: 'unknown',
      reason: 'observation_coverage_unavailable',
    });
    expect(
      sentry.mock.calls.filter(([path]) => path.includes('/events/'))
    ).toHaveLength(6);
    for (const [path] of sentry.mock.calls.filter(([path]) =>
      path.includes('/events/')
    )) {
      const params = new URL(`https://sentry.io${path}`).searchParams;
      expect(params.get('start')).toBe(START);
      expect(params.getAll('environment')).toEqual([]);
      expect(params.get('query')).toBe(
        'environment:[vercel-production,production,prd]'
      );
      expect(params.has('statsPeriod')).toBe(false);
    }
  });

  it('reads quiet history when an accepted production alias does not exist in Sentry', async () => {
    const base = sentryPort();
    const sentry = vi.fn(async path => {
      if (!path.includes('/events/')) return base(path);
      const params = new URL(`https://sentry.io${path}`).searchParams;
      // Sentry resolves every environment parameter first. An absent name
      // returns 200 [] before its paginator, so there is no Link header.
      if (params.getAll('environment').includes('prd'))
        return { ok: true, body: [] };
      if (
        params.get('query') !== 'environment:[vercel-production,production,prd]'
      )
        return { ok: false };
      return { ok: true, body: [], link: link(false) };
    });
    const input = { plan: PLAN, sentry, facts: { contains: vi.fn() } };
    expect(
      await observeSentryHistory({
        ...input,
        now: new Date('2026-10-20T00:00:00Z'),
      })
    ).toEqual({
      status: 'pending',
      reason: 'full_observation_window_pending',
      earliestCompletion: END,
    });
    expect(
      await observeSentryHistory({ ...input, now: new Date(END) })
    ).toEqual({
      status: 'unknown',
      reason: 'observation_coverage_unavailable',
    });
    expect(input.facts.contains).not.toHaveBeenCalled();
  });

  it.each(['vercel-production', 'production', 'prd'])(
    'detects a descendant recurrence in the %s production alias',
    async environment => {
      const sentry = sentryPort([
        { ...event(), tags: [{ key: 'environment', value: environment }] },
      ]);
      const facts = { contains: vi.fn(async () => true) };
      expect(
        await observeSentryHistory({
          plan: PLAN,
          now: new Date(END),
          sentry,
          facts,
        })
      ).toMatchObject({
        status: 'fail',
        source: 'JOVIE-WEB-XZ',
        release: DESCENDANT,
      });
      expect(facts.contains).toHaveBeenCalledWith(BINDING, DESCENDANT);
    }
  );

  it('detects recurrence on later repair-containing production descendants', async () => {
    const sentry = sentryPort([event()]);
    const facts = {
      contains: vi.fn(
        async (binding, release) =>
          binding === BINDING && release === DESCENDANT
      ),
    };
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date(END),
        sentry,
        facts,
      })
    ).toMatchObject({
      status: 'fail',
      source: 'JOVIE-WEB-XZ',
      release: DESCENDANT,
      evidence: `https://jovie.sentry.io/issues/1/events/${'d'.repeat(32)}/`,
    });
    expect(facts.contains).toHaveBeenCalledWith(BINDING, DESCENDANT);
  });

  it('does not confuse events from older releases or unidentifiable events with recurrence proof', async () => {
    const facts = { contains: vi.fn(async () => false) };
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date(END),
        sentry: sentryPort([event()]),
        facts,
      })
    ).toMatchObject({
      status: 'unknown',
      reason: 'observation_coverage_unavailable',
    });
    for (const bad of [
      { ...event(), release: null },
      { ...event(), dateCreated: 'bad' },
      { ...event(), tags: [] },
      { ...event(), eventID: null },
    ]) {
      expect(
        await observeSentryHistory({
          plan: PLAN,
          now: new Date(END),
          sentry: sentryPort([bad]),
          facts,
        })
      ).toMatchObject({
        status: 'unknown',
        reason: 'event_identity_unreadable:JOVIE-WEB-XZ',
      });
    }
  });

  it('requires every incident and explicit complete pagination, never follows a Link origin', async () => {
    const facts = { contains: vi.fn(async () => false) };
    for (const response of [
      { ok: false },
      { ok: true, body: {} },
      { ok: true, body: [], link: '' },
      { ok: true, body: [], link: link(true) },
    ]) {
      const base = sentryPort();
      const sentry = vi.fn(path =>
        path.includes('/events/') ? response : base(path)
      );
      const result = await observeSentryHistory({
        plan: PLAN,
        now: new Date(END),
        sentry,
        facts,
      });
      expect(result.status).toBe('unknown');
      expect(result.reason).not.toBe('observation_coverage_unavailable');
      expect(
        sentry.mock.calls.every(([path]) =>
          path.startsWith('/organizations/jovie/')
        )
      ).toBe(true);
    }
    const base = sentryPort();
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date(END),
        facts,
        sentry: path =>
          path.includes('/shortids/JOVIE-WEB-S7/')
            ? { ok: false, body: {} }
            : base(path),
      })
    ).toMatchObject({
      status: 'unknown',
      reason: 'incident_identity_unreadable:JOVIE-WEB-S7',
    });
  });

  it('reads later pages and detects recurrence without requiring a quiet full window', async () => {
    const base = sentryPort();
    const sentry = vi.fn(path =>
      !path.includes('/events/')
        ? base(path)
        : path.includes('cursor=')
          ? { ok: true, body: [event()], link: link(false) }
          : {
              ok: true,
              body: [],
              link: '<https://untrusted.invalid/other?query=environment:development>; rel="next"; results="true"; cursor="0:100:0"',
            }
    );
    expect(
      await observeSentryHistory({
        plan: PLAN,
        now: new Date('2026-10-18T00:00:00Z'),
        sentry,
        facts: { contains: async () => true },
      })
    ).toMatchObject({ status: 'fail' });
    expect(sentry.mock.calls[2][0]).toContain('cursor=0%3A100%3A0');
    for (const [path] of sentry.mock.calls.filter(([path]) =>
      path.includes('/events/')
    )) {
      expect(path.startsWith('/organizations/jovie/issues/1/events/?')).toBe(
        true
      );
      const params = new URL(`https://sentry.io${path}`).searchParams;
      expect(params.get('query')).toBe(
        'environment:[vercel-production,production,prd]'
      );
      expect(params.has('environment')).toBe(false);
      expect(params.get('start')).toBe(START);
      expect(params.get('end')).toBe('2026-10-18T00:00:00.000Z');
      expect(params.get('per_page')).toBe('100');
    }
  });
});

function harness({
  recurrence = true,
  stateChanged = false,
  staleEpisode = false,
  readback = true,
  duplicate = false,
  reopenDuringWrite = false,
  reworkDuringWrite = false,
  registeredIssue = issue(),
  recurrenceAt = event().dateCreated,
} = {}) {
  let reads = 0;
  let recordedBody;
  const facts = {
    servedGeneration: vi.fn(async () => ({
      status: 'verified',
      sha: ARTIFACT,
    })),
    contains: vi.fn(async () => true),
  };
  const sentry = sentryPort(
    recurrence ? [{ ...event(), dateCreated: recurrenceAt }] : []
  );
  const fetchImpl = vi.fn(async (url, init) => {
    if (String(url).startsWith('https://sentry.io/api/0')) {
      const result = await sentry(
        String(url).slice('https://sentry.io/api/0'.length)
      );
      return new Response(JSON.stringify(result.body), {
        status: 200,
        headers: { link: result.link ?? '' },
      });
    }
    const body = JSON.parse(init.body);
    if (body.query.includes('ObservationRegistrations'))
      return new Response(
        JSON.stringify({
          data: {
            issues: {
              nodes: [
                {
                  identifier: (registeredIssue ?? issue()).identifier,
                  description: (registeredIssue ?? issue()).description,
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        })
      );
    const raw = structuredClone(registeredIssue ?? issue());
    reads += 1;
    if (reads >= 2 && stateChanged) raw.state.name = 'Done';
    if (recordedBody && reworkDuringWrite) raw.state.name = 'Rework';
    if (reads >= 2 && staleEpisode)
      raw.description = marker('sentry-observation', {
        ...PLAN,
        episodeStartedAt: '2026-10-17T00:00:00Z',
      });
    if ((readback || duplicate) && recordedBody)
      raw.comments.push({
        body: recordedBody,
        createdAt: '2026-10-23T14:23:00Z',
      });
    if (reopenDuringWrite && recordedBody)
      raw.history.push({
        createdAt: '2026-10-23T14:22:59Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      });
    return new Response(
      JSON.stringify({
        data: {
          issue: {
            ...raw,
            comments: { nodes: raw.comments, pageInfo: { hasNextPage: false } },
            history: { nodes: raw.history, pageInfo: { hasNextPage: false } },
          },
        },
      })
    );
  });
  const recordReceipt = vi.fn(async args => {
    const { formatValidationReceipt } = await import(
      '../validation-lifecycle.mjs'
    );
    const value = key => args[args.indexOf(key) + 1];
    recordedBody = formatValidationReceipt({
      issue: value('--issue'),
      kind: value('--kind'),
      status: value('--status'),
      sha: value('--sha'),
      evidence: value('--evidence'),
      note: value('--note'),
      episodeStartedAt:
        value('--episode-started-at') === 'null'
          ? null
          : value('--episode-started-at'),
    });
    return recordedBody;
  });
  const options = {
    apiKey: 'linear-fixture',
    githubToken: 'github-fixture',
    sentryToken: 'sentry-fixture',
    now: new Date(END),
    fetchImpl,
    facts,
    recordReceipt,
  };
  return { options, fetchImpl, facts, recordReceipt };
}

describe('existing recurrence producer owner handoff', () => {
  it('cannot apply an old-window failure when the issue reopens during receipt creation', async () => {
    const h = harness({ reopenDuringWrite: true });
    expect(
      (await runSentryValidationObservations(h.options)).results[0]
    ).toMatchObject({
      status: 'unknown',
      reason: 'observation_registration_changed_after_write',
    });
    const finalIssue =
      /** @type {{data: {issue: {comments: {nodes: {body: string, createdAt: string}[]}}}}} */ (
        await h
          .fetchImpl('https://api.linear.app/graphql', {
            body: JSON.stringify({ query: 'ReadObservationIssue' }),
          })
          .then(response => response.json())
      );
    const receipts = parseValidationReceipts(
      finalIssue.data.issue.comments.nodes,
      'JOV-8523'
    ).map(receipt => ({
      ...receipt,
      containsBinding: true,
      verifiedArtifact: true,
    }));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].episodeStartedAt).toBeNull();
    expect(currentReceiptsByKind(receipts, '2026-10-23T14:22:59Z').size).toBe(
      0
    );
  });

  it('preserves verified recurrence and exact state readback when canonical reconciliation advances to Rework', async () => {
    const h = harness({ reworkDuringWrite: true });
    expect(
      (await runSentryValidationObservations(h.options)).results[0]
    ).toMatchObject({
      status: 'fail',
      receipt: 'verified',
      stateReadback: 'Rework',
      release: DESCENDANT,
    });
    expect(h.recordReceipt).toHaveBeenCalledOnce();
    expect(
      h.fetchImpl.mock.calls.every(
        ([, init]) => !String(init?.body).includes('issueUpdate')
      )
    ).toBe(true);
  });

  it('requires positive ordered generation ancestry for a same-episode repair successor', async () => {
    const valid = harness({ registeredIssue: sameEpisodeRepairIssue() });
    expect(
      (await runSentryValidationObservations(valid.options)).results[0]
    ).toMatchObject({ status: 'fail', receipt: 'verified' });
    expect(valid.facts.contains).toHaveBeenCalledWith(BINDING, FAILED_RELEASE);
    expect(valid.facts.contains).toHaveBeenCalledWith(
      FAILED_RELEASE,
      REPAIR_BINDING
    );
    for (const missing of ['original', 'repair']) {
      const h = harness({ registeredIssue: sameEpisodeRepairIssue() });
      h.facts.contains.mockImplementation(
        async (base, head) =>
          !(missing === 'original'
            ? base === BINDING && head === FAILED_RELEASE
            : base === FAILED_RELEASE && head === REPAIR_BINDING)
      );
      expect(
        (await runSentryValidationObservations(h.options)).results[0]
      ).toMatchObject({
        status: 'unknown',
        reason: 'repair_binding_not_after_failed_generation',
      });
      expect(h.recordReceipt).not.toHaveBeenCalled();
      expect(
        h.fetchImpl.mock.calls.every(
          ([url]) => !String(url).includes('sentry.io')
        )
      ).toBe(true);
    }
  });

  it('proves every predecessor ancestry edge before observing a second same-episode repaired generation', async () => {
    const valid = harness({
      registeredIssue: repeatedRepairIssue(),
      recurrenceAt: '2026-10-19T00:00:00Z',
    });
    expect(
      (await runSentryValidationObservations(valid.options)).results[0]
    ).toMatchObject({ status: 'fail', receipt: 'verified' });
    expect(valid.facts.contains).toHaveBeenCalledWith(
      BINDING,
      SECOND_FAILED_RELEASE
    );
    expect(valid.facts.contains).toHaveBeenCalledWith(
      REPAIR_BINDING,
      SECOND_FAILED_RELEASE
    );
    expect(valid.facts.contains).toHaveBeenCalledWith(
      SECOND_FAILED_RELEASE,
      SECOND_REPAIR_BINDING
    );
    const broken = harness({
      registeredIssue: repeatedRepairIssue(),
      recurrenceAt: '2026-10-19T00:00:00Z',
    });
    broken.facts.contains.mockImplementation(
      async (base, head) =>
        !(base === REPAIR_BINDING && head === SECOND_FAILED_RELEASE)
    );
    expect(
      (await runSentryValidationObservations(broken.options)).results[0]
    ).toMatchObject({
      status: 'unknown',
      reason: 'repair_binding_not_after_failed_generation',
    });
    expect(broken.recordReceipt).not.toHaveBeenCalled();
    const brokenEarlierRepair = harness({
      registeredIssue: repeatedRepairIssue(),
      recurrenceAt: '2026-10-19T00:00:00Z',
    });
    brokenEarlierRepair.facts.contains.mockImplementation(
      async (base, head) =>
        !(base === FAILED_RELEASE && head === REPAIR_BINDING)
    );
    expect(
      (await runSentryValidationObservations(brokenEarlierRepair.options))
        .results[0]
    ).toMatchObject({
      status: 'unknown',
      reason: 'repair_binding_not_after_failed_generation',
    });
    expect(brokenEarlierRepair.recordReceipt).not.toHaveBeenCalled();
    expect(
      broken.fetchImpl.mock.calls.every(
        ([url]) => !String(url).includes('sentry.io')
      )
    ).toBe(true);
  });

  it('fences changed historical predecessor proof during a receipt write', async () => {
    const registered = repeatedRepairIssue();
    const h = harness({
      registeredIssue: registered,
      recurrenceAt: '2026-10-19T00:00:00Z',
    });
    const original = h.recordReceipt.getMockImplementation();
    h.recordReceipt.mockImplementation(async args => {
      const result = await original(args);
      registered.comments[2].body = registered.comments[2].body.replace(
        '"status":"fail"',
        '"status":"pass"'
      );
      return result;
    });
    expect(
      (await runSentryValidationObservations(h.options)).results[0]
    ).toMatchObject({
      status: 'unknown',
      reason: 'observation_registration_changed_after_write',
    });
    expect(h.recordReceipt).toHaveBeenCalledTimes(1);
  });

  it('records and reads back only a genuine failure through the canonical writer', async () => {
    const h = harness();
    const result = await runSentryValidationObservations(h.options);
    expect(result.results[0]).toMatchObject({
      issue: 'JOV-8523',
      status: 'fail',
      receipt: 'verified',
      artifact: { status: 'verified', sha: ARTIFACT },
      bindingSha: BINDING,
      episodeStartedAt: null,
      window: { start: START, end: END },
      incidents: PLAN.incidents,
    });
    expect(h.recordReceipt).toHaveBeenCalledTimes(1);
    expect(h.recordReceipt.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['--status', 'fail', '--sha', DESCENDANT])
    );
    expect(
      h.fetchImpl.mock.calls.every(
        ([, init]) => !String(init?.body).includes('issueUpdate')
      )
    ).toBe(true);
    expect(
      (await runSentryValidationObservations(h.options)).results[0].receipt
    ).toBe('already_recorded');
    expect(h.recordReceipt).toHaveBeenCalledTimes(1);
  });

  it('keeps the failure bound to the observed generation across newer served deployments', async () => {
    const h = harness();
    await runSentryValidationObservations(h.options);
    const args = h.recordReceipt.mock.calls[0][0];
    expect(args[args.indexOf('--sha') + 1]).toBe(DESCENDANT);
    expect(args[args.indexOf('--sha') + 1]).not.toBe(ARTIFACT);
    const newer = 'e'.repeat(40);
    h.facts.servedGeneration.mockResolvedValue({
      status: 'verified',
      sha: newer,
    });
    const result = await runSentryValidationObservations(h.options);
    expect(result.results[0]).toMatchObject({
      receipt: 'already_recorded',
      artifact: { sha: newer },
      release: DESCENDANT,
    });
    expect(h.recordReceipt).toHaveBeenCalledTimes(1);
  });

  it('never records pass from silence or bypasses the disabled-writer switch', async () => {
    const quiet = harness({ recurrence: false });
    expect(
      (await runSentryValidationObservations(quiet.options)).results[0]
    ).toMatchObject({
      status: 'unknown',
      reason: 'observation_coverage_unavailable',
    });
    expect(quiet.recordReceipt).not.toHaveBeenCalled();
    const disabled = harness();
    expect(
      (
        await runSentryValidationObservations({
          ...disabled.options,
          writeReceipts: false,
        })
      ).results[0]
    ).toMatchObject({ status: 'fail' });
    expect(disabled.recordReceipt).not.toHaveBeenCalled();
  });

  it('re-reads current state/episode before mutation and fails closed on absent artifact or readback', async () => {
    for (const changes of [{ stateChanged: true }, { staleEpisode: true }]) {
      const h = harness(changes);
      expect(
        (await runSentryValidationObservations(h.options)).results[0].reason
      ).toBe('observation_registration_changed');
      expect(h.recordReceipt).not.toHaveBeenCalled();
    }
    const h = harness({ readback: false });
    expect(
      (await runSentryValidationObservations(h.options)).results[0].reason
    ).toBe('receipt_readback_failed');
    h.facts.servedGeneration.mockResolvedValue({
      status: 'unknown',
      sha: ARTIFACT,
    });
    expect((await runSentryValidationObservations(h.options)).reason).toBe(
      'verified_production_artifact_unavailable'
    );
  });

  it('fails closed on incomplete Linear scans and does no work without its existing key', async () => {
    expect(await runSentryValidationObservations({ apiKey: '' })).toEqual({
      ok: false,
      results: [],
      reason: 'missing_linear_api_key',
    });
    const h = harness();
    h.fetchImpl.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { issues: { nodes: [], pageInfo: { hasNextPage: true } } },
        })
      )
    );
    expect((await runSentryValidationObservations(h.options)).reason).toBe(
      'linear_registration_scan_incomplete'
    );
    expect(h.recordReceipt).not.toHaveBeenCalled();
  });
});

describe('supplementary existing-authority error coverage join', () => {
  const now = new Date('2026-10-16T15:22:48Z');
  const stats = () => ({
    start: '2026-10-16T14:00:00Z',
    end: '2026-10-16T16:00:00Z',
    intervals: ['2026-10-16T14:00:00Z', '2026-10-16T15:00:00Z'],
    groups: [
      {
        by: { outcome: 'accepted', reason: 'none' },
        totals: { 'sum(quantity)': 894 },
        series: { 'sum(quantity)': [400, 494] },
      },
      {
        by: { outcome: 'client_discard', reason: 'event_processor' },
        totals: { 'sum(quantity)': 5 },
        series: { 'sum(quantity)': [2, 3] },
      },
      {
        by: { outcome: 'client_discard', reason: 'network_error' },
        totals: { 'sum(quantity)': 8 },
        series: { 'sum(quantity)': [0, 8] },
      },
    ],
  });
  const port = value =>
    vi.fn(async path =>
      path.startsWith('/projects/')
        ? { ok: true, body: { id: '4510479236792320', slug: 'jovie-web' } }
        : { ok: true, body: value }
    );

  it('retains real-format loss totals and rounded query bounds without asserting production exposure or pass', async () => {
    const sentry = port(stats());
    const result = await collectObservationCoverage({
      plan: PLAN,
      now,
      sentry,
    });
    expect(result).toMatchObject({
      status: 'unknown',
      read: 'verified_project_aggregate',
      requested: { start: START, end: now.toISOString() },
      reported: { start: '2026-10-16T14:00:00Z', end: '2026-10-16T16:00:00Z' },
      outcomes: [
        { outcome: 'accepted', total: 894 },
        { outcome: 'client_discard', reason: 'event_processor', total: 5 },
        { outcome: 'client_discard', reason: 'network_error', total: 8 },
      ],
    });
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        'unattributed_error_delivery_loss',
        'production_error_attribution_unavailable',
        'retention_unavailable',
        'authenticated_contacts_exposure_unavailable',
      ])
    );
    const query = new URL('https://sentry.io' + sentry.mock.calls[1][0])
      .searchParams;
    expect(query.get('project')).toBe('4510479236792320');
    expect(query.get('category')).toBe('error');
    expect(query.getAll('groupBy')).toEqual(['outcome', 'reason']);
    expect(query.has('environment')).toBe(false);
  });

  it('keeps a complete quiet/accepted aggregate unknown and does not extend the episode interval', async () => {
    const value = stats();
    value.groups = [];
    expect(
      await collectObservationCoverage({ plan: PLAN, now, sentry: port(value) })
    ).toMatchObject({
      status: 'unknown',
      read: 'verified_project_aggregate',
    });
    const sentry = port(value);
    const result = await collectObservationCoverage({
      plan: PLAN,
      now: new Date('2026-10-24T00:00:00Z'),
      sentry,
    });
    expect(result).toMatchObject({
      requested: { end: new Date(END).toISOString() },
    });
    expect(result.status).toBe('unknown');
  });

  it('does not invent a project contract or observe before the accepted start', async () => {
    const sentry = port(stats());
    expect(
      await collectObservationCoverage({
        plan: { ...PLAN, issue: 'JOV-9000' },
        now,
        sentry,
      })
    ).toMatchObject({
      status: 'unknown',
      read: 'project_contract_unavailable',
    });
    expect(
      await collectObservationCoverage({
        plan: PLAN,
        now: new Date(START),
        sentry,
      })
    ).toMatchObject({
      status: 'unknown',
      read: 'observation_not_started',
    });
    expect(sentry).not.toHaveBeenCalled();
  });

  it('holds partial, malformed, denied or missing outcome history unknown', async () => {
    const malformed = [
      null,
      { ...stats(), intervals: [] },
      { ...stats(), intervals: [START] },
      { ...stats(), end: '2026-10-16T14:30:00Z' },
      {
        ...stats(),
        groups: [{ ...stats().groups[0], series: { 'sum(quantity)': [894] } }],
      },
      {
        ...stats(),
        groups: [
          { ...stats().groups[0], series: { 'sum(quantity)': [-1, 895] } },
        ],
      },
      {
        ...stats(),
        groups: [{ ...stats().groups[0], totals: { 'sum(quantity)': 895 } }],
      },
    ];
    for (const value of malformed)
      expect(
        await collectObservationCoverage({
          plan: PLAN,
          now,
          sentry: port(value),
        })
      ).toMatchObject({
        status: 'unknown',
        read: 'outcome_statistics_incomplete',
      });
    const denied = vi.fn(async () => ({ ok: false }));
    expect(
      await collectObservationCoverage({ plan: PLAN, now, sentry: denied })
    ).toMatchObject({
      status: 'unknown',
      read: 'project_identity_unreadable',
    });
    const failed = vi.fn(async () => {
      throw new Error('transport unavailable');
    });
    expect(
      await collectObservationCoverage({ plan: PLAN, now, sentry: failed })
    ).toMatchObject({
      status: 'unknown',
      read: 'outcome_statistics_unreadable',
    });
  });
});

describe('authored synthetic alert-hygiene observation contract', () => {
  const plan = {
    ...PLAN,
    issue: 'JOV-4312',
    start: '2026-10-17T00:00:00Z',
    end: '2026-10-19T00:00:00Z',
    incidents: [{ shortId: 'JOVIE-WEB-QH' }],
  };
  const registered = (value = plan) => ({
    ...issue(value),
    identifier: value.issue,
    comments: [
      {
        body: marker('validation-manifest', {
          schema: 'jovie.validation-manifest/v1',
          issue: value.issue,
          bindingSha: BINDING,
        }),
        createdAt: value.start,
      },
    ],
  });

  it('accepts the authored full48h QH window without changing the seven-day default', () => {
    expect(inspectObservationIssue(registered())).toMatchObject({
      status: 'registered',
      plan,
    });
    expect(MINIMUM_OBSERVATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    for (const value of [
      { ...plan, end: '2026-10-18T23:59:59.999Z' },
      { ...plan, issue: 'JOV-9000' },
      { ...PLAN, end: '2026-10-18T14:22:48Z' },
    ]) {
      expect(inspectObservationIssue(registered(value)).status).toBe('unknown');
    }
  });

  it('rejects substituting another incident or organization for the authored QH denominator', () => {
    for (const value of [
      { ...plan, incidents: [{ shortId: 'JOVIE-WEB-OTHER' }] },
      { ...plan, organization: 'other-org' },
      {
        ...plan,
        incidents: [...plan.incidents, { shortId: 'JOVIE-WEB-OTHER' }],
      },
    ]) {
      expect(inspectObservationIssue(registered(value))).toMatchObject({
        status: 'unknown',
        reason: 'incident_acceptance_changed',
      });
    }
  });

  it('preserves episode fences for the shorter authored contract', () => {
    const value = registered();
    value.history = [
      {
        fromState: { type: 'completed' },
        toState: { type: 'started' },
        createdAt: '2026-10-17T01:00:00Z',
      },
    ];
    expect(inspectObservationIssue(value).reason).toBe(
      'stale_acceptance_episode'
    );
  });

  it('keeps native empty full48h history unknown and detects a real-format descendant recurrence', async () => {
    const sentry = events =>
      vi.fn(async path =>
        path.includes('/shortids/')
          ? {
              ok: true,
              body: { group: { id: '7603287323', shortId: 'JOVIE-WEB-QH' } },
            }
          : { ok: true, body: events, link: link(false) }
      );
    const input = {
      plan,
      now: new Date(plan.end),
      facts: { contains: async () => true },
    };
    expect(
      await observeSentryHistory({ ...input, sentry: sentry([]) })
    ).toMatchObject({
      status: 'unknown',
      reason: 'observation_coverage_unavailable',
    });
    expect(
      await observeSentryHistory({ ...input, sentry: sentry([event()]) })
    ).toMatchObject({
      status: 'fail',
      source: 'JOVIE-WEB-QH',
      release: DESCENDANT,
    });
  });

  it('hands a native-format48h recurrence to the same canonical writer with exact release and episode', async () => {
    const h = harness({ registeredIssue: registered() });
    const result = await runSentryValidationObservations({
      ...h.options,
      now: new Date(plan.end),
    });
    expect(result.results[0]).toMatchObject({
      issue: 'JOV-4312',
      status: 'fail',
      receipt: 'verified',
      window: { start: plan.start, end: plan.end },
      episodeStartedAt: null,
      release: DESCENDANT,
    });
    const args = h.recordReceipt.mock.calls[0][0];
    expect(args[args.indexOf('--issue') + 1]).toBe('JOV-4312');
    expect(args[args.indexOf('--sha') + 1]).toBe(DESCENDANT);
    expect(args[args.indexOf('--episode-started-at') + 1]).toBe('null');
  });

  it('retains the whole48h deadline and never writes a receipt for a pending quiet window', async () => {
    const h = harness({ registeredIssue: registered(), recurrence: false });
    const result = await runSentryValidationObservations({
      ...h.options,
      now: new Date(Date.parse(plan.end) - 1),
    });
    expect(result.results[0]).toMatchObject({
      issue: 'JOV-4312',
      status: 'pending',
      earliestCompletion: plan.end,
      window: { start: plan.start, end: plan.end },
    });
    expect(h.recordReceipt).not.toHaveBeenCalled();
  });

  it('cannot infer a historical post-deploy start from current verified artifact ancestry', async () => {
    const past = {
      ...plan,
      start: '2026-10-12T00:00:00Z',
      end: '2026-10-14T00:00:00Z',
    };
    const current = registered(past);
    current.comments[0].createdAt = '2026-10-17T00:00:00Z';
    const h = harness({ registeredIssue: current, recurrence: false });
    const result = await runSentryValidationObservations({
      ...h.options,
      now: new Date(plan.end),
    });
    expect(result.results[0]).toMatchObject({
      artifact: { status: 'verified', sha: ARTIFACT },
      status: 'unknown',
      coverage: {
        status: 'unknown',
        gaps: expect.arrayContaining([
          'post_deployment_window_start_unavailable',
        ]),
      },
    });
    expect(h.recordReceipt).not.toHaveBeenCalled();
  });

  it('collects real-format project loss evidence while retaining all hygiene positive-proof gaps', async () => {
    const now = new Date('2026-10-17T02:00:00Z');
    const sentry = vi.fn(async path =>
      path.startsWith('/projects/')
        ? { ok: true, body: { id: '4510479236792320', slug: 'jovie-web' } }
        : {
            ok: true,
            body: {
              start: plan.start,
              end: now.toISOString(),
              intervals: [plan.start, '2026-10-17T01:00:00Z'],
              groups: [
                {
                  by: { outcome: 'client_discard', reason: 'network_error' },
                  series: { 'sum(quantity)': [1, 2] },
                  totals: { 'sum(quantity)': 3 },
                },
              ],
            },
          }
    );
    const result = await collectObservationCoverage({ plan, now, sentry });
    expect(result).toMatchObject({
      status: 'unknown',
      read: 'verified_project_aggregate',
      requested: { start: plan.start, end: now.toISOString() },
      outcomes: [
        { outcome: 'client_discard', reason: 'network_error', total: 3 },
      ],
    });
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        'retention_unavailable',
        'production_error_attribution_unavailable',
        'synthetic_workload_unavailable',
        'post_deployment_window_start_unavailable',
        'synthetic_ci_failure_visibility_unavailable',
        'production_error_gate_evidence_unavailable',
        'unattributed_error_delivery_loss',
      ])
    );
    expect(result.gaps).not.toContain(
      'authenticated_contacts_exposure_unavailable'
    );
    const query = new URL('https://sentry.io' + sentry.mock.calls[1][0])
      .searchParams;
    expect(query.get('project')).toBe('4510479236792320');
    expect(query.has('environment')).toBe(false);
  });

  it('cannot certify a full quiet48h aggregate as continued synthetic workload or retention', async () => {
    const hours = 48;
    const sentry = vi.fn(async path =>
      path.startsWith('/projects/')
        ? { ok: true, body: { id: '4510479236792320', slug: 'jovie-web' } }
        : {
            ok: true,
            body: {
              start: plan.start,
              end: plan.end,
              groups: [],
              intervals: Array.from({ length: hours }, (_, i) =>
                new Date(Date.parse(plan.start) + i * 3600000).toISOString()
              ),
            },
          }
    );
    expect(
      await collectObservationCoverage({
        plan,
        now: new Date('2026-10-20T00:00:00Z'),
        sentry,
      })
    ).toMatchObject({
      status: 'unknown',
      read: 'verified_project_aggregate',
      requested: { end: new Date(plan.end).toISOString() },
      gaps: expect.arrayContaining([
        'retention_unavailable',
        'synthetic_workload_unavailable',
        'post_deployment_window_start_unavailable',
      ]),
    });
  });
});
