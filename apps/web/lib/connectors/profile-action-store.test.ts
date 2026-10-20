import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as approve } from '@/app/api/connectors/suggested-actions/[id]/approve/route';
import { POST as reject } from '@/app/api/connectors/suggested-actions/[id]/reject/route';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import type { NewSuggestedAction } from '@/lib/db/schema/connectors';
import { unknownArtistProfileContract } from './artist-profile-contract';
import {
  parseProfileAction,
  profileActionPayloadSchema,
  profilePreviewChecksum,
} from './profile-action';
import {
  approveProfileAction,
  proposeProfileAction,
} from './profile-action-store';
import { digest } from './profile-writes/contract';
import { getConnectorDefinition } from './registry';
import { resolveSuggestedActionDispatch } from './suggested-action-dispatch';
import {
  PROFILE_ACCEPT_OBSERVATION_KIND,
  PROFILE_WRITE_DESTINATION_KIND,
} from './suggested-action-kinds';
import { recoverOrphanedApprovedAction } from './workflows/reconcile-orphaned-approved-actions';

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: vi.fn(),
}));
vi.mock('./registry', () => ({ getConnectorDefinition: vi.fn() }));
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: async () => ({
    userId: '00000000-0000-4000-8000-000000000001',
    error: null,
  }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/youtube-library', () => ({
  reconcileThumbnailCandidateDecision: vi.fn(),
  YouTubeThumbnailDecisionError: class extends Error {},
}));

const USER = '00000000-0000-4000-8000-000000000001';
const PROFILE = '00000000-0000-4000-8000-000000000002';
const ACCOUNT = '00000000-0000-4000-8000-000000000003';
const OBSERVATION = '00000000-0000-4000-8000-000000000004';
const dialect = new PgDialect();

/** Hypothetical ready manifest; no real provider readiness is asserted. */
function readyManifest() {
  const contract = unknownArtistProfileContract('fixture:unknown');
  const auth = {
    status: 'verified',
    mechanism: 'oauth',
    requiredScopes: ['fixture:profile'],
    resource: 'fixture:connected-account',
    requiredRole: 'owner',
    evidenceRef: 'fixture:ownership',
  } as const;
  contract.fields.bio = {
    read: 'supported',
    write: 'supported',
    authorization: { read: auth, write: auth },
    validation: { status: 'documented', policyRef: 'fixture:validation' },
    preview: {
      status: 'required',
      policyRef: 'fixture:preview',
      binding: 'destination_field_value',
    },
    confirmation: {
      status: 'required',
      policyRef: 'fixture:confirmation',
      binding: 'destination_field_value',
    },
    rateLimit: {
      status: 'documented',
      policyRef: 'fixture:quota',
      key: 'connection',
      maxRequests: 1,
      windowSeconds: 60,
      onLimit: 'respect_retry_after',
    },
    audit: { mode: 'before_after', policyRef: 'fixture:audit' },
    rollback: { mode: 'unsupported', reason: 'fixture:no-rollback' },
    termsApi: {
      status: 'approved',
      api: 'official',
      apiRef: 'fixture:api',
      termsRef: 'fixture:terms',
      evidenceRef: 'fixture:terms-review',
    },
    evidence: {
      status: 'documented',
      requirements: [
        'authorization',
        'documentation',
        'validation',
        'preview',
        'confirmation',
        'before_after',
        'readback',
      ],
      refs: ['fixture:verified'],
    },
  };
  return contract;
}

let manifest = readyManifest();
let rows: NewSuggestedAction[] = [];
let account = {
  id: ACCOUNT,
  provider: 'youtube',
  providerAccountId: 'channel-original',
  creatorProfileId: PROFILE,
  scopes: ['fixture:profile'],
};
let profile = {
  id: PROFILE,
  bio: 'Canonical bio',
  avatarUrl: null,
  username: 'artist',
  usernameNormalized: 'artist',
  profileEditVersion: 1,
};
let observation: unknown = { bio: 'Observed bio' };
let links: Record<string, unknown>[] = [];
let casMiss = false;
let lastCas: ReturnType<PgDialect['sqlToQuery']> | undefined;

