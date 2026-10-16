import { describe, expect, it, vi } from 'vitest';
import {
  collectObservationCoverage,
  inspectObservationIssue,
  MINIMUM_OBSERVATION_MS,
  OBSERVATION_SCHEMA,
  observeSentryHistory,
  runSentryValidationObservations,
} from '../sentry-validation-observation.mjs';

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
              id: String(sources.indexOf(path.split('/').at(-2)) + 1),
              shortId: path.split('/').at(-2),
            },
          },
        }
      : { ok: true, body: events, link: link(false) }
  );
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
      expect(params.getAll('environment')).toEqual([
        'vercel-production',
        'production',
        'prd',
      ]);
      expect(params.has('query')).toBe(false);
      expect(params.has('statsPeriod')).toBe(false);
    }
  });

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
          : { ok: true, body: [], link: link(true) }
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
  });
});

function harness({
  recurrence = true,
  stateChanged = false,
  staleEpisode = false,
  readback = true,
  duplicate = false,
  reworkDuringWrite = false,
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
  const sentry = sentryPort(recurrence ? [event()] : []);
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
                  identifier: 'JOV-8523',
                  description: issue().description,
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        })
      );
    const raw = issue();
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
});
