import { describe, expect, it, vi } from 'vitest';
import {
  DSP_BIO_PROVIDERS,
  getBioProvider,
} from '@/lib/dsp-bio-sync/providers';
import {
  confirmationFor,
  type DestinationSnapshot,
  type ProfileWriteAdapter,
  type ProfileWriteLedger,
  type ProfileWriteManifest,
  type ProfileWriteReceipt,
  redactProviderReceipt,
  safeValues,
} from './contract';
import { ProfileWriteService } from './service';

vi.mock('server-only', () => ({}));

const userId = 'c36d55a6-e330-4872-8692-fc634282145f';
const destination = {
  connectorAccountId: '1b4e6fd0-93fe-411f-a792-c45cb6166fa9',
  destinationAccountId: 'channel-1',
  providerId: 'youtube',
};

function fixture() {
  let clock = Date.parse('2026-10-15T12:00:00Z');
  let state: DestinationSnapshot = {
    values: { bio: 'Original bio', website: null },
    version: 'v1',
    observedAt: new Date(clock).toISOString(),
  };
  const manifest: ProfileWriteManifest = {
    providerId: 'youtube',
    version: '1',
    fields: ['bio', 'website'],
    requiredScopes: ['profile.write'],
    termsApproved: true,
    evidenceRef: 'test:conditional-restore-proof',
    evidenceExpiresAt: '2026-10-16T12:00:00Z',
    rollback: 'conditional-restore',
    rateLimitWindowSeconds: 60,
  };
  const rows: ProfileWriteReceipt[] = [];
  const rates = new Set<string>();
  const authorize = vi.fn<ProfileWriteLedger['authorize']>(
    async (actor, target, scopes) =>
      actor === userId &&
      target.connectorAccountId === destination.connectorAccountId &&
      target.destinationAccountId === destination.destinationAccountId &&
      scopes.includes('profile.write')
  );
  const append = vi.fn<ProfileWriteLedger['append']>(
    async (receipt, rateKey) => {
      if (
        rows.some(
          row =>
            row.proposal.id === receipt.proposal.id &&
            row.phase === receipt.phase
        ) ||
        (rateKey && rates.has(rateKey))
      )
        return false;
      if (rateKey) rates.add(rateKey);
      rows.push(structuredClone(receipt));
      return true;
    }
  );
  const ledger: ProfileWriteLedger = {
    authorize,
    append,
    get: async (actor, proposalId, phase) =>
      structuredClone(
        rows.find(
          row =>
            row.proposal.id === proposalId &&
            row.phase === phase &&
            row.proposal.userId === actor
        ) ?? null
      ),
  };
  const read = vi.fn(async () => structuredClone(state));
  const write = vi.fn<ProfileWriteAdapter['write']>(async input => {
    if (input.expectedVersion !== state.version)
      return {
        status: 'rejected',
        version: null,
        receipt: { statusCode: 412 },
      };
    state = {
      values: input.values,
      version: `${state.version}-next`,
      observedAt: new Date(clock).toISOString(),
    };
    return {
      status: 'applied',
      version: state.version,
      receipt: {
        statusCode: 200,
        requestId: 'provider-request',
        accessToken: 'private-provider-value',
      },
    };
  });
  const adapter: ProfileWriteAdapter = { manifest, read, write };
  const service = new ProfileWriteService(
    ledger,
    adapter,
    () => new Date(clock)
  );
  const propose = () =>
    service.propose({
      userId,
      destination,
      desired: { bio: 'New bio', website: 'https://example.test' },
    });
  const approved = async () => {
    const proposal = await propose();
    const approval = await service.approve(
      userId,
      proposal.id,
      confirmationFor(proposal)
    );
    return { proposal, approval };
  };
  return {
    service,
    ledger,
    manifest,
    rows,
    append,
    authorize,
    read,
    write,
    propose,
    approved,
    state: () => structuredClone(state),
    setState: (next: DestinationSnapshot) => {
      state = next;
    },
    advance: () => {
      clock += 60_000;
    },
  };
}

