/**
 * Explicit long-window observations share the Ops/Gem Sentry recurrence clock.
 * Sentry event history can prove recurrence, but an empty history cannot prove
 * telemetry retention, delivery, or production workload. Until a maintained
 * coverage producer supplies those facts, this path never emits a pass.
 */
import { recordValidationReceipt } from './linear-sync-on-merge.mjs';
import { formatValidationReceipt } from './validation-lifecycle.mjs';
import { createProductionFacts, githubClient } from './validation-sync.mjs';

export const OBSERVATION_SCHEMA = 'jovie.sentry-observation/v1';
export const MINIMUM_OBSERVATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 10;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const LINEAR_API = 'https://api.linear.app/graphql';
const SENTRY_API = 'https://sentry.io/api/0';

/** @typedef {{ schema: string, issue: string, bindingSha: string, organization: string,
 * episodeStartedAt: string | null, start: string, end: string,
 * incidents: { shortId: string, issueId?: string }[],
 * }} ObservationPlan */
/** @typedef {{ status: 'unknown', reason: string }} UnknownObservation */
/** @typedef {UnknownObservation | { status: 'pending', reason: string, earliestCompletion?: string }
 * | { status: 'fail', reason: string, source: string, release: string, evidence: string }} ObservationResult */
/** @typedef {{ servedGeneration: () => Promise<{status: string, sha?: string}>,
 * contains: (base: string, head: string) => Promise<boolean> }} ObservationFacts */

/** @param {string} reason @returns {UnknownObservation} */
const unknown = reason => ({ status: 'unknown', reason });
const date = value => Date.parse(typeof value === 'string' ? value : '');

function markers(body, name) {
  const pattern = new RegExp(`<!--\\s*${name}:v1\\s*([\\s\\S]*?)-->`, 'g');
  return [...String(body ?? '').matchAll(pattern)].map(match =>
    JSON.parse(match[1])
  );
}

/**
 * Inspect the complete, current server history before using a registration.
 * @returns {UnknownObservation | {status: 'registered', reason?: never, plan: ObservationPlan,
 * comments: {body: string, createdAt: string}[], episodeStartedAt: string | null,
 * }}
 */
export function inspectObservationIssue(issue) {
  try {
    const comments = [...issue.comments].sort(
      (a, b) => date(a.createdAt) - date(b.createdAt)
    );
    if (comments.some(comment => !Number.isFinite(date(comment.createdAt))))
      return unknown('comment_history_unreadable');
    const plans = markers(issue.description, 'sentry-observation');
    if (plans.length !== 1)
      return unknown('observation_registration_ambiguous');
    const plan = plans[0];
    const reopenTimes = issue.history
      .filter(
        entry =>
          entry.fromState?.type === 'completed' &&
          typeof entry.toState?.type === 'string' &&
          entry.toState.type !== 'completed'
      )
      .map(entry => date(entry.createdAt));
    if (reopenTimes.some(value => !Number.isFinite(value))) {
      return unknown('acceptance_episode_unreadable');
    }
    const episodeStartedAt = reopenTimes.length
      ? new Date(Math.max(...reopenTimes)).toISOString()
      : null;
    if (plan.episodeStartedAt !== episodeStartedAt)
      return unknown('stale_acceptance_episode');
    const manifests = comments.flatMap(comment =>
      markers(comment.body, 'validation-manifest').map(manifest => ({
        manifest,
        recordedAt: comment.createdAt,
      }))
    );
    const latestManifest = manifests.at(-1);
    const manifest = latestManifest?.manifest;
    if (
      manifest?.issue !== issue.identifier ||
      manifest?.bindingSha !== plan.bindingSha
    ) {
      return unknown('binding_manifest_mismatch');
    }
    if (
      plan.schema !== OBSERVATION_SCHEMA ||
      plan.issue !== issue.identifier ||
      !FULL_SHA.test(plan.bindingSha ?? '') ||
      !/^[a-z0-9-]+$/.test(plan.organization ?? '') ||
      !Number.isFinite(date(plan.start)) ||
      !Number.isFinite(date(plan.end)) ||
      date(plan.end) - date(plan.start) < MINIMUM_OBSERVATION_MS ||
      (episodeStartedAt && date(plan.start) < date(episodeStartedAt)) ||
      !Array.isArray(plan.incidents) ||
      !plan.incidents.length ||
      plan.incidents.length > 20 ||
      plan.incidents.some(
        source => !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(source?.shortId ?? '')
      ) ||
      new Set(plan.incidents.map(source => source.shortId)).size !==
        plan.incidents.length
    ) {
      return unknown('invalid_observation_registration');
    }
    if (issue.identifier === 'JOV-8523') {
      const required = ['JOVIE-WEB-XZ', 'JOVIE-WEB-S7', 'JOVIE-WEB-8D'];
      if (
        date(plan.start) !== date('2026-10-16T14:22:48Z') ||
        date(plan.end) < date('2026-10-23T14:22:48Z') ||
        required.some(
          id => !plan.incidents.some(source => source.shortId === id)
        )
      )
        return unknown('incident_acceptance_changed');
    }
    return {
      status: 'registered',
      plan,
      comments,
      episodeStartedAt,
    };
  } catch {
    return unknown('observation_registration_unreadable');
  }
}

