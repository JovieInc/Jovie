import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapters = vi.hoisted(() => ({
  head: vi.fn(),
  spawn: vi.fn(() => {
    throw new Error('Unexpected child process in receipt guard test');
  }),
  neon: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  default: { execFileSync: adapters.head, spawnSync: adapters.spawn },
  execFileSync: adapters.head,
  spawnSync: adapters.spawn,
}));
vi.mock('@neondatabase/serverless', () => ({ neon: adapters.neon }));

import { guardPlaywrightArtifacts } from '../../../../../.github/scripts/guard-playwright-artifacts.mjs';

import {
  runProfileCtaPreflight,
  validateProfileCtaConnection,
  validateProfileCtaEnvironment,
  verifyProfileCtaFixtures,
} from '../../helpers/profile-cta-fixture-preflight';

const env = {
  CI: 'true',
  DATABASE_URL: 'postgresql://fixture.invalid/db',
  PROFILE_CTA_NEON_BRANCH_ID: 'br-owned-fixture',
  PROFILE_CTA_BROWSER: 'chromium',
  GITHUB_RUN_ID: '123',
};
const connection = {
  db_url: env.DATABASE_URL,
  branch_id: env.PROFILE_CTA_NEON_BRANCH_ID,
  branch_name: 'e2e-full-123-chromium',
};
const profiles = [
  {
    id: 'tim-id',
    username: 'tim',
    display_name: 'Tim White',
    is_public: true,
    has_owner: true,
    is_claimed: true,
  },
  {
    id: 'empty-id',
    username: 'edgecase-empty',
    display_name: 'Edge Case Empty',
    is_public: true,
    has_owner: true,
    is_claimed: true,
  },
];
function dependencies() {
  return {
    seed: vi.fn().mockResolvedValue({ success: true }),
    profiles: vi.fn().mockResolvedValue(profiles),
    upcomingCount: vi.fn().mockResolvedValue('0'),
  };
}

describe('filtered profile CTA fixture preflight', () => {
  it.each([
    { BASE_URL: 'https://external.invalid' },
    { E2E_SKIP_SEED: '1' },
    { E2E_SKIP_WEB_SERVER: '1' },
    { E2E_WEB_SERVER_COMMAND: 'custom-server' },
    { DATABASE_URL: '' },
    { CI: '' },
  ])('rejects an environment that cannot prove the managed local fixture: %j', override => {
    expect(() =>
      validateProfileCtaEnvironment({ ...env, ...override })
    ).toThrow();
  });
  it('accepts the same owned branch and direct connection without returning credentials', () => {
    validateProfileCtaEnvironment(env);
    expect(validateProfileCtaConnection(env, connection)).toEqual({
      branchId: 'br-owned-fixture',
      branchName: 'e2e-full-123-chromium',
      parent: 'UNKNOWN',
    });
  });
  it.each([
    { branch_id: 'br-other' },
    { db_url: 'postgresql://other.invalid/db' },
    { branch_name: 'e2e-full-122-chromium' },
  ])('rejects mismatched connection provenance: %j', override => {
    expect(() =>
      validateProfileCtaConnection(env, { ...connection, ...override })
    ).toThrow();
  });
  it('requires successful seeding before reading exact public identities and the actual zero count', async () => {
    const deps = dependencies();
    const now = new Date('2026-09-09T00:00:00Z');
    const proof = await verifyProfileCtaFixtures(deps, now);
    expect(deps.seed.mock.invocationCallOrder[0]).toBeLessThan(
      deps.profiles.mock.invocationCallOrder[0]
    );
    expect(deps.upcomingCount).toHaveBeenCalledWith('empty-id', now);
    expect(proof.upcomingConfirmedTourCount).toBe(0);
    expect(proof.profiles).toEqual([
      { id: 'tim-id', username: 'tim' },
      { id: 'empty-id', username: 'edgecase-empty' },
    ]);
  });
  it('rejects resolved seed failure without querying profiles', async () => {
    const deps = dependencies();
    deps.seed.mockResolvedValue({ success: false });
    await expect(verifyProfileCtaFixtures(deps)).rejects.toThrow(
      'seed did not succeed'
    );
    expect(deps.profiles).not.toHaveBeenCalled();
  });
  it('does not leak thrown seed diagnostics', async () => {
    const deps = dependencies();
    deps.seed.mockRejectedValue(new Error('private database credential'));
    await expect(verifyProfileCtaFixtures(deps)).rejects.toThrow(
      /^profile-cta seed failed$/
    );
  });
  it.each([
    'tim',
    'edgecase-empty',
  ])('rejects a missing %s without treating it as an empty tour', async username => {
    const deps = dependencies();
    deps.profiles.mockResolvedValue(
      profiles.filter(profile => profile.username !== username)
    );
    await expect(verifyProfileCtaFixtures(deps)).rejects.toThrow(
      `public profile invalid: ${username}`
    );
    expect(deps.upcomingCount).not.toHaveBeenCalled();
  });
  it.each([
    { is_public: false },
    { has_owner: false },
    { is_claimed: false },
    { display_name: 'Wrong Artist' },
  ])('rejects an invalid empty fixture: %j', override => {
    const deps = dependencies();
    deps.profiles.mockResolvedValue([
      profiles[0],
      { ...profiles[1], ...override },
    ]);
    return expect(verifyProfileCtaFixtures(deps)).rejects.toThrow(
      'public profile invalid: edgecase-empty'
    );
  });
  it.each([
    1,
    '1',
    null,
    undefined,
    '',
    -1,
  ])('rejects a nonzero or absent measurement: %j', count => {
    const deps = dependencies();
    deps.upcomingCount.mockResolvedValue(count);
    return expect(verifyProfileCtaFixtures(deps)).rejects.toThrow(
      'count is not zero'
    );
  });
  it.each([
    'profiles',
    'upcomingCount',
  ] as const)('rejects %s query errors instead of qualifying an empty screen', async query => {
    const deps = dependencies();
    deps[query].mockRejectedValue(new Error('private connection detail'));
    await expect(verifyProfileCtaFixtures(deps)).rejects.toThrow(
      query === 'profiles'
        ? /^profile-cta profile query failed$/
        : /^profile-cta upcoming tour query failed$/
    );
  });
});

