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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { linearRequest } from '../lib/linear-cooldown.mjs';
import { JOVIE_TEAM_ID } from '../lib/linear-issue-intake.mjs';
import { withLinearRetry } from '../lib/linear-retry.mjs';

export const ARTIFACT_PREFIX = 'pen-draft-';
export const TITLE_PREFIX = 'Pen draft for approval: ';
// The label Summer turns into Ovie inbox cards (scripts/quality-gap-finder.mjs
// LABEL_LOW). The repo has no label of its own for design approvals.
export const APPROVAL_LABEL = 'quality-gap:needs-tim';
export const APPROVAL_LINE = 'Move to Todo to accept, cancel to reject.';
export const CREATE_STATE_NAME = 'Backlog';
// Linear rejects larger uploads; a frame preview is a few hundred KB.
export const MAX_PNG_BYTES = 25 * 1024 * 1024;

const FRAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TERMINAL_STATES = new Set(['completed', 'canceled']);

/** `pen-draft-<frame>` -> `<frame>`; null for any other artifact name. */
export function frameFromArtifactName(name) {
  if (typeof name !== 'string' || !name.startsWith(ARTIFACT_PREFIX))
    return null;
  const frame = name.slice(ARTIFACT_PREFIX.length);
  return FRAME_RE.test(frame) ? frame : null;
}

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

/** One entry per `pen-draft-<frame>` folder; `png` is null when it drew none. */
export function collectFrames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      artifact: entry.name,
      frame: frameFromArtifactName(entry.name),
    }))
    .filter(entry => entry.frame)
    .sort((a, b) => a.frame.localeCompare(b.frame))
    .map(entry => {
      const png = join(dir, entry.artifact, `${entry.frame}.png`);
      const drawn = existsSync(png) && statSync(png).isFile();
      return { ...entry, png: drawn ? png : null };
    });
}

/** One Linear GraphQL call in the shape scripts/lib/linear-retry.mjs retries. */
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

const retried = (ctx, frame, op, run) =>
  withLinearRetry(run, {
    fingerprint: frame,
    op,
    sleep: ctx.sleep,
    log: ctx.log,
  });

/** The approval label's id and the state a new issue starts in. */
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
  if (!found.ok) return found;
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

/** Upload one png: ask Linear for a signed URL, then PUT the bytes to it. */
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
  if (!signed.ok) return signed;
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
      body: bytes,
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
  if (!found.ok) return found;
  return {
    ok: true,
    issue: pickApprovalIssue(found.data?.issues?.nodes, frame),
  };
}

/** Create the frame's approval issue, or put the new picture on the old one. */
export async function upsertApprovalIssue(ctx, { frame, description, refs }) {
  const found = await retried(ctx, frame, 'pen_issue_find', () =>
    findApprovalIssue(ctx, frame)
  );
  if (!found.ok) return found;
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
    if (!updated.ok) return updated;
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
  if (!created.ok) return created;
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
  const withPng = frames.filter(entry => entry.png);
  const rows = frames
    .filter(entry => !entry.png)
    .map(entry => ({ frame: entry.frame, ok: true, action: 'skipped-no-png' }));
  if (withPng.length === 0) return { ok: true, frames: rows };
  if (!apiKey)
    return { ok: false, reason: 'missing_linear_api_key', frames: rows };
  const refs = await resolveTeamRefs(ctx);
  if (!refs.ok) return { ok: false, reason: refs.reason, frames: rows };
  for (const { frame, png } of withPng) {
    const bytes = readFile(png);
    if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES) {
      rows.push({ frame, ok: false, reason: 'pen_upload_bad_size' });
      continue;
    }
    const upload = await retried(ctx, frame, 'pen_upload', () =>
      uploadPng(ctx, { frame, bytes })
    );
    if (!upload.ok) {
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
      issue.ok
        ? {
            frame,
            ok: true,
            action: issue.action,
            identifier: issue.identifier,
          }
        : { frame, ok: false, reason: issue.reason, detail: issue.detail }
    );
  }
  return { ok: rows.every(row => row.ok), frames: rows };
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
  for (const row of result.frames)
    console.log(
      `pen-draft-publish: ${row.frame}: ${row.ok ? `${row.action}${row.identifier ? ` ${row.identifier}` : ''}` : `FAILED ${row.reason}${row.detail ? ` (${row.detail})` : ''}`}`
    );
  if (result.reason) console.log(`pen-draft-publish: FAILED ${result.reason}`);
  if (result.frames.length === 0)
    console.log('pen-draft-publish: the run left no pen-draft artifacts');
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