async function linear(fetchImpl, apiKey, query, variables = {}) {
  const response = await fetchImpl(LINEAR_API, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`linear_http_${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data)
    throw new Error('linear_graphql_unreadable');
  return payload.data;
}

function checkedPage(connection) {
  if (
    !Array.isArray(connection?.nodes) ||
    typeof connection?.pageInfo?.hasNextPage !== 'boolean'
  ) {
    throw new Error('linear_history_incomplete');
  }
  return connection;
}

async function readIssue(fetchImpl, apiKey, identifier) {
  const data = await linear(
    fetchImpl,
    apiKey,
    `query ObservationIssue($id: String!) {
    issue(id: $id) { id identifier description state { name }
      comments(first: 100) { nodes { body createdAt } pageInfo { hasNextPage endCursor } }
      history(first: 100) { nodes { createdAt fromState { type } toState { type } } pageInfo { hasNextPage endCursor } }
    }
  }`,
    { id: identifier }
  );
  if (!data.issue?.id) throw new Error('linear_issue_missing');
  const issue = data.issue;
  for (const field of ['comments', 'history']) {
    let connection = checkedPage(issue[field]);
    const nodes = [...connection.nodes];
    const cursors = new Set();
    for (let page = 1; connection.pageInfo.hasNextPage; page += 1) {
      const after = connection.pageInfo.endCursor;
      if (page >= MAX_PAGES || !after || cursors.has(after))
        throw new Error('linear_history_incomplete');
      cursors.add(after);
      const fields =
        field === 'comments'
          ? 'body createdAt'
          : 'createdAt fromState { type } toState { type }';
      const more = await linear(
        fetchImpl,
        apiKey,
        `query ObservationPage($id: String!, $after: String!) {
        issue(id: $id) { ${field}(first: 100, after: $after) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } }
      }`,
        { id: issue.id, after }
      );
      connection = checkedPage(more.issue?.[field]);
      nodes.push(...connection.nodes);
    }
    issue[field] = nodes;
  }
  return issue;
}

async function discoverIssues(fetchImpl, apiKey) {
  const identifiers = [];
  let after = null;
  const cursors = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await linear(
      fetchImpl,
      apiKey,
      `query ObservationRegistrations($after: String) {
      issues(first: 50, after: $after, filter: { team: { key: { eq: "JOV" } }, state: { name: { eq: "Validating" } } }) {
        nodes { identifier description } pageInfo { hasNextPage endCursor }
      }
    }`,
      { after }
    );
    const connection = checkedPage(data.issues);
    identifiers.push(
      ...connection.nodes
        .filter(issue =>
          String(issue.description ?? '').includes('sentry-observation:v1')
        )
        .map(issue => issue.identifier)
    );
    if (!connection.pageInfo.hasNextPage) return identifiers;
    after = connection.pageInfo.endCursor;
    if (!after || cursors.has(after)) break;
    cursors.add(after);
  }
  throw new Error('linear_registration_scan_incomplete');
}

function tag(event, key) {
  return event.tags?.find(item => item.key === key)?.value;
}

/**
 * Query every configured incident, without filtering to the first release.
 * @param {{plan: ObservationPlan, now: Date, sentry: (path: string) => Promise<{
 * ok: boolean, body?: unknown, link?: string}> | {ok: boolean, body?: unknown, link?: string},
 * facts: Pick<ObservationFacts, 'contains'>}} input
 * @returns {Promise<ObservationResult>}
 */
export async function observeSentryHistory({ plan, now, sentry, facts }) {
  if (!Number.isFinite(now.getTime()))
    return unknown('invalid_observation_clock');
  if (now.getTime() <= date(plan.start))
    return { status: 'pending', reason: 'observation_not_started' };
  const end = new Date(Math.min(now.getTime(), date(plan.end))).toISOString();
  let gap = '';
  for (const source of plan.incidents) {
    try {
      const resolved = await sentry(
        `/organizations/${plan.organization}/shortids/${source.shortId}/`
      );
      const group = /** @type {{group?: {id?: string, shortId?: string}}} */ (
        resolved.body
      )?.group;
      if (
        !resolved.ok ||
        group?.shortId !== source.shortId ||
        !/^\d+$/.test(group?.id ?? '') ||
        (source.issueId && source.issueId !== group.id)
      ) {
        gap ||= `incident_identity_unreadable:${source.shortId}`;
        continue;
      }
      const path = `/organizations/${plan.organization}/issues/${group.id}/events/`;
      const params = new URLSearchParams({
        start: plan.start,
        end,
        per_page: '100',
      });
      for (const environment of ['vercel-production', 'production', 'prd'])
        params.append('environment', environment);
      const cursors = new Set();
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response = await sentry(`${path}?${params}`);
        if (!response.ok || !Array.isArray(response.body)) {
          gap ||= `event_history_unreadable:${source.shortId}`;
          break;
        }
        for (const event of response.body) {
          const seen = date(event.dateCreated ?? event.timestamp);
          const release =
            typeof event.release === 'object'
              ? event.release?.version
              : (event.release ?? tag(event, 'release'));
          const environment = event.environment ?? tag(event, 'environment');
          if (
            !Number.isFinite(seen) ||
            seen < date(plan.start) ||
            seen > date(end) ||
            !['vercel-production', 'production', 'prd'].includes(environment) ||
            !FULL_SHA.test(release ?? '') ||
            !/^[0-9a-f]{32}$/i.test(event.eventID ?? event.id ?? '')
          ) {
            gap ||= `event_identity_unreadable:${source.shortId}`;
            continue;
          }
          if (await facts.contains(plan.bindingSha, release)) {
            return {
              status: 'fail',
              reason: 'post_deployment_recurrence',
              source: source.shortId,
              release,
              evidence: `https://${plan.organization}.sentry.io/issues/${group.id}/events/${event.eventID ?? event.id}/`,
            };
          }
        }
        // Sentry's explicit results flag is required; missing/truncated Link
        // metadata must never masquerade as the last page of a quiet window.
        const next = String(response.link ?? '')
          .split(',')
          .find(part => /rel="next"/.test(part));
        if (!next || !/results="(?:true|false)"/.test(next)) {
          gap ||= `event_pagination_unreadable:${source.shortId}`;
          break;
        }
        if (/results="false"/.test(next)) break;
        const cursor = next.match(/cursor="([^"]+)"/)?.[1];
        if (!cursor || cursors.has(cursor) || page === MAX_PAGES - 1) {
          gap ||= `event_history_partial:${source.shortId}`;
          break;
        }
        cursors.add(cursor);
        // Rebuild the fixed-origin query; never send the token to a Link URL.
        params.set('cursor', cursor);
      }
    } catch {
      gap ||= `event_history_unreadable:${source.shortId}`;
    }
  }
  if (gap) return unknown(gap);
  if (now.getTime() < date(plan.end))
    return {
      status: 'pending',
      reason: 'full_observation_window_pending',
      earliestCompletion: plan.end,
    };
  return unknown('observation_coverage_unavailable');
}