// Real temporary files exercise receipt/source I/O. Git and Neon are mocked before
// importing the helper; these tests cannot launch Git or contact a database.
describe('runProfileCtaPreflight adapter and receipt', () => {
  const head = 'a'.repeat(40);
  const roots: string[] = [];
  const sourcePaths = [
    '.github/workflows/e2e-full-matrix.yml',
    'apps/web/tests/global-setup.ts',
    'apps/web/playwright.config.ts',
    'apps/web/lib/db/client/connection.ts',
    'apps/web/tests/helpers/profile-cta-fixture-preflight.ts',
    'apps/web/tests/e2e/profile/public-profile-cta-identity.spec.ts',
    'apps/web/tests/seed-test-data.ts',
    'apps/web/lib/tour-dates/queries.ts',
    'apps/web/lib/services/profile/queries.ts',
    'apps/web/lib/tim-white.ts',
  ];
  function fixture() {
    const root = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'profile-cta-preflight-'))
    );
    roots.push(root);
    for (const file of sourcePaths) {
      const destination = path.join(root, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, `source fixture: ${file}\n`);
    }
    const connectionFile = path.join(root, 'connection.json');
    writeFileSync(connectionFile, JSON.stringify(connection));
    const webRoot = path.join(root, 'apps/web');
    const output = path.join(
      webRoot,
      'test-results/profile-cta-fixture-preflight.json'
    );
    return {
      root,
      webRoot,
      output,
      connectionFile,
      env: {
        ...env,
        GITHUB_SHA: head,
        PROFILE_CTA_NEON_CONNECTION_FILE: connectionFile,
      },
      seed: vi.fn().mockResolvedValue({ success: true }),
      readProof: () => JSON.parse(readFileSync(output, 'utf8')),
    };
  }
  beforeEach(() => {
    adapters.head.mockReset().mockReturnValue(`${head}\n`);
    adapters.neon.mockReset().mockReturnValue(adapters.sql);
    adapters.sql
      .mockReset()
      .mockResolvedValueOnce(profiles)
      .mockResolvedValueOnce([{ count: '0' }]);
  });
  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });
  it('writes a sanitized successful receipt bound to source bytes and parameterized app predicates', async () => {
    const f = fixture();
    await runProfileCtaPreflight(f.env, f.webRoot, f.seed);
    const proof = f.readProof();
    expect(proof.status).toBe('PASS');
    expect(proof.sourceHead).toBe(head);
    expect(adapters.head).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], {
      cwd: f.root,
      encoding: 'utf8',
    });
    expect(proof.sourceFiles).toEqual(
      Object.fromEntries(
        sourcePaths.map(file => [
          file,
          createHash('sha256')
            .update(readFileSync(path.join(f.root, file)))
            .digest('hex'),
        ])
      )
    );
    expect(proof.ownedBranch).toEqual({
      branchId: connection.branch_id,
      branchName: connection.branch_name,
      parent: 'UNKNOWN',
    });
    expect(adapters.neon).toHaveBeenCalledWith(env.DATABASE_URL);
    expect(f.seed.mock.invocationCallOrder[0]).toBeLessThan(
      adapters.sql.mock.invocationCallOrder[0]
    );
    const [profileParts] = adapters.sql.mock.calls[0];
    const profileQuery = profileParts.join('?').replace(/\s+/g, ' ');
    expect(profileQuery).toContain('p.is_claimed');
    expect(profileQuery).toContain('LEFT JOIN users u ON u.id = p.user_id');
    expect(profileQuery).toContain(
      "p.username_normalized IN ('tim', 'edgecase-empty')"
    );
    const [tourParts, profileId, since] = adapters.sql.mock.calls[1];
    const tourQuery = tourParts.join('?').replace(/\s+/g, ' ');
    expect(tourQuery).toContain('WHERE profile_id = ? AND start_date >= ?');
    expect(tourQuery).toContain(
      "AND event_type = 'tour' AND confirmation_status = 'confirmed'"
    );
    expect(profileId).toBe('empty-id');
    expect(since).toBe(proof.queriedAt);
    expect(proof.upcomingConfirmedTourCount).toBe(0);
    const serialized = readFileSync(f.output, 'utf8');
    expect(serialized).not.toContain(env.DATABASE_URL);
    expect(serialized).not.toContain('db_url');
    expect(serialized).not.toContain('source fixture:');
    expect(
      guardPlaywrightArtifacts(
        [f.output],
        { NODE_ENV: 'test' },
        { workspace: f.root }
      )
    ).toEqual([]);
    expect(adapters.spawn).not.toHaveBeenCalled();
  });
  it.each([
    { connection: { branchId: 'br-owned-fixture' } },
    { DATABASE_URL: 'postgresql://private.invalid/db' },
  ])('the unchanged guard rejects forbidden fields injected into the emitted receipt: %j', async forbidden => {
    const f = fixture();
    await runProfileCtaPreflight(f.env, f.webRoot, f.seed);
    writeFileSync(f.output, JSON.stringify({ ...f.readProof(), ...forbidden }));
    expect(
      guardPlaywrightArtifacts(
        [f.output],
        { NODE_ENV: 'test' },
        { workspace: f.root }
      )
    ).not.toEqual([]);
    expect(adapters.spawn).not.toHaveBeenCalled();
  });
  it('fails wrong HEAD before seeding or opening the database and retains sanitized evidence', async () => {
    const f = fixture();
    adapters.head.mockReturnValue('b'.repeat(40));
    await expect(
      runProfileCtaPreflight(f.env, f.webRoot, f.seed)
    ).rejects.toThrow('failed at source');
    expect(f.readProof()).toMatchObject({
      status: 'FAILED',
      failedStage: 'source',
      reason: 'operation failed',
    });
    expect(f.seed).not.toHaveBeenCalled();
    expect(adapters.neon).not.toHaveBeenCalled();
  });
  it('does not qualify missing source bytes despite a matching HEAD', async () => {
    const f = fixture();
    rmSync(path.join(f.root, sourcePaths[0]));
    await expect(
      runProfileCtaPreflight(f.env, f.webRoot, f.seed)
    ).rejects.toThrow('failed at source');
    expect(f.readProof()).toMatchObject({
      status: 'FAILED',
      failedStage: 'source',
    });
    expect(adapters.neon).not.toHaveBeenCalled();
  });
  it.each([
    'missing',
    'malformed',
    'mismatch',
  ] as const)('retains a sanitized connection failure: %s', async mode => {
    const f = fixture();
    if (mode === 'missing') rmSync(f.connectionFile);
    else
      writeFileSync(
        f.connectionFile,
        mode === 'malformed'
          ? 'private invalid JSON'
          : JSON.stringify({ ...connection, db_url: 'private mismatch' })
      );
    await expect(
      runProfileCtaPreflight(f.env, f.webRoot, f.seed)
    ).rejects.toThrow('failed at connection');
    expect(f.readProof()).toMatchObject({
      status: 'FAILED',
      failedStage: 'connection',
    });
    expect(readFileSync(f.output, 'utf8')).not.toContain('private');
    expect(f.seed).not.toHaveBeenCalled();
    expect(adapters.neon).not.toHaveBeenCalled();
  });
  it.each([
    'profiles',
    'tour',
  ] as const)('retains a failed receipt when the real adapter %s query rejects', async query => {
    const f = fixture();
    adapters.sql.mockReset();
    if (query === 'tour') adapters.sql.mockResolvedValueOnce(profiles);
    adapters.sql.mockRejectedValueOnce(
      new Error('private database credential')
    );
    await expect(
      runProfileCtaPreflight(f.env, f.webRoot, f.seed)
    ).rejects.toThrow('failed at fixtures');
    expect(f.readProof()).toMatchObject({
      status: 'FAILED',
      failedStage: 'fixtures',
      reason:
        query === 'tour'
          ? 'profile-cta upcoming tour query failed'
          : 'profile-cta profile query failed',
    });
    expect(readFileSync(f.output, 'utf8')).not.toContain('private');
  });
  it.each([
    true,
    false,
  ])('propagates receipt write failure even when fixture success is %s', async success => {
    const f = fixture();
    // A directory in place of the JSON destination deterministically rejects writing.
    mkdirSync(f.output, { recursive: true });
    if (!success) f.seed.mockResolvedValue({ success: false });
    await expect(
      runProfileCtaPreflight(f.env, f.webRoot, f.seed)
    ).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