function installDb() {
  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: (table: Parameters<typeof getTableName>[0]) => ({
          where: (predicate: SQL) => {
            const params = dialect.sqlToQuery(predicate).params;
            const tableName = getTableName(table);
            const result = () => {
              if (tableName === 'suggested_actions')
                return structuredClone(
                  rows.filter(
                    row =>
                      row.id === params[0] &&
                      (!params[1] || row.userId === params[1])
                  )
                );
              if (tableName === 'connector_accounts')
                return params[0] === account.id
                  ? [structuredClone(account)]
                  : [];
              if (tableName === 'creator_profiles')
                return [structuredClone(profile)];
              if (tableName === 'external_objects')
                return params[0] === OBSERVATION && params[1] === ACCOUNT
                  ? [{ payload: structuredClone(observation) }]
                  : [];
              return [];
            };
            return {
              limit: async () => result(),
              orderBy: async () => structuredClone(links),
            };
          },
        }),
      }) as unknown as ReturnType<typeof db.select>
  );
  vi.mocked(db.insert).mockImplementation(
    () =>
      ({
        values: (row: NewSuggestedAction) => ({
          returning: async () => {
            rows.push(structuredClone(row));
            return [{ id: row.id }];
          },
        }),
      }) as unknown as ReturnType<typeof db.insert>
  );
  vi.mocked(db.update).mockImplementation(
    () =>
      ({
        set: (changes: Partial<NewSuggestedAction>) => ({
          where: (predicate: SQL) => ({
            returning: async () => {
              lastCas = dialect.sqlToQuery(predicate);
              const row = rows.find(
                candidate => candidate.id === lastCas?.params[0]
              );
              if (casMiss || !row || row.status !== 'pending') return [];
              Object.assign(row, structuredClone(changes));
              return [{ id: row.id, kind: row.kind }];
            },
          }),
        }),
      }) as unknown as ReturnType<typeof db.update>
  );
}

async function proposal(
  kind = PROFILE_WRITE_DESTINATION_KIND as
    | typeof PROFILE_WRITE_DESTINATION_KIND
    | typeof PROFILE_ACCEPT_OBSERVATION_KIND
) {
  return proposeProfileAction({
    userId: USER,
    kind,
    creatorProfileId: PROFILE,
    connectorAccountId: ACCOUNT,
    values: {
      bio:
        kind === PROFILE_WRITE_DESTINATION_KIND
          ? 'Canonical bio'
          : 'Observed bio',
    },
    ...(kind === PROFILE_ACCEPT_OBSERVATION_KIND
      ? { observationId: OBSERVATION }
      : {}),
    evidenceRefs: ['  fixture:source  '],
    rationale: '  Artist requested profile consistency  ',
  });
}

function confirmation(saved: Awaited<ReturnType<typeof proposal>>) {
  return {
    mode: 'exact_preview',
    previewChecksum: saved.payload.previewChecksum,
  };
}