/** Read-only supplementary loss evidence, never a coverage/pass attestation.
 * JOV-8523 is the canonical web contacts incident; generic registrations need
 * their own explicit project contract before collecting project statistics. */
export async function collectObservationCoverage({ plan, now, sentry }) {
  const gaps = [
    'production_error_attribution_unavailable',
    'retention_unavailable',
    'authenticated_contacts_exposure_unavailable',
  ];
  const context = {
    status: 'unknown',
    reason: 'observation_coverage_unavailable',
    gaps,
  };
  if (plan.issue !== 'JOV-8523' || plan.organization !== 'jovie')
    return { ...context, read: 'project_contract_unavailable' };
  const end = Math.min(now.getTime(), date(plan.end));
  if (!Number.isFinite(end) || end <= date(plan.start))
    return { ...context, read: 'observation_not_started' };
  const requested = { start: plan.start, end: new Date(end).toISOString() };
  try {
    const project = await sentry('/projects/jovie/jovie-web/');
    if (
      !project.ok ||
      project.body?.slug !== 'jovie-web' ||
      !/^\d+$/.test(project.body?.id ?? '')
    )
      return { ...context, requested, read: 'project_identity_unreadable' };
    const params = new URLSearchParams({
      project: project.body.id,
      field: 'sum(quantity)',
      category: 'error',
      start: requested.start,
      end: requested.end,
      interval: '1h',
    });
    params.append('groupBy', 'outcome');
    params.append('groupBy', 'reason');
    const response = await sentry(`/organizations/jovie/stats_v2/?${params}`);
    const stats = response.body;
    const intervals = stats?.intervals;
    const groups = stats?.groups;
    const knownOutcomes = new Set([
      'accepted',
      'filtered',
      'rate_limited',
      'invalid',
      'abuse',
      'client_discard',
      'cardinality_limited',
    ]);
    if (
      !response.ok ||
      !Array.isArray(intervals) ||
      !intervals.length ||
      intervals.length > 1000 ||
      !Array.isArray(groups) ||
      groups.length > 1000 ||
      !Number.isFinite(date(stats.start)) ||
      !Number.isFinite(date(stats.end)) ||
      date(stats.start) > date(requested.start) ||
      date(stats.end) < end ||
      intervals.some(
        (value, index) =>
          !Number.isFinite(date(value)) ||
          date(value) !== date(stats.start) + index * 60 * 60 * 1000
      ) ||
      date(stats.end) !==
        date(stats.start) + intervals.length * 60 * 60 * 1000 ||
      groups.some(
        group =>
          !knownOutcomes.has(group?.by?.outcome) ||
          typeof group.by.reason !== 'string' ||
          group.by.reason.length > 128 ||
          !Array.isArray(group.series?.['sum(quantity)']) ||
          group.series['sum(quantity)'].length !== intervals.length ||
          group.series['sum(quantity)'].some(
            count => !Number.isSafeInteger(count) || count < 0
          ) ||
          group.totals?.['sum(quantity)'] !==
            group.series['sum(quantity)'].reduce((sum, count) => sum + count, 0)
      )
    )
      return { ...context, requested, read: 'outcome_statistics_incomplete' };
    const outcomes = groups.map(group => ({
      outcome: group.by.outcome,
      reason: group.by.reason,
      total: group.totals['sum(quantity)'],
      series: group.series['sum(quantity)'],
    }));
    if (outcomes.some(row => row.outcome !== 'accepted' && row.total > 0))
      gaps.push('unattributed_error_delivery_loss');
    return {
      ...context,
      requested,
      read: 'verified_project_aggregate',
      project: { id: project.body.id, slug: project.body.slug },
      reported: { start: stats.start, end: stats.end },
      intervals,
      outcomes,
    };
  } catch {
    return { ...context, requested, read: 'outcome_statistics_unreadable' };
  }
}

