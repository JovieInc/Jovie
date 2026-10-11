import { describe, expect, it } from 'vitest';
import { buildCertificationDecisionDigest } from '@/lib/agent-os/certification';
import {
  fixturePacket,
  fixtureReceipt,
  memoryCertificationBackend,
} from './fixtures';
import {
  PacketDecisionPersistenceError,
  packetDecisionLedgerKey,
  parsePacketDecisionLedger,
  readPacketDecisionLedger,
  recordPacketFounderDecision,
} from './packet-decisions';
import type { CertificationPacketFile } from './packet-files.server';

function packetFile(
  subjectId = 'signup',
  overrides: Partial<CertificationPacketFile> = {}
): CertificationPacketFile {
  return {
    domain: 'flows',
    surface: 'Golden Path',
    packetUpdatedAt: '2026-09-27T07:00:00.000Z',
    links: [],
    packet: fixturePacket(subjectId),
    file: `docs/certification/${subjectId}.packet.json`,
    ...overrides,
  };
}

const DECIDED_AT = '2026-09-27T08:00:00.000Z';

function approve(file: CertificationPacketFile, id = 'action-0001') {
  return {
    id,
    decision: 'approved' as const,
    evidenceDigest: buildCertificationDecisionDigest(file.packet),
    notes: null,
    reviewer: 'founder@example.test',
  };
}

describe('recordPacketFounderDecision', () => {
  it('records an approval bound to the kernel digest and persists it', async () => {
    const backend = memoryCertificationBackend();
    const file = packetFile();

    const result = await recordPacketFounderDecision({
      backend,
      target: file,
      decidedAt: DECIDED_AT,
      decision: approve(file),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.admission.state).toBe('founder_locked');
    const ledger = await readPacketDecisionLedger(backend, 'flows');
    expect(ledger.records.signup?.decisions).toEqual([
      expect.objectContaining({
        id: 'action-0001',
        subjectId: 'signup',
        decision: 'approved',
        reviewer: 'founder@example.test',
        decidedAt: DECIDED_AT,
      }),
    ]);
    expect(ledger.records.signup?.auditHistory.length).toBeGreaterThan(0);
  });

  it('rejects a replayed action id across subjects without writing', async () => {
    const backend = memoryCertificationBackend();
    const first = packetFile('a');
    const second = packetFile('b');
    await recordPacketFounderDecision({
      backend,
      target: first,
      decidedAt: DECIDED_AT,
      decision: approve(first, 'shared-action'),
    });
    const before = backend.records.get(packetDecisionLedgerKey('flows'));

    const replay = await recordPacketFounderDecision({
      backend,
      target: second,
      decidedAt: DECIDED_AT,
      decision: approve(second, 'shared-action'),
    });

    expect(replay).toMatchObject({
      ok: false,
      reason: 'duplicate_founder_decision',
    });
    expect(backend.records.get(packetDecisionLedgerKey('flows'))).toBe(before);
  });

  it('rejects a second decision on the same evidence', async () => {
    const backend = memoryCertificationBackend();
    const file = packetFile();
    await recordPacketFounderDecision({
      backend,
      target: file,
      decidedAt: DECIDED_AT,
      decision: approve(file, 'action-1'),
    });
    const again = await recordPacketFounderDecision({
      backend,
      target: file,
      decidedAt: DECIDED_AT,
      decision: { ...approve(file, 'action-2'), decision: 'rejected' },
    });
    expect(again).toMatchObject({
      ok: false,
      reason: 'duplicate_founder_decision',
    });
  });

  it('rejects a stale digest and a packet that is not review-ready', async () => {
    const backend = memoryCertificationBackend();
    const file = packetFile();
    const stale = await recordPacketFounderDecision({
      backend,
      target: file,
      decidedAt: DECIDED_AT,
      decision: { ...approve(file), evidenceDigest: 'f'.repeat(64) },
    });
    expect(stale).toMatchObject({
      ok: false,
      reason: 'decision_digest_mismatch',
    });

    const incomplete = packetFile('incomplete', {
      packet: fixturePacket('incomplete', {
        visualProof: [fixtureReceipt('visual_proof', 'v', 'failed')],
      }),
    });
    const notReady = await recordPacketFounderDecision({
      backend,
      target: incomplete,
      decidedAt: DECIDED_AT,
      decision: approve(incomplete, 'action-x'),
    });
    expect(notReady).toMatchObject({
      ok: false,
      reason: 'packet_not_review_ready',
    });
  });

  it('refuses a decision that predates the packet', async () => {
    const backend = memoryCertificationBackend();
    const file = packetFile();
    await expect(
      recordPacketFounderDecision({
        backend,
        target: file,
        decidedAt: '2026-09-27T06:00:00.000Z',
        decision: approve(file),
      })
    ).resolves.toEqual({ ok: false, reason: 'decision_predates_packet' });
    expect(backend.records.size).toBe(0);
  });
});

describe('parsePacketDecisionLedger', () => {
  it('returns an empty ledger for an absent key without writing', async () => {
    const backend = memoryCertificationBackend();
    await expect(readPacketDecisionLedger(backend, 'lyb')).resolves.toEqual({
      schemaVersion: 1,
      contract: 'jovie.certification/v1',
      domain: 'lyb',
      records: {},
    });
    expect(backend.records.size).toBe(0);
  });

  it.each([
    ['invalid JSON', '{nope'],
    [
      'wrong domain',
      JSON.stringify({
        schemaVersion: 1,
        contract: 'jovie.certification/v1',
        domain: 'lyb',
        records: {},
      }),
    ],
    [
      'forged decision subject',
      JSON.stringify({
        schemaVersion: 1,
        contract: 'jovie.certification/v1',
        domain: 'flows',
        records: {
          signup: {
            decisions: [
              {
                id: 'd',
                subjectId: 'other',
                evidenceDigest: 'x',
                decision: 'approved',
                decidedAt: DECIDED_AT,
                reviewer: 'r',
                notes: null,
              },
            ],
            auditHistory: [],
            updatedAt: DECIDED_AT,
          },
        },
      }),
    ],
  ])('fails closed on %s', (_label, raw) => {
    expect(() => parsePacketDecisionLedger(raw, 'flows')).toThrow(
      PacketDecisionPersistenceError
    );
  });
});