function request(id: string, body?: unknown) {
  return new Request(
    `https://jov.ie/api/connectors/suggested-actions/${id}/approve`,
    {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  manifest = readyManifest();
  profile = {
    id: PROFILE,
    bio: 'Canonical bio',
    avatarUrl: null,
    username: 'artist',
    usernameNormalized: 'artist',
    profileEditVersion: 1,
  };
  account = {
    id: ACCOUNT,
    provider: 'youtube',
    providerAccountId: 'channel-original',
    creatorProfileId: PROFILE,
    scopes: ['fixture:profile'],
  };
  observation = { bio: 'Observed bio' };
  links = [];
  casMiss = false;
  lastCas = undefined;
  vi.mocked(getExactProfileAccess).mockResolvedValue({
    ok: true,
    profileId: PROFILE,
    ownerUserId: USER,
  });
  vi.mocked(getConnectorDefinition).mockImplementation(
    () =>
      ({ artistProfile: manifest }) as ReturnType<typeof getConnectorDefinition>
  );
  installDb();
});

describe('exact-revision profile proposals and consent', () => {
  it.each([PROFILE_ACCEPT_OBSERVATION_KIND, PROFILE_WRITE_DESTINATION_KIND])(
    'persists a validated %s preview and consent without dispatching side effects',
    async kind => {
      const saved = await proposal(kind);
      expect(rows[0]).toMatchObject({
        kind,
        targetConnectorAccountId: ACCOUNT,
        sourceRefs: ['fixture:source'],
        status: 'pending',
        sideEffects: [],
      });
      expect(saved.payload.proposal).toMatchObject({
        target: {
          connectorAccountId: ACCOUNT,
          providerAccountId: 'channel-original',
        },
        fields: ['bio'],
        evidenceRefs: ['fixture:source'],
        requiredConfirmationMode: 'exact_preview',
        canonicalRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
        manifestVersion: digest(manifest),
      });
      expect(resolveSuggestedActionDispatch(saved)).toEqual({
        mode: 'profile-consent',
      });
      const response = await approve(request(saved.id, confirmation(saved)), {
        params: Promise.resolve({ id: saved.id }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        status: 'approved',
      });
      expect(parseProfileAction(kind, rows[0].payload)?.consent).toMatchObject({
        ...confirmation(saved),
        actorId: USER,
      });
      expect(db.insert).toHaveBeenCalledTimes(1); // Proposal only; no workflow or provider mutation.
      expect(lastCas?.sql).toContain('"suggested_actions"."status" =');
      expect(lastCas?.sql).toContain('"suggested_actions"."payload" =');
      expect(lastCas?.sql).toContain(
        '"creator_profiles"."profile_edit_version" ='
      );
      expect(lastCas?.sql).toContain(
        '"connector_accounts"."provider_account_id" ='
      );
      expect(lastCas?.sql).toContain('jsonb_agg');
    }
  );

  it.each([
    undefined,
    { mode: 'oauth' },
    { consent: true },
    {
      mode: 'exact_preview',
      previewChecksum: 'a'.repeat(64),
      values: { bio: 'Altered' },
    },
  ])(
    'OAuth access cannot substitute for exact confirmation: %j',
    async body => {
      const saved = await proposal();
      const response = await approve(request(saved.id, body), {
        params: Promise.resolve({ id: saved.id }),
      });
      expect(response.status).toBe(422);
      expect(rows[0].status).toBe('pending');
      expect(db.update).not.toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects with no canonical mutation, consent or execution and cannot subsequently approve', async () => {
    const saved = await proposal();
    const before = structuredClone({ profile, account, observation });
    const response = await reject(request(saved.id), {
      params: Promise.resolve({ id: saved.id }),
    });
    expect(response.status).toBe(200);
    expect(rows[0].status).toBe('rejected');
    expect(parseProfileAction(saved.kind, rows[0].payload)?.consent).toBeNull();
    expect({ profile, account, observation }).toEqual(before);
    expect(db.insert).toHaveBeenCalledTimes(1);
    await expect(
      approveProfileAction({
        id: saved.id,
        userId: USER,
        confirmation: confirmation(saved),
      })
    ).rejects.toThrow('already-decided');
  });

  it('makes concurrent and repeated approval idempotent while retaining the original receipt', async () => {
    const saved = await proposal();
    const input = {
      id: saved.id,
      userId: USER,
      confirmation: confirmation(saved),
    };
    const results = await Promise.all([
      approveProfileAction(input),
      approveProfileAction(input),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([
      'already-approved',
      'approved',
    ]);
    const receipt = structuredClone(rows[0].payload);
    const updates = vi.mocked(db.update).mock.calls.length;
    profile.profileEditVersion++;
    await expect(approveProfileAction(input)).resolves.toMatchObject({
      status: 'already-approved',
    });
    expect(rows[0].payload).toEqual(receipt);
    expect(db.update).toHaveBeenCalledTimes(updates);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it.each([
    'canonical revision',
    'canonical value',
    'website',
    'manifest',
    'account',
    'scopes',
    'ownership',
    'readiness',
    'observation',
  ])('requires a fresh preview after a change in %s', async change => {
    const saved = await proposal(
      change === 'observation'
        ? PROFILE_ACCEPT_OBSERVATION_KIND
        : PROFILE_WRITE_DESTINATION_KIND
    );
    if (change === 'canonical revision') profile.profileEditVersion++;
    if (change === 'canonical value')
      profile.bio = 'Changed without incrementing version';
    if (change === 'website')
      links = [
        {
          id: OBSERVATION,
          platform: 'website',
          platformType: 'website',
          url: 'https://example.com',
          sortOrder: 0,
          isActive: true,
          state: 'active',
        },
      ];
    if (change === 'manifest')
      manifest.fields.bio.validation = {
        status: 'documented',
        policyRef: 'fixture:changed-policy',
      };
    if (change === 'account') account.providerAccountId = 'channel-reconnected';
    if (change === 'scopes') account.scopes = [];
    if (change === 'ownership')
      vi.mocked(getExactProfileAccess).mockResolvedValue({
        ok: false,
        reason: 'forbidden',
      });
    if (change === 'readiness')
      manifest = unknownArtistProfileContract('fixture:revoked');
    if (change === 'observation')
      observation = { bio: 'Different observation' };
    await expect(
      approveProfileAction({
        id: saved.id,
        userId: USER,
        confirmation: confirmation(saved),
      })
    ).rejects.toThrow(/profile-action-/);
    expect(rows[0].status).toBe('pending');
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    'values',
    'target',
    'column',
    'checksum',
    'proposal identity',
    'confirmation mode',
  ])('cannot reuse confirmation after altering %s', async change => {
    const saved = await proposal();
    const payload = profileActionPayloadSchema.parse(rows[0].payload);
    if (change === 'values') payload.proposal.values.bio = 'Altered value';
    if (change === 'target')
      payload.proposal.target.providerAccountId = 'another-account';
    if (change === 'column') rows[0].targetConnectorAccountId = OBSERVATION;
    if (change === 'checksum') payload.previewChecksum = 'b'.repeat(64);
    if (change === 'proposal identity') rows[0].id = OBSERVATION;
    rows[0].payload = payload;
    const consent =
      change === 'confirmation mode'
        ? { ...confirmation(saved), mode: 'oauth' }
        : confirmation(saved);
    await expect(
      approveProfileAction({
        id: rows[0].id ?? saved.id,
        userId: USER,
        confirmation: consent,
      })
    ).rejects.toThrow(/profile-action-/);
    expect(rows[0].status).toBe('pending');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('binds confirmation to the actor and refuses other users', async () => {
    const saved = await proposal();
    await expect(
      approveProfileAction({
        id: saved.id,
        userId: OBSERVATION,
        confirmation: confirmation(saved),
      })
    ).rejects.toThrow('not-found');
    expect(db.update).not.toHaveBeenCalled();
    expect(
      profilePreviewChecksum({
        id: saved.id,
        userId: OBSERVATION,
        kind: saved.kind,
        proposal: saved.payload.proposal,
      })
    ).not.toBe(saved.payload.previewChecksum);
  });

  it('refuses an otherwise valid confirmation for a different preview', async () => {
    const saved = await proposal();
    await expect(
      approveProfileAction({
        id: saved.id,
        userId: USER,
        confirmation: {
          mode: 'exact_preview',
          previewChecksum: 'a'.repeat(64),
        },
      })
    ).rejects.toThrow('profile-action-preview-mismatch');
    expect(rows[0].status).toBe('pending');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('fails closed when the CAS detects concurrent source changes', async () => {
    const saved = await proposal();
    casMiss = true;
    const response = await approve(request(saved.id, confirmation(saved)), {
      params: Promise.resolve({ id: saved.id }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ requiresNewPreview: true });
    expect(rows[0].status).toBe('pending');
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('does not recover approved profile proposals into the calendar executor', async () => {
    const saved = await proposal();
    await approveProfileAction({
      id: saved.id,
      userId: USER,
      confirmation: confirmation(saved),
    });
    await expect(
      recoverOrphanedApprovedAction({ approvalId: saved.id, userId: USER })
    ).resolves.toBe('non-executable');
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('refuses unsupported or malformed proposals and non-canonical destination values', async () => {
    expect(parseProfileAction('profile.unknown', {})).toBeNull();
    expect(parseProfileAction(PROFILE_WRITE_DESTINATION_KIND, {})).toBeNull();
    const saved = await proposal();
    expect(
      parseProfileAction(PROFILE_ACCEPT_OBSERVATION_KIND, saved.payload)
    ).toBeNull();
    for (const patch of [
      { fields: ['bio', 'bio'] },
      { fields: ['unknown'] },
      { values: { bio: 'ok', unexpected: true } },
      { requiredConfirmationMode: 'oauth' },
      { observation: { id: OBSERVATION, checksum: 'a'.repeat(64) } },
    ]) {
      expect(
        parseProfileAction(saved.kind, {
          ...saved.payload,
          proposal: { ...saved.payload.proposal, ...patch },
        })
      ).toBeNull();
    }
    await expect(
      proposeProfileAction({
        userId: USER,
        kind: PROFILE_WRITE_DESTINATION_KIND,
        creatorProfileId: PROFILE,
        connectorAccountId: ACCOUNT,
        values: { bio: 'Unrelated text' },
        evidenceRefs: ['fixture:source'],
        rationale: 'Reason',
      })
    ).rejects.toThrow('profile-action-values-not-canonical');
  });
});
