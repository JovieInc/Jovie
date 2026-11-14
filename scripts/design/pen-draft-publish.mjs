#!/usr/bin/env node
/**
 * Publish Pen draft pictures to Linear for approval (JOV-12577).
 *
 * `pen-draft.yml` leaves each drafted frame in a private Actions artifact
 * named `pen-draft-<frame>`. Tim approves a design only from a picture he can
 * see, so this puts each frame's png inline on one Linear issue per frame:
 *
 *   node scripts/design/pen-draft-publish.mjs --dir <downloaded artifacts> --run-id <pen-draft run>
 *
 * `--dir` holds one folder per artifact, as actions/download-artifact writes
 * them. For every frame with a png it uploads the png to Linear, then creates
 * or updates the issue titled `Pen draft for approval: <frame>`. One issue per
 * frame, never a second one. It never changes an issue's state: moving the
 * issue is Tim's answer. Any failed upload or issue write exits 1.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { linearRequest } from '../lib/linear-cooldown.mjs';
import { JOVIE_TEAM_ID } from '../lib/linear-issue-intake.mjs';
import { withLinearRetry } from '../lib/linear-retry.mjs';
import { collectFrames, pictureFor } from './pen-draft-frames.mjs';

export const TITLE_PREFIX = 'Pen draft for approval: ';
// A label of its own for design approvals. `quality-gap:needs-tim` is a gate
// in scripts/lanes/fleet_ledger.py that accepts on silence, and it counts
// toward the quality-gap finder's daily cap; this one does neither.
export const APPROVAL_LABEL = 'pen-draft:needs-tim';
export const APPROVAL_LINE = 'Move to Todo to accept, cancel to reject.';
export const CREATE_STATE_NAME = 'Backlog';

/**
 * @typedef {{ok: false, reason: string, detail?: string}} Failure
 * @typedef {{ok: true, data: any}} GraphqlOk
 * @typedef {{ok: true, labelId: string, stateId: string | null}} TeamRefs
 * @typedef {{ok: true, assetUrl: string}} Uploaded
 * @typedef {{ok: true, issue: any}} FoundIssue
 * @typedef {{ok: true, action: string, identifier: string | null}} Upserted
 * @typedef {{frame: string, ok: true, action: string, identifier?: string | null}} PublishedRow
 * @typedef {{frame: string, ok: false, reason: string, detail?: string}} FailedRow
 * @typedef {PublishedRow | FailedRow} FrameRow
 * @typedef {{ok: boolean, reason?: string, frames: FrameRow[]}} PublishResult
 * @typedef {{apiKey?: string, fetchImpl: typeof fetch, env: NodeJS.ProcessEnv, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void}} Context
 */

/**
 * scripts checkJs runs without strict null checks, so `!result.ok` does not
 * narrow a result union; this guard does.
 * @param {{ok: boolean}} result
 * @returns {result is Failure}
 */
const failed = result => !result.ok;

const TERMINAL_STATES = new Set(['completed', 'canceled']);

export function approvalTitle(frame) {
  return `${TITLE_PREFIX}${frame}`;
}

/**
 * The frame's approval issue among search results: the title must match
 * exactly. An open issue wins over a closed one, then the newest.
 */
export function pickApprovalIssue(nodes, frame) {
  const title = approvalTitle(frame);
  const open = node => (TERMINAL_STATES.has(node?.state?.type) ? 1 : 0);
  return (
    (nodes ?? [])
      .filter(node => node?.title === title)
      .sort(
        (a, b) =>
          open(a) - open(b) ||
          String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
      )[0] ?? null
  );
}

export function approvalDescription({ frame, assetUrl, runUrl }) {
  return [
    `![${frame}](${assetUrl})`,
    '',
    `Drafted by ${runUrl}`,
    '',
    APPROVAL_LINE,
  ].join('\n');
}

/** The pen-draft run's page; the run id must be digits only. */
export function runUrlFor(runId, env = process.env) {
  if (!/^\d+$/.test(String(runId ?? '')))
    throw new Error('run id must be a number');
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  return `${server}/${repo}/actions/runs/${runId}`;
}

/**
 * One Linear GraphQL call in the shape scripts/lib/linear-retry.mjs retries.
 * @param {Context} ctx
 * @param {string} op
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @returns {Promise<GraphqlOk | Failure>}
 */
async function linearGraphql(ctx, op, query, variables) {
  const result = await linearRequest({
    key: ctx.apiKey,
    query,
    variables,
    fetchImpl: ctx.fetchImpl,
    env: ctx.env,
  });
  if (result.rateLimited) return { ok: false, reason: 'linear_rate_limited' };
  if (result.reason === 'missing_linear_api_key')
    return { ok: false, reason: result.reason };
  if (result.reason === 'transport')
    return { ok: false, reason: `${op}_transport` };
  if (!result.ok) return { ok: false, reason: `${op}_${result.status}` };
  if (Array.isArray(result.data?.errors) && result.data.errors.length > 0)
    return {
      ok: false,
      reason: `${op}_graphql_error`,
      detail: String(result.data.errors[0]?.message ?? '').slice(0, 200),
    };
  return { ok: true, data: result.data?.data ?? null };
}