describe('immutable connector write receipts', () => {
  it('keeps a discarded four-field preview inert without approval', async () => {
    const f = fixture();
    Object.assign(f.manifest, {
      fields: ['bio', 'bioLink', 'image', 'website'],
    });
    f.setState({
      ...f.state(),
      values: {
        bio: 'Original bio',
        bioLink: null,
        image: null,
        website: null,
      },
    });
    const before = f.state();
    const preview = await f.service.propose({
      userId,
      destination,
      desired: {
        bio: 'Preview bio',
        bioLink: 'https://example.test/artist',
        image: 'https://example.test/image.jpg',
        website: 'https://example.test',
      },
    });
    expect(Object.keys(preview.desired)).toEqual([
      'bio',
      'bioLink',
      'image',
      'website',
    ]);
    // Discarding the preview gives no approval or execution authority.
    await expect(f.service.execute(userId, preview.id)).rejects.toThrow(
      'approval-required'
    );
    expect(f.state()).toEqual(before);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.rows.map(row => row.phase)).toEqual(['proposal']);
  });

  it('persists attributable start and outcome evidence and restores only via a newly approved proposal', async () => {
    const f = fixture();
    const { proposal, approval } = await f.approved();
    const written = await f.service.execute(userId, proposal.id);
    expect(written).toMatchObject({
      result: 'succeeded',
      approvalId: approval.id,
      actorId: userId,
      proposal: { ...destination, manifestVersion: '1' },
      before: { values: { bio: 'Original bio', website: null } },
      after: { values: proposal.desired },
      providerReceipt: {
        statusCode: 200,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(f.rows.map(row => row.phase)).toEqual([
      'proposal',
      'approval',
      'started',
      'outcome',
    ]);
    expect(written.idempotencyKey).toBe(
      f.write.mock.calls[0][0].idempotencyKey
    );
    expect(Date.parse(written.recordedAt)).toBeGreaterThanOrEqual(
      Date.parse(written.startedAt)
    );
    const rollback = await f.service.proposeRollback(userId, proposal.id);
    expect(rollback).toMatchObject({
      rollbackOf: written.id,
      desired: written.before.values,
      before: written.after,
    });
    await expect(f.service.execute(userId, rollback.id)).rejects.toThrow(
      'approval-required'
    );
    await expect(
      f.service.approve(userId, rollback.id, confirmationFor(proposal))
    ).rejects.toThrow('confirmation-mismatch');
    await f.service.approve(userId, rollback.id, confirmationFor(rollback));
    f.advance();
    const restored = await f.service.execute(userId, rollback.id);
    expect(restored.result).toBe('succeeded');
    expect(f.state().values).toEqual(written.before.values);
    expect(f.write).toHaveBeenCalledTimes(2);
  });

  it('returns the same durable outcome for duplicate executions', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    const first = await f.service.execute(userId, proposal.id);
    expect(await f.service.execute(userId, proposal.id)).toEqual(first);
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.rows).toHaveLength(4);
  });

  it('allows one concurrent execution to dispatch and retains its actual outcome', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    const results = await Promise.allSettled([
      f.service.execute(userId, proposal.id),
      f.service.execute(userId, proposal.id),
    ]);
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(
      results.filter(result => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(f.rows.find(row => row.phase === 'outcome')?.result).toBe(
      'succeeded'
    );
  });

  it.each(['started', 'outcome'] as const)(
    'fails closed when %s cannot be durably stored',
    async phase => {
      const f = fixture();
      const { proposal } = await f.approved();
      const append = f.append.getMockImplementation();
      f.append.mockImplementation(async (receipt, key) => {
        if (receipt.phase === phase) throw new Error('storage-unavailable');
        return append!(receipt, key);
      });
      await expect(f.service.execute(userId, proposal.id)).rejects.toThrow(
        'storage-unavailable'
      );
      expect(f.write).toHaveBeenCalledTimes(phase === 'started' ? 0 : 1);
      if (phase === 'outcome') {
        await expect(f.service.execute(userId, proposal.id)).rejects.toThrow(
          'execution-in-progress-or-unknown'
        );
        expect(f.write).toHaveBeenCalledTimes(1);
        expect(f.rows.map(row => row.phase)).toEqual([
          'proposal',
          'approval',
          'started',
        ]);
      }
    }
  );

  it.each(['proposal', 'approval', 'outcome'] as const)(
    'rejects a missing %s persistence acknowledgement',
    async phase => {
      const f = fixture();
      const append = f.append.getMockImplementation();
      f.append.mockImplementation(async (receipt, key) =>
        receipt.phase === phase ? false : append!(receipt, key)
      );
      if (phase === 'proposal') {
        await expect(f.propose()).rejects.toThrow('proposal-not-stored');
      } else if (phase === 'approval') {
        const proposal = await f.propose();
        await expect(
          f.service.approve(userId, proposal.id, confirmationFor(proposal))
        ).rejects.toThrow('already-approved');
      } else {
        const { proposal } = await f.approved();
        await expect(f.service.execute(userId, proposal.id)).rejects.toThrow(
          'outcome-not-stored'
        );
      }
    }
  );

  it('blocks stale destination state at rollback creation and again at execution', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    await f.service.execute(userId, proposal.id);
    const written = f.state();
    f.setState({ ...written, version: 'external-edit' });
    await expect(
      f.service.proposeRollback(userId, proposal.id)
    ).rejects.toThrow('stale-destination');
    f.setState(written);
    const rollback = await f.service.proposeRollback(userId, proposal.id);
    await f.service.approve(userId, rollback.id, confirmationFor(rollback));
    f.advance();
    f.setState({ ...written, values: { bio: 'Human edit', website: null } });
    expect(await f.service.execute(userId, rollback.id)).toMatchObject({
      result: 'blocked',
      reason: 'stale-destination',
    });
    expect(f.write).toHaveBeenCalledTimes(1);
  });

  it('requires conditional writes to reject an edit between preflight and dispatch', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    const write = f.write.getMockImplementation();
    f.write.mockImplementation(async input => {
      f.setState({
        ...f.state(),
        version: 'concurrent-edit',
        values: { bio: 'Human edit', website: null },
      });
      return write!(input);
    });
    expect((await f.service.execute(userId, proposal.id)).result).toBe(
      'failed'
    );
    expect(f.state().values.bio).toBe('Human edit');
  });

  it('captures partial provider failure and offers the known previous state as rollback', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    f.write.mockImplementationOnce(async () => {
      f.setState({
        ...f.state(),
        version: 'v2',
        values: { bio: 'New bio', website: null },
      });
      return {
        status: 'partial',
        version: 'v2',
        receipt: { statusCode: 500, message: 'Bearer private-provider-value' },
      };
    });
    const partial = await f.service.execute(userId, proposal.id);
    expect(partial).toMatchObject({
      result: 'partial',
      reason: null,
      after: { version: 'v2' },
    });
    const rollback = await f.service.proposeRollback(userId, proposal.id);
    await f.service.approve(userId, rollback.id, confirmationFor(rollback));
    f.advance();
    expect((await f.service.execute(userId, rollback.id)).result).toBe(
      'succeeded'
    );
    expect(f.state().values).toEqual(proposal.before.values);
    expect(JSON.stringify(f.rows)).not.toContain('private-provider-value');
  });

  it('retains unknown evidence without success, rollback authority or a duplicate write', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    f.read
      .mockResolvedValueOnce(f.state())
      .mockRejectedValueOnce(new Error('read timeout'));
    const result = await f.service.execute(userId, proposal.id);
    expect(result).toMatchObject({
      result: 'unknown',
      after: null,
      reason: 'readback-failed',
    });
    await expect(
      f.service.proposeRollback(userId, proposal.id)
    ).rejects.toThrow('rollback-unprovable');
    expect(await f.service.execute(userId, proposal.id)).toEqual(result);
    expect(f.write).toHaveBeenCalledTimes(1);
  });

  it('records a provider failure without assuming that throwing means nothing changed', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    f.write.mockRejectedValueOnce(new Error('private failure'));
    expect(await f.service.execute(userId, proposal.id)).toMatchObject({
      result: 'unknown',
      reason: 'provider-result-unknown',
      after: proposal.before,
    });
    await expect(
      f.service.proposeRollback(userId, proposal.id)
    ).rejects.toThrow('rollback-unprovable');
  });

  it('does not infer success from an acknowledged provider call with unchanged state', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    f.write.mockResolvedValueOnce({
      status: 'applied',
      version: f.state().version,
      receipt: { statusCode: 200 },
    });
    expect((await f.service.execute(userId, proposal.id)).result).toBe(
      'partial'
    );
  });

  it('applies the shared account rate gate to rollback', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    await f.service.execute(userId, proposal.id);
    const rollback = await f.service.proposeRollback(userId, proposal.id);
    await f.service.approve(userId, rollback.id, confirmationFor(rollback));
    expect(await f.service.execute(userId, rollback.id)).toMatchObject({
      result: 'blocked',
      reason: 'rate-limited',
    });
    expect(f.write).toHaveBeenCalledTimes(1);
  });

  it('captures partial rollback failure and deduplicates its subsequent execution', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    await f.service.execute(userId, proposal.id);
    const rollback = await f.service.proposeRollback(userId, proposal.id);
    await f.service.approve(userId, rollback.id, confirmationFor(rollback));
    f.advance();
    f.write.mockImplementationOnce(async () => {
      f.setState({
        ...f.state(),
        version: 'rollback-partial',
        values: { bio: 'Original bio', website: 'https://example.test' },
      });
      return {
        status: 'partial',
        version: 'rollback-partial',
        receipt: { statusCode: 500 },
      };
    });
    const result = await f.service.execute(userId, rollback.id);
    expect(result.result).toBe('partial');
    expect(result.before.values).toEqual(proposal.desired);
    expect(result.after?.values).toEqual(f.state().values);
    expect(await f.service.execute(userId, rollback.id)).toEqual(result);
    expect(f.write).toHaveBeenCalledTimes(2);
  });

  it.each(['timeout', 'mismatched-version'] as const)(
    'denies rollback authority for unattributable state after %s',
    async failure => {
      const f = fixture();
      const { proposal } = await f.approved();
      const write = f.write.getMockImplementation();
      f.write.mockImplementationOnce(async input => {
        const result = await write!(input);
        if (failure === 'timeout') throw new Error('private error');
        return { ...result, version: 'different-provider-write' };
      });
      expect((await f.service.execute(userId, proposal.id)).result).toBe(
        'unknown'
      );
      await expect(
        f.service.proposeRollback(userId, proposal.id)
      ).rejects.toThrow('rollback-unprovable');
    }
  );

  it('rechecks destination authorization for approval, execution, replay and rollback', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    await expect(
      f.service.execute('another-user', proposal.id)
    ).rejects.toThrow('proposal-not-found');
    await f.service.execute(userId, proposal.id);
    f.authorize.mockResolvedValue(false);
    await expect(
      f.service.approve(userId, proposal.id, confirmationFor(proposal))
    ).rejects.toThrow('unauthorized-destination');
    await expect(f.service.execute(userId, proposal.id)).rejects.toThrow(
      'unauthorized-destination'
    );
    await expect(
      f.service.proposeRollback(userId, proposal.id)
    ).rejects.toThrow('unauthorized-destination');
  });

  it.each(['version', 'evidence', 'terms', 'expiry', 'revocation'] as const)(
    'blocks rollback when %s changes after confirmation',
    async change => {
      const f = fixture();
      const { proposal } = await f.approved();
      await f.service.execute(userId, proposal.id);
      const rollback = await f.service.proposeRollback(userId, proposal.id);
      await f.service.approve(userId, rollback.id, confirmationFor(rollback));
      f.advance();
      if (change === 'version') Object.assign(f.manifest, { version: '2' });
      if (change === 'evidence')
        Object.assign(f.manifest, {
          evidenceExpiresAt: '2020-01-01T00:00:00Z',
        });
      if (change === 'terms')
        Object.assign(f.manifest, { termsApproved: false });
      if (change === 'expiry') for (let i = 0; i < 16; i++) f.advance();
      if (change === 'revocation') f.authorize.mockResolvedValue(false);
      if (change === 'revocation') {
        await expect(f.service.execute(userId, rollback.id)).rejects.toThrow(
          'unauthorized-destination'
        );
      } else {
        expect((await f.service.execute(userId, rollback.id)).result).toBe(
          'blocked'
        );
      }
      expect(f.write).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['manual', 'unsupported'] as const)(
    'rejects automated writes for a %s rollback manifest',
    async rollback => {
      const f = fixture();
      Object.assign(f.manifest, { rollback });
      await expect(f.propose()).rejects.toThrow(`rollback-${rollback}`);
      expect(f.read).not.toHaveBeenCalled();
      expect(f.write).not.toHaveBeenCalled();
    }
  );

  it('marks all existing bio destinations without a proven restore path', () => {
    for (const id of Object.keys(DSP_BIO_PROVIDERS)) {
      const provider = getBioProvider(id)!;
      expect(provider.rollback).toBe(
        provider.method === 'email' ? 'manual' : 'unsupported'
      );
    }
  });

  it('never persists request credentials, opaque provider bodies or exception messages', async () => {
    const f = fixture();
    const { proposal } = await f.approved();
    f.write.mockResolvedValueOnce({
      status: 'rejected',
      version: null,
      receipt: {
        statusCode: 200,
        nested: { refresh_token: 'private-provider-value' },
        message: 'private-provider-value',
        url: 'https://example.test?token=private-provider-value',
      },
    });
    await f.service.execute(userId, proposal.id);
    expect(JSON.stringify(f.rows)).not.toContain('private-provider-value');
    expect(redactProviderReceipt('private-provider-value')).toEqual({
      sha256: expect.any(String),
    });
    expect(redactProviderReceipt(null)).toEqual({ sha256: expect.any(String) });
    expect(
      redactProviderReceipt({
        statusCode: 999,
        token: 'private-provider-value',
      })
    ).toEqual({ sha256: expect.any(String) });
    expect(f.rows[0].requestMetadata).toEqual({
      fields: ['bio', 'website'],
      payloadSha256: expect.any(String),
    });
  });

  it.each([
    { image: 'https://example.test/image?signature=private-value' },
    {
      website: Object.assign(new URL('https://example.test'), {
        username: 'user',
        password: 'private-value',
      }).toString(),
    },
    { website: 'http://example.test' },
    { bio: 'access_token=private-value' },
    { bio: 'Bearer private-value' },
  ])(
    'refuses credential-bearing or non-durable snapshot values: %j',
    values => {
      expect(() => safeValues(values)).toThrow('unsafe-destination-value');
    }
  );

  it('refuses incomplete managed snapshots rather than guessing rollback values', async () => {
    const f = fixture();
    await expect(
      f.service.propose({
        userId,
        destination,
        desired: { bio: 'New bio' },
      })
    ).rejects.toThrow('incomplete-destination-snapshot');
  });
});
