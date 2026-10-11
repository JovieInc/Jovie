import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildCertificationDecisionDigest,
  evaluateCertificationAdmission,
} from '@/lib/agent-os/certification';
import {
  FIXTURE_NOW,
  FIXTURE_SHA,
  fixtureInventory,
  fixturePacket,
  fixtureReceipt,
  fixtureRow,
} from './fixtures';
import {
  countCertificationStates,
  normalizeKernelCertificationRow,
  OVIE_CERTIFICATION_HISTORY_LIMIT,
  resolveEvidenceHref,
} from './normalize';

describe('normalizeKernelCertificationRow', () => {
  it('runs real admission fixtures in a browser bundle with identical evidence digests', () => {
    const entry = fileURLToPath(new URL('./fixtures.ts', import.meta.url));
    const browserScript = `
      import { build } from 'vite';
      const result = await build({
        configFile: false,
        logLevel: 'silent',
        resolve: { alias: { '@': process.cwd() } },
        build: {
          write: false,
          minify: false,
          lib: { entry: ${JSON.stringify(entry)}, formats: ['es'] },
        },
      });
      const output = Array.isArray(result) ? result[0].output : result.output;
      const chunk = output.find(item => item.type === 'chunk' && item.isEntry);
      if (!chunk) throw new Error('Browser fixture entry was not emitted');
      try {
        const fixtures = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
        process.stdout.write(JSON.stringify(fixtures.fixtureInventory()));
      } catch (error) {
        process.stderr.write(error.message);
        process.exit(1);
      }
    `;
    const browserInventory = JSON.parse(
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', browserScript],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 }
      )
    );
    expect(browserInventory).toEqual(fixtureInventory());
    expect(
      browserInventory.rows.map((row: { state: string }) => row.state)
    ).toEqual(['review_ready', 'working', 'founder_locked']);
  });

  it.each([
    [
      'Flow signup',
      'sha256:4eef1a42d11113be250cd5f076f3d9ec0a28914e0d06212cb898093924d65832',
    ],
    [
      'L’été · 東京 🎵',
      'sha256:b268dd194303ea0cd162eb47a1a2df013128f76b115891adbb1652b79b32ece3',
    ],
  ])(
    'preserves the existing Node SHA-256 evidence digest for %s',
    (title, digest) => {
      const packet = fixturePacket('signup', {
        subject: { id: 'signup', kind: 'flow', title },
      });
      expect(buildCertificationDecisionDigest(packet)).toBe(digest);
    }
  );

  it('projects a review-ready packet into a decidable row bound to the kernel digest', () => {
    const packet = fixturePacket('signup');
    const row = fixtureRow('signup');

    expect(row).toMatchObject({
      id: 'flows:signup',
      domain: 'flows',
      surface: 'Golden Path',
      subject: { id: 'signup', kind: 'flow', title: 'Flow signup' },
      state: 'review_ready',
      blockers: [],
      staleFounderLock: false,
      decision: {
        available: true,
        reason: null,
        evidenceDigest: buildCertificationDecisionDigest(packet),
      },
      source: {
        repository: 'JovieInc/Jovie',
        sha: FIXTURE_SHA,
        paths: ['apps/web/app/(auth)/signup/page.tsx'],
      },
    });
    expect(row.tiers).toEqual({
      canonical_source: 'passed',
      invariant_evaluation: 'passed',
      tests_coverage: 'passed',
      visual_proof: 'passed',
      canonical_references: 'passed',
      required_variants: 'passed',
      ci: 'missing',
      queue_merge: 'missing',
      deploy: 'missing',
      runtime_dogfood: 'missing',
    });
  });

  it('marks failed, pending, and missing tiers and withholds the decision with a reason', () => {
    const row = fixtureRow('claim', {
      packet: fixturePacket('claim', {
        visualProof: [fixtureReceipt('visual_proof', 'v', 'failed')],
        testsCoverage: [fixtureReceipt('tests_coverage', 't', 'pending')],
        invariantEvaluation: [],
        operational: {
          ci: [fixtureReceipt('ci', 'ci-1', 'blocked')],
          runtimeDogfood: [fixtureReceipt('runtime_dogfood', 'dog-1')],
        },
      }),
    });

    expect(row.state).toBe('working');
    expect(row.tiers.visual_proof).toBe('failed');
    expect(row.tiers.tests_coverage).toBe('pending');
    expect(row.tiers.invariant_evaluation).toBe('missing');
    expect(row.tiers.ci).toBe('failed');
    expect(row.tiers.runtime_dogfood).toBe('passed');
    expect(row.blockers.length).toBeGreaterThan(0);
    expect(row.decision.available).toBe(false);
    expect(row.decision.reason).toMatch(
      /^Evidence is incomplete: \d+ blockers?\.$/
    );
  });

  it('fails a tier whose receipts passed at a different source SHA', () => {
    const row = fixtureRow('drift', {
      packet: fixturePacket('drift', {
        visualProof: [
          { ...fixtureReceipt('visual_proof', 'v'), sourceSha: 'f'.repeat(40) },
        ],
      }),
    });
    expect(row.tiers.visual_proof).toBe('failed');
    expect(row.state).toBe('working');
  });

  it('projects kernel-blocked receipts as failed without changing valid evidence in the same tier', () => {
    const row = fixtureRow('receipt-drift', {
      packet: fixturePacket('receipt-drift', {
        visualProof: [
          fixtureReceipt('visual_proof', 'current'),
          {
            ...fixtureReceipt('visual_proof', 'stale'),
            sourceSha: 'f'.repeat(40),
          },
          { ...fixtureReceipt('visual_proof', 'unbound'), sourceSha: null },
          { ...fixtureReceipt('visual_proof', 'missing-digest'), digest: null },
        ],
      }),
    });

    expect(row.tiers.visual_proof).toBe('failed');
    expect(
      row.evidence.filter(receipt => receipt.tier === 'visual_proof')
    ).toEqual([
      expect.objectContaining({ id: 'current', status: 'passed' }),
      expect.objectContaining({ id: 'stale', status: 'failed' }),
      expect.objectContaining({ id: 'unbound', status: 'failed' }),
      expect.objectContaining({ id: 'missing-digest', status: 'failed' }),
    ]);
    expect(row.state).toBe('working');
    expect(row.decision.available).toBe(false);
  });

  it('reports a missing source tier and a variant without proof', () => {
    const row = fixtureRow('nosource', {
      packet: fixturePacket('nosource', {
        source: null,
        requiredVariants: [
          {
            id: 'mobile',
            label: 'Mobile',
            sourceSha: FIXTURE_SHA,
            proof: null,
            requiredMediaIds: [],
          },
        ],
      }),
    });
    expect(row.tiers.canonical_source).toBe('missing');
    expect(row.source).toBeNull();
    expect(row.evidence).toContainEqual(
      expect.objectContaining({
        id: 'mobile',
        tier: 'required_variants',
        status: 'missing',
        summary: 'Mobile: no proof attached.',
        href: null,
      })
    );
  });

  it('shows founder_locked with the decision in history and blocks a second decision', () => {
    const packet = fixturePacket('locked');
    const digest = buildCertificationDecisionDigest(packet);
    const row = fixtureRow('locked', {
      packet,
      decisions: [
        {
          id: 'd1',
          subjectId: 'locked',
          evidenceDigest: digest,
          decision: 'approved',
          decidedAt: '2026-09-27T07:30:00.000Z',
          reviewer: 'founder@example.test',
          notes: null,
        },
      ],
    });
    expect(row.state).toBe('founder_locked');
    expect(row.decision).toEqual({
      available: false,
      reason: 'A founder decision already exists for this evidence.',
      evidenceDigest: digest,
      currentDecision: {
        kind: 'approved',
        decidedAt: '2026-09-27T07:30:00.000Z',
        reviewer: 'founder@example.test',
        notes: null,
      },
    });
    expect(row.history).toContainEqual({
      at: '2026-09-27T07:30:00.000Z',
      kind: 'decision',
      type: 'approved',
      summary: 'Certified by founder.',
      actor: 'founder@example.test',
    });
  });

  it('flags a stale founder lock after the evidence changes', () => {
    const original = fixturePacket('stale');
    const changed = fixturePacket('stale', {
      testsCoverage: [fixtureReceipt('tests_coverage', 'new-tests')],
    });
    const row = fixtureRow('stale', {
      packet: changed,
      decisions: [
        {
          id: 'd-old',
          subjectId: 'stale',
          evidenceDigest: buildCertificationDecisionDigest(original),
          decision: 'approved',
          decidedAt: '2026-09-26T07:30:00.000Z',
          reviewer: 'founder@example.test',
          notes: null,
        },
      ],
    });
    expect(row.staleFounderLock).toBe(true);
    expect(row.state).toBe('review_ready');
    expect(row.decision.available).toBe(true);
  });

  it('applies a domain decision gate only after kernel admission passes', () => {
    const packet = fixturePacket('gated');
    const admission = evaluateCertificationAdmission({
      packet,
      evaluatedAt: FIXTURE_NOW,
    });
    const row = normalizeKernelCertificationRow({
      domain: 'marketing_components',
      surface: 'Marketing Section',
      packet,
      admission,
      decisions: [],
      auditHistory: [],
      updatedAt: FIXTURE_NOW,
      domainDecisionGate: 'No assurance profile.',
    });
    expect(row.decision).toMatchObject({
      available: false,
      reason: 'No assurance profile.',
    });
    expect(row.links).toEqual([]);
  });

  it('withholds decisions for packets on a foreign contract', () => {
    const packet = fixturePacket('foreign', { contract: 'other/v9' });
    const row = normalizeKernelCertificationRow({
      domain: 'lyb',
      surface: 'LYB',
      packet,
      admission: evaluateCertificationAdmission({ packet }),
      decisions: [],
      auditHistory: [],
      updatedAt: FIXTURE_NOW,
    });
    expect(row.decision).toEqual({
      available: false,
      reason: 'The packet does not use the current kernel contract.',
      evidenceDigest: null,
      currentDecision: null,
    });
  });

  it('keeps only the newest history events, newest first', () => {
    const packet = fixturePacket('busy');
    const auditHistory = Array.from(
      { length: OVIE_CERTIFICATION_HISTORY_LIMIT + 5 },
      (_, index) => ({
        at: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
        type: 'review_packet_incomplete' as const,
        subjectId: 'busy',
        evidenceDigest: null,
        summary: `event ${index}`,
      })
    );
    const row = normalizeKernelCertificationRow({
      domain: 'flows',
      surface: 'Flows',
      packet,
      admission: evaluateCertificationAdmission({ packet }),
      decisions: [],
      auditHistory,
      updatedAt: FIXTURE_NOW,
    });
    expect(row.history).toHaveLength(OVIE_CERTIFICATION_HISTORY_LIMIT);
    expect(row.history[0]?.summary).toBe(
      `event ${OVIE_CERTIFICATION_HISTORY_LIMIT + 4}`
    );
  });
});

describe('resolveEvidenceHref', () => {
  const source = fixturePacket('x').source;

  it('keeps absolute URLs and resolves repo paths at the packet commit', () => {
    expect(resolveEvidenceHref('https://ci.test/run/1', source)).toBe(
      'https://ci.test/run/1'
    );
    expect(resolveEvidenceHref('docs/certification/a.md', source)).toBe(
      `https://github.com/JovieInc/Jovie/blob/${FIXTURE_SHA}/docs/certification/a.md`
    );
  });

  it('refuses non-navigable refs and unsafe schemes', () => {
    expect(resolveEvidenceHref('github:JovieInc/Jovie/x', source)).toBeNull();
    expect(resolveEvidenceHref('javascript:alert(1)', source)).toBeNull();
    expect(resolveEvidenceHref('docs/a.md', null)).toBeNull();
    expect(resolveEvidenceHref('plain words', source)).toBeNull();
  });
});

describe('countCertificationStates', () => {
  it('counts every state plus the total', () => {
    const rows = [fixtureRow('a'), fixtureRow('b')];
    expect(countCertificationStates(rows)).toEqual({
      working: 0,
      review_ready: 2,
      founder_locked: 0,
      shipped: 0,
      monitored: 0,
      total: 2,
    });
  });
});