/**
 * @template {{ok: boolean, reason?: string}} T
 * @param {Context} ctx
 * @param {string} frame
 * @param {string} op
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
const retried = (ctx, frame, op, run) =>
  withLinearRetry(run, {
    fingerprint: frame,
    op,
    sleep: ctx.sleep,
    log: ctx.log,
  });

/**
 * The approval label's id and the state a new issue starts in.
 * @param {Context} ctx
 * @returns {Promise<TeamRefs | Failure>}
 */
export async function resolveTeamRefs(ctx) {
  const found = await retried(ctx, 'team', 'pen_publish_refs', () =>
    linearGraphql(
      ctx,
      'pen_publish_refs',
      `query PenDraftPublishRefs($teamId: String!, $names: [String!]) {
        team(id: $teamId) { states { nodes { id name } } }
        issueLabels(first: 50, filter: { name: { in: $names } }) {
          nodes { id name team { id } }
        }
      }`,
      { teamId: JOVIE_TEAM_ID, names: [APPROVAL_LABEL] }
    )
  );
  if (failed(found)) return found;
  // A Jovie team label wins over a workspace label of the same name.
  const labels = (found.data?.issueLabels?.nodes ?? []).filter(
    label => label?.name === APPROVAL_LABEL
  );
  const label =
    labels.find(candidate => candidate.team?.id === JOVIE_TEAM_ID) ??
    labels.find(candidate => !candidate.team) ??
    null;
  if (!label) return { ok: false, reason: 'pen_publish_label_missing' };
  const stateId =
    (found.data?.team?.states?.nodes ?? []).find(
      state => state?.name === CREATE_STATE_NAME
    )?.id ?? null;
  return { ok: true, labelId: label.id, stateId };
}

/**
 * Upload one png: ask Linear for a signed URL, then PUT the bytes to it.
 * @param {Context} ctx
 * @param {{frame: string, bytes: Buffer}} upload
 * @returns {Promise<Uploaded | Failure>}
 */
export async function uploadPng(ctx, { frame, bytes }) {
  const filename = `${frame}.png`;
  const signed = await linearGraphql(
    ctx,
    'pen_upload_sign',
    `mutation PenDraftFileUpload($contentType: String!, $filename: String!, $size: Int!) {
      fileUpload(contentType: $contentType, filename: $filename, size: $size) {
        success
        uploadFile { uploadUrl assetUrl headers { key value } }
      }
    }`,
    { contentType: 'image/png', filename, size: bytes.length }
  );
  if (failed(signed)) return signed;
  const file = signed.data?.fileUpload?.uploadFile;
  if (
    !signed.data?.fileUpload?.success ||
    !/^https:\/\//.test(String(file?.uploadUrl ?? '')) ||
    !/^https:\/\//.test(String(file?.assetUrl ?? ''))
  )
    return { ok: false, reason: 'pen_upload_sign_unsuccessful' };
  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=31536000',
  };
  for (const header of file.headers ?? [])
    if (header?.key) headers[header.key] = String(header.value ?? '');
  let response;
  try {
    response = await ctx.fetchImpl(file.uploadUrl, {
      method: 'PUT',
      headers,
      body: /** @type {BodyInit} */ (/** @type {unknown} */ (bytes)),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, reason: 'pen_upload_put_transport' };
  }
  const status = Number(response?.status ?? 0);
  if (response?.ok === false || status >= 400 || status === 0)
    return { ok: false, reason: `pen_upload_put_${status}` };
  return { ok: true, assetUrl: file.assetUrl };
}

/**
 * @param {Context} ctx
 * @param {string} frame
 * @returns {Promise<FoundIssue | Failure>}
 */
async function findApprovalIssue(ctx, frame) {
  const found = await linearGraphql(
    ctx,
    'pen_issue_find',
    `query PenDraftApprovalIssue($teamId: ID!, $title: String!) {
      issues(
        filter: { team: { id: { eq: $teamId } }, title: { eq: $title } }
        first: 50
        includeArchived: true
      ) {
        nodes { id identifier title createdAt state { type } labels { nodes { id } } }
      }
    }`,
    { teamId: JOVIE_TEAM_ID, title: approvalTitle(frame) }
  );
  if (failed(found)) return found;
  return {
    ok: true,
    issue: pickApprovalIssue(found.data?.issues?.nodes, frame),
  };
}

/**
 * Create the frame's approval issue, or put the new picture on the old one.
 * @param {Context} ctx
 * @param {{frame: string, description: string, refs: TeamRefs}} draft
 * @returns {Promise<Upserted | Failure>}
 */
