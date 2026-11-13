import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  publicationCapabilityRequest,
  spendCredentialRequest,
} from '../job-capability-observation.mjs';

const now = Date.parse('2026-11-13T20:00:00Z');
const head = 'a'.repeat(40);
it('captures the actual GraphQL Forbidden shape without guessing authentication or copying response content', () => {
  const request = publicationCapabilityRequest({
    head,
    branch: 'codex/jov-12452-stall-recovery',
    nowMs: now,
    result: {
      status: 1,
      stdout: '',
      stderr:
        'Post "https://api.github.com/graphql": Forbidden\nAuthorization: secret-value',
    },
  });
  expect(request).toMatchObject({
    kind: 'access-unclassified',
    binding: { head, action: 'open-draft-pr', capability: 'github-graphql' },
    delivery: { status: 'pending' },
  });
  expect(JSON.stringify(request)).not.toContain('secret-value');
});
it('spend credential request binds the exact workflow source and never reads the credential value', () => {
  const env = {
    GITHUB_SHA: head,
    GITHUB_RUN_ID: '43494960841',
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
  };
  const request = spendCredentialRequest(env, now);
  expect(request).toMatchObject({
    kind: 'credential',
    binding: {
      head,
      capability: 'VERCEL_READONLY_TOKEN',
      action: 'read-vercel-usage',
    },
    status: 'pending',
  });
  expect(request.evidence.source).toBe(
    'https://github.com/JovieInc/Jovie/actions/runs/43494960841'
  );
  expect(
    spendCredentialRequest({ ...env, VERCEL_TOKEN: 'never-record-value' }, now)
  ).toBeNull();
});
it('actual hosted spend reader emits a durable-artifact-ready unknown verdict before any expensive CLI call', () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, '../../spend-guard.mjs'),
      '--now',
      '2026-11-13T20:00:00Z',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_SHA: head,
        VERCEL_TOKEN: '',
        VERCEL_BIN: '/must-not-run',
      },
    }
  );
  expect(result.status).toBe(75);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: 'capability-blocked',
    productVerdict: 'unknown',
    capabilityRequests: [
      { kind: 'credential', delivery: { status: 'pending' } },
    ],
  });
  expect(result.stderr).toContain('VERCEL_READONLY_TOKEN');
  expect(result.stderr).not.toContain('ENOENT');
});

it('ordinary PR validation and already-existing PR errors are not fabricated access failures', () => {
  for (const stderr of [
    'a pull request already exists',
    'Validation Failed: No commits between main and branch',
    'unknown repository',
  ])
    expect(
      publicationCapabilityRequest({
        head,
        branch: 'codex/test',
        nowMs: now,
        result: { status: 1, stderr, stdout: '' },
      })
    ).toBeNull();
});
