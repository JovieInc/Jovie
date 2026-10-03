import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyStagePassedBit,
  FACTORY_CERTIFIER_HARNESS,
  FACTORY_RECEIPT_SCHEMA,
} from '../../data/marketing/factory/spine';
import { PROOF_REGISTRY } from '../../data/product-truth/proof';
import {
  type Capability,
  listCapabilities,
} from '../../data/product-truth/registry';
import { loadFactoryBrief } from './brief';
import {
  attemptFileName,
  digestOf,
  FACTORY_RUN_SCHEMA,
  type FactoryRunManifest,
  factoryStageSourceDigest,
  readJson,
  type StageAttemptRecord,
  stageInputDigest,
  verifyFactoryRun,
  writeJson,
} from './receipts';

const brief = loadFactoryBrief('solutions', 'founders');
const PAGE_ID = 'solutions-founders';

let runDir: string;

const truthArtifact = {
  pageId: PAGE_ID,
  claims: [
    {
      id: 'offer.free.price',
      statement: '$0',
      maturity: 'shipped',
      evidenceRefs: ['offer-free'],
    },
  ],
};

const persuasionArtifact = {
  pageId: PAGE_ID,
  researchedAt: brief.persuasion.researchedAt,
  classification: brief.persuasion.classification,
  differentiator: brief.persuasion.differentiator,
  requiredJobs: [
    { primitive: 'pricing-risk-reduction', job: 'cta', routed: 'section' },
  ],
  sectionRequests: [],
  proofGaps: [],
};

const outcomesArtifact = {
  pageId: PAGE_ID,
  brief: brief.brief,
  icp: brief.icp,
  jobsToBeDone: brief.jobsToBeDone,
  ...(brief.dry?.outcomes as object),
};

/** Writes a three-link chain (truth, persuasion, outcomes) as run.ts does. */
function writeChain(): FactoryRunManifest {
  const briefDigest = digestOf(brief);
  const chain: FactoryRunManifest['chain'] = [];
  const links = [
    { stage: 'truth' as const, artifact: truthArtifact, producer: null },
    {
      stage: 'persuasion' as const,
      artifact: persuasionArtifact,
      producer: null,
    },
    {
      stage: 'outcomes' as const,
      artifact: outcomesArtifact,
      producer: {
        modelId: 'anthropic/claude-opus-5.5',
        family: 'anthropic',
        channel: 'subscription-cli' as const,
      },
    },
  ];
  for (const link of links) {
    const receipt = applyStagePassedBit(
      {
        schema: FACTORY_RECEIPT_SCHEMA,
        pageId: PAGE_ID,
        stage: link.stage,
        attempt: 1,
        inputDigest: stageInputDigest(
          briefDigest,
          chain.map(item => item.outputDigest),
          factoryStageSourceDigest(link.stage, brief)
        ),
        outputDigest: digestOf(link.artifact),
        producer: link.producer,
        evaluators: link.producer
          ? [
              {
                id: 'openai/gpt-5.5',
                family: 'openai',
                kind: 'llm',
                verdict: 'pass',
                score: 0.9,
                rubricVersion: 'factory-outcomes/1',
              },
            ]
          : [],
        invariantsPassed: ['fixture'],
        invariantsFailed: [],
        at: '2026-09-30T00:00:00.000Z',
      },
      { certifier: FACTORY_CERTIFIER_HARNESS }
    );
    const file = attemptFileName(link.stage, 1);
    const record: StageAttemptRecord = {
      receipt,
      artifact: link.artifact,
      feedbackIn: [],
      notes: {},
      unavailable: null,
    };
    writeJson(join(runDir, file), record);
    chain.push({
      stage: link.stage,
      attempt: 1,
      file,
      outputDigest: receipt.outputDigest,
    });
  }
  const manifest: FactoryRunManifest = {
    schema: FACTORY_RUN_SCHEMA,
    pageId: PAGE_ID,
    family: brief.family,
    slug: brief.slug,
    mode: 'dry',
    briefDigest,
    status: 'failed',
    stoppedAt: 'copy',
    reason: 'fixture',
    chain,
    attempts: chain.map(link => link.file),
  };
  writeJson(join(runDir, 'brief.json'), brief);
  writeJson(join(runDir, 'run.json'), manifest);
  return manifest;
}

function editRecord(
  file: string,
  edit: (record: StageAttemptRecord) => StageAttemptRecord
) {
  const path = join(runDir, file);
  writeJson(path, edit(readJson<StageAttemptRecord>(path)));
}

beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), 'factory-receipts-'));
});

afterEach(() => {
  rmSync(runDir, { recursive: true, force: true });
});

describe('digestOf', () => {
  it('is stable across key order and binds prior digests in order', () => {
    expect(digestOf({ a: 1, b: [2, { d: 4, c: 3 }] })).toBe(
      digestOf({ b: [2, { c: 3, d: 4 }], a: 1 })
    );
    expect(digestOf({ a: 1 })).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stageInputDigest('sha256:x', ['a', 'b'])).not.toBe(
      stageInputDigest('sha256:x', ['b', 'a'])
    );
  });

  it('names attempt files in spine order', () => {
    expect(attemptFileName('truth', 1)).toBe('01-truth.attempt-1.json');
    expect(attemptFileName('publish', 3)).toBe('16-publish.attempt-3.json');
  });
});