export async function upsertApprovalIssue(ctx, { frame, description, refs }) {
  const found = await retried(ctx, frame, 'pen_issue_find', () =>
    findApprovalIssue(ctx, frame)
  );
  if (failed(found)) return found;
  if (found.issue) {
    const labelled = (found.issue.labels?.nodes ?? []).some(
      label => label?.id === refs.labelId
    );
    const updated = await retried(ctx, frame, 'pen_issue_update', () =>
      linearGraphql(
        ctx,
        'pen_issue_update',
        `mutation PenDraftApprovalUpdate($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success issue { id identifier } }
        }`,
        {
          id: found.issue.id,
          input: {
            description,
            ...(labelled ? {} : { addedLabelIds: [refs.labelId] }),
          },
        }
      )
    );
    if (failed(updated)) return updated;
    if (!updated.data?.issueUpdate?.success)
      return { ok: false, reason: 'pen_issue_update_unsuccessful' };
    return {
      ok: true,
      action: 'updated',
      identifier: found.issue.identifier ?? null,
    };
  }
  // No retry: a create that timed out may have landed, and a second create
  // would be a duplicate. The next run finds the issue by its title.
  const created = await linearGraphql(
    ctx,
    'pen_issue_create',
    `mutation PenDraftApprovalCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier } }
    }`,
    {
      input: {
        teamId: JOVIE_TEAM_ID,
        title: approvalTitle(frame),
        description,
        labelIds: [refs.labelId],
        ...(refs.stateId ? { stateId: refs.stateId } : {}),
      },
    }
  );
  if (failed(created)) return created;
  if (!created.data?.issueCreate?.success)
    return { ok: false, reason: 'pen_issue_create_unsuccessful' };
  return {
    ok: true,
    action: 'created',
    identifier: created.data.issueCreate.issue?.identifier ?? null,
  };
}

/**
 * Publish every frame under `dir` that has a png. Returns one row per frame;
 * `ok` is false when any upload or issue write failed.
 * @param {{dir: string, runUrl: string, apiKey?: string, fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void, readFile?: (path: string) => Buffer}} options
 * @returns {Promise<PublishResult>}
 */
export async function publishDrafts({
  dir,
  runUrl,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
  env = process.env,
  sleep,
  log = console.error,
  readFile = readFileSync,
}) {
  const ctx = { apiKey, fetchImpl, env, sleep, log };
  const frames = collectFrames(dir);
  /** @type {FrameRow[]} */
  const rows = [];
  /** @type {{frame: string, bytes: Buffer}[]} */
  const pictures = [];
  // Every picture is checked before Linear is asked for anything.
  for (const entry of frames) {
    const { frame } = entry;
    if (!entry.png && !entry.sidecar) {
      rows.push({ frame, ok: true, action: 'skipped-no-png' });
      continue;
    }
    const picture = pictureFor(entry, readFile);
    if (failed(picture))
      rows.push({
        frame,
        ok: false,
        reason: picture.reason,
        ...(picture.detail ? { detail: picture.detail } : {}),
      });
    else pictures.push({ frame, bytes: picture.bytes });
  }
  const done = () => ({
    ok: rows.every(row => row.ok),
    frames: rows.sort((a, b) => a.frame.localeCompare(b.frame)),
  });
  if (pictures.length === 0) return done();
  if (!apiKey)
    return { ...done(), ok: false, reason: 'missing_linear_api_key' };
  const refs = await resolveTeamRefs(ctx);
  if (failed(refs)) return { ...done(), ok: false, reason: refs.reason };
  for (const { frame, bytes } of pictures) {
    const upload = await retried(ctx, frame, 'pen_upload', () =>
      uploadPng(ctx, { frame, bytes })
    );
    if (failed(upload)) {
      rows.push({ frame, ok: false, reason: upload.reason });
      continue;
    }
    const issue = await upsertApprovalIssue(ctx, {
      frame,
      description: approvalDescription({
        frame,
        assetUrl: upload.assetUrl,
        runUrl,
      }),
      refs,
    });
    rows.push(
      failed(issue)
        ? { frame, ok: false, reason: issue.reason, detail: issue.detail }
        : {
            frame,
            ok: true,
            action: issue.action,
            identifier: issue.identifier,
          }
    );
  }
  return done();
}

async function main() {
  const { values } = parseArgs({
    options: { dir: { type: 'string' }, 'run-id': { type: 'string' } },
  });
  if (!values.dir || !values['run-id'])
    throw new Error('usage: pen-draft-publish.mjs --dir <dir> --run-id <id>');
  const result = await publishDrafts({
    dir: resolve(values.dir),
    runUrl: runUrlFor(values['run-id']),
  });
  for (const row of result.frames) {
    const outcome = failed(row)
      ? `FAILED ${row.reason}${row.detail ? ` (${row.detail})` : ''}`
      : `${row.action}${row.identifier ? ` ${row.identifier}` : ''}`;
    console.log(`pen-draft-publish: ${row.frame}: ${outcome}`);
  }
  if (result.reason) console.log(`pen-draft-publish: FAILED ${result.reason}`);
  if (result.frames.length === 0)
    console.log('pen-draft-publish: the run left no pen-draft artifacts');
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