/**
 * Run only owner-registered observations. Canonical lifecycle owns states.
 * @param {{apiKey?: string, githubToken?: string, sentryToken?: string,
 * repository?: string, now?: Date, fetchImpl?: typeof fetch, facts?: ObservationFacts,
 * writeReceipts?: boolean, recordReceipt?: typeof recordValidationReceipt}} options
 */
export async function runSentryValidationObservations({
  apiKey,
  githubToken,
  sentryToken,
  repository = 'JovieInc/Jovie',
  now = new Date(),
  fetchImpl = globalThis.fetch,
  facts: suppliedFacts,
  writeReceipts = true,
  recordReceipt = recordValidationReceipt,
}) {
  if (!apiKey)
    return { ok: false, results: [], reason: 'missing_linear_api_key' };
  const results = [];
  try {
    const identifiers = await discoverIssues(fetchImpl, apiKey);
    if (!identifiers.length) return { ok: true, results };
    const facts =
      suppliedFacts ??
      createProductionFacts({
        fetchImpl,
        repository,
        github: githubClient(fetchImpl, githubToken),
      });
    const served = await facts.servedGeneration();
    const artifact = { status: served.status, sha: served.sha ?? null };
    if (artifact.status !== 'verified' || !FULL_SHA.test(artifact.sha ?? ''))
      return {
        ok: false,
        artifact,
        results,
        reason: 'verified_production_artifact_unavailable',
      };
    const sentry = async path => {
      const response = await fetchImpl(`${SENTRY_API}${path}`, {
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${sentryToken}`,
          Accept: 'application/json',
        },
      });
      return {
        ok: response.ok,
        body: await response.json(),
        link: response.headers.get('link'),
      };
    };
    for (const identifier of identifiers) {
      /** @type {{issue: string, artifact: {status: string, sha: string | null},
       * bindingSha?: string, episodeStartedAt?: string | null,
       * window?: {start: string, end: string}, incidents?: ObservationPlan['incidents']}} */
      let context = { issue: identifier, artifact };
      try {
        const issue = await readIssue(fetchImpl, apiKey, identifier);
        if (issue.state?.name !== 'Validating') {
          results.push({
            ...context,
            ...unknown('issue_state_changed'),
          });
          continue;
        }
        const registration = inspectObservationIssue(issue);
        if (registration.status !== 'registered') {
          results.push({ ...context, ...registration });
          continue;
        }
        const { plan } = registration;
        context = {
          ...context,
          bindingSha: plan.bindingSha,
          episodeStartedAt: plan.episodeStartedAt,
          window: { start: plan.start, end: plan.end },
          incidents: plan.incidents.map(source => ({ ...source })),
        };
        if (!(await facts.contains(plan.bindingSha, artifact.sha))) {
          results.push({
            ...context,
            ...unknown('production_does_not_contain_binding'),
          });
          continue;
        }
        const observation = await observeSentryHistory({
          plan,
          now,
          sentry,
          facts,
        });
        if (observation.status !== 'fail' || !writeReceipts) {
          const coverage =
            observation.status === 'fail'
              ? undefined
              : await collectObservationCoverage({ plan, now, sentry });
          results.push({
            ...context,
            ...observation,
            ...(coverage ? { coverage } : {}),
          });
          continue;
        }
        const receipt = {
          issue: identifier,
          kind: 'outcome',
          status: /** @type {const} */ ('fail'),
          // Bind failure to the generation that actually emitted the event.
          // A newer current deployment must not inherit an older failure.
          sha: observation.release,
          episodeStartedAt: plan.episodeStartedAt,
          evidence: observation.evidence,
          note: `Observed ${observation.source} recurrence on repair-containing release ${observation.release}; observation ${plan.start} to ${plan.end}; episode ${plan.episodeStartedAt ?? 'initial'}.`,
        };
        const body = formatValidationReceipt(receipt);
        const current = await readIssue(fetchImpl, apiKey, identifier);
        const rechecked = inspectObservationIssue(current);
        if (
          current.state?.name !== 'Validating' ||
          rechecked.status !== 'registered' ||
          JSON.stringify(rechecked.plan) !== JSON.stringify(plan)
        ) {
          results.push({
            ...context,
            ...unknown('observation_registration_changed'),
          });
          continue;
        }
        if (current.comments.some(comment => comment.body === body)) {
          results.push({
            ...context,
            ...observation,
            receipt: 'already_recorded',
          });
          continue;
        }
        await recordReceipt(
          [
            '--issue',
            identifier,
            '--kind',
            'outcome',
            '--status',
            'fail',
            '--sha',
            observation.release,
            '--evidence',
            receipt.evidence,
            '--episode-started-at',
            plan.episodeStartedAt ?? 'null',
            '--note',
            receipt.note,
          ],
          { fetchImpl, env: { LINEAR_API_KEY: apiKey } }
        );
        const readback = await readIssue(fetchImpl, apiKey, identifier);
        if (!readback.comments.some(comment => comment.body === body))
          throw new Error('receipt_readback_failed');
        const finalRegistration = inspectObservationIssue(readback);
        if (
          finalRegistration.status !== 'registered' ||
          JSON.stringify(finalRegistration.plan) !== JSON.stringify(plan)
        ) {
          results.push({
            ...context,
            ...unknown('observation_registration_changed_after_write'),
          });
          continue;
        }
        results.push({
          ...context,
          ...observation,
          receipt: 'verified',
          stateReadback: readback.state?.name ?? null,
        });
      } catch (error) {
        results.push({
          ...context,
          ...unknown(
            error instanceof Error ? error.message : 'observation_unreadable'
          ),
        });
      }
    }
    return { ok: true, artifact, results };
  } catch (error) {
    return {
      ok: false,
      results,
      reason:
        error instanceof Error ? error.message : 'observation_scan_unreadable',
    };
  }
}