describe('verifyFactoryRun', () => {
  it('accepts an untouched chain', () => {
    writeChain();
    expect(verifyFactoryRun(runDir)).toEqual([]);
  });

  it.each([
    'maturity',
    'access',
    'contentRevision',
    'proofAuthorized',
  ] as const)(
    'invalidates the truth receipt when capability %s changes with claim text fixed',
    field => {
      writeChain();
      const capabilities = listCapabilities().map(capability => {
        if (capability.id !== 'artist-profiles') return capability;
        const marketing = capability.marketing!;
        switch (field) {
          case 'maturity':
            return { ...capability, maturity: 'public_beta' as const };
          case 'access':
            return { ...capability, access: 'enrolled' as const };
          case 'contentRevision':
            return {
              ...capability,
              marketing: { ...marketing, contentRevision: '2026-10-01' },
            };
          case 'proofAuthorized':
            return {
              ...capability,
              marketing: { ...marketing, proofAuthorized: false },
            };
        }
      }) as Capability[];

      // Stored claim text is unchanged; the current source record alone makes
      // the earlier truth receipt ineligible for resume.
      expect(
        readJson<StageAttemptRecord>(join(runDir, '01-truth.attempt-1.json'))
          .artifact
      ).toEqual(truthArtifact);
      expect(verifyFactoryRun(runDir, { capabilities })).toContain(
        'truth#1: input digest does not bind current stage inputs'
      );
    }
  );

  it('binds proof revisions and withdrawals to only the page proof source digest', () => {
    const proof = PROOF_REGISTRY.find(
      item => item.id === 'product-profile-subscribe-capture'
    )!;
    const source = factoryStageSourceDigest('proof', brief);
    const revisedProofs = PROOF_REGISTRY.map(item =>
      item.id === proof.id
        ? {
            ...item,
            artifact: { ...item.artifact, capturedAt: '2026-10-01' },
          }
        : item
    );
    const revisedSource = factoryStageSourceDigest('proof', brief, {
      proofs: revisedProofs,
    });
    const withdrawnSource = factoryStageSourceDigest('proof', brief, {
      proofs: PROOF_REGISTRY.filter(item => item.id !== proof.id),
    });

    expect(source).not.toBe(revisedSource);
    expect(source).not.toBe(withdrawnSource);
    expect(stageInputDigest('sha256:brief', ['sha256:prior'], source)).not.toBe(
      stageInputDigest('sha256:brief', ['sha256:prior'], revisedSource)
    );
    expect(
      factoryStageSourceDigest(
        'proof',
        {
          ...brief,
          proof: [],
        },
        { proofs: revisedProofs }
      )
    ).not.toBe(revisedSource);
  });

  it('catches a tampered artifact and every later link', () => {
    writeChain();
    editRecord('01-truth.attempt-1.json', record => ({
      ...record,
      artifact: {
        ...truthArtifact,
        claims: [{ ...truthArtifact.claims[0], statement: '$1' }],
      },
    }));

    expect(verifyFactoryRun(runDir)).toContain(
      'truth#1: artifact digest does not match the receipt'
    );
  });

  it('catches a receipt edited into a self-review', () => {
    writeChain();
    editRecord('03-outcomes.attempt-1.json', record => ({
      ...record,
      receipt: {
        ...record.receipt,
        evaluators: record.receipt.evaluators.map(evaluator => ({
          ...evaluator,
          family: 'anthropic',
        })),
      },
    }));

    expect(verifyFactoryRun(runDir)).toContain(
      'outcomes#1: evaluator openai/gpt-5.5 shares family anthropic with the producer'
    );
  });

  it('catches a passed bit set by a model', () => {
    writeChain();
    editRecord('03-outcomes.attempt-1.json', record => ({
      ...record,
      receipt: { ...record.receipt, certifier: 'anthropic/claude-opus-5.5' },
    }));

    expect(verifyFactoryRun(runDir)).toContain(
      'outcomes#1: only the harness may set passed, got anthropic/claude-opus-5.5'
    );
  });

  it('catches a broken chain link, an edited brief and a short complete run', () => {
    const manifest = writeChain();
    writeJson(join(runDir, 'run.json'), {
      ...manifest,
      status: 'complete',
      chain: [
        { ...manifest.chain[0], outputDigest: digestOf('other') },
        manifest.chain[1],
      ],
    });
    writeJson(join(runDir, 'brief.json'), { ...brief, icp: 'Someone else' });
    const issues = verifyFactoryRun(runDir);

    expect(issues).toEqual(
      expect.arrayContaining([
        'brief.json digest does not match run.json',
        'complete run has 2/16 stages',
        'truth#1: run.json digest does not match the receipt',
        'persuasion#1: input digest does not bind current stage inputs',
      ])
    );
  });

  it('reports missing files and malformed manifests', () => {
    expect(verifyFactoryRun(runDir)).toEqual([`no run.json in ${runDir}`]);
    const manifest = writeChain();
    rmSync(join(runDir, '03-outcomes.attempt-1.json'));
    expect(verifyFactoryRun(runDir)).toContain(
      'outcomes#1: missing 03-outcomes.attempt-1.json'
    );
    writeJson(join(runDir, 'run.json'), { ...manifest, status: 'shipped' });
    expect(verifyFactoryRun(runDir)[0]).toMatch(/^run.json status:/);
  });
});
