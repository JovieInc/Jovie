/** Shared fakes for the Pen draft publish tests: artifacts, Linear, uploads. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JOVIE_TEAM_ID } from '../lib/linear-issue-intake.mjs';
import { APPROVAL_LABEL, publishDrafts } from './pen-draft-publish.mjs';

export const RUN_URL = 'https://github.com/JovieInc/Jovie/actions/runs/123';
export const UPLOAD_URL = 'https://uploads.example.test/signed/put';
export const assetUrl = frame =>
  `https://uploads.linear.app/asset/${frame}.png`;

/** The first 24 bytes of a PNG: signature, then IHDR with its size. */
export function fakePng(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'latin1');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** The sidecar pen-draft-picture.mjs writes beside a rendered frame. */
export const sidecar = picture =>
  JSON.stringify({ schema: 'jovie.pen-draft-picture/v1', ...picture });

/** A download-artifact folder: one `pen-draft-<frame>` dir per artifact. */
/** @param {Record<string, Array<string | [string, Buffer | string]>>} frames */
export function artifacts(frames) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-draft-publish-'));
  for (const [artifact, files] of Object.entries(frames)) {
    mkdirSync(join(dir, artifact), { recursive: true });
    for (const file of files) {
      const [name, bytes] = Array.isArray(file) ? file : [file, null];
      writeFileSync(
        join(dir, artifact, name),
        bytes ??
          (name.endsWith('.png') ? fakePng(1440, 900) : `bytes of ${name}`)
      );
    }
  }
  return dir;
}

/** Fake Linear plus its upload host. Records every request it sees. */
export function fakeNetwork({ issues = [], failPutFor = [] } = {}) {
  const calls = [];
  const created = [];
  const json = body => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  });
  let pendingFrame = null;
  const fetchImpl = async (url, init) => {
    if (init.method === 'PUT') {
      calls.push({ op: 'PUT', url, headers: init.headers, body: init.body });
      const failed = failPutFor.includes(pendingFrame);
      return { ok: !failed, status: failed ? 403 : 200 };
    }
    const { query, variables } = JSON.parse(init.body);
    const op = query.match(/(?:query|mutation)\s+(\w+)/)[1];
    calls.push({ op, variables, authorization: init.headers.Authorization });
    if (op === 'PenDraftPublishRefs')
      return json({
        data: {
          team: {
            states: { nodes: [{ id: 'state-backlog', name: 'Backlog' }] },
          },
          issueLabels: {
            nodes: [
              { id: 'label-workspace', name: APPROVAL_LABEL, team: null },
              {
                id: 'label-team',
                name: APPROVAL_LABEL,
                team: { id: JOVIE_TEAM_ID },
              },
            ],
          },
        },
      });
    if (op === 'PenDraftFileUpload') {
      pendingFrame = variables.filename.replace(/\.png$/, '');
      return json({
        data: {
          fileUpload: {
            success: true,
            uploadFile: {
              uploadUrl: UPLOAD_URL,
              assetUrl: assetUrl(pendingFrame),
              headers: [{ key: 'x-amz-acl', value: 'private' }],
            },
          },
        },
      });
    }
    if (op === 'PenDraftApprovalIssue')
      return json({ data: { issues: { nodes: [...issues, ...created] } } });
    if (op === 'PenDraftApprovalCreate') {
      const issue = {
        id: `new-${created.length}`,
        identifier: `JOV-90${created.length}`,
        title: variables.input.title,
        state: { type: 'backlog' },
        labels: { nodes: variables.input.labelIds.map(id => ({ id })) },
      };
      created.push(issue);
      return json({ data: { issueCreate: { success: true, issue } } });
    }
    if (op === 'PenDraftApprovalUpdate')
      return json({
        data: { issueUpdate: { success: true, issue: { id: variables.id } } },
      });
    throw new Error(`unexpected Linear operation ${op}`);
  };
  return { fetchImpl, calls, ops: () => calls.map(call => call.op) };
}

export const publish = (dir, network, extra = {}) =>
  publishDrafts({
    dir,
    runUrl: RUN_URL,
    apiKey: 'lin_api_test',
    fetchImpl: network.fetchImpl,
    env: {
      LINEAR_COOLDOWN_STATE_DIR: mkdtempSync(join(tmpdir(), 'pen-cooldown-')),
    },
    sleep: async () => {},
    log: () => {},
    ...extra,
  });
