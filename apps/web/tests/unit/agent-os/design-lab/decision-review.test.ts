import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  marketingDecisionCandidateDigest,
  marketingDecisionContextDigest,
  marketingDecisionIncumbentDigest,
} from '@/data/marketing';
import type { PrepareDesignLabDecisionReviewParams } from '@/lib/agent-os/design-lab/decision-review';
import {
  prepareDesignLabDecisionReview,
  readDesignLabDecisionReviewArtifact,
} from '@/lib/agent-os/design-lab/decision-review';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';

vi.mock('server-only', () => ({}));

const execFileAsync = promisify(execFile);

const SOURCE_SHA = 'a'.repeat(40);
const ARTIFACT_SHA256 = 'b'.repeat(64);
const CREATED_AT = '2026-09-20T12:00:00.000Z';

function proposal(id: string, text: string): DesignProposal {
  return {
    id,
    surfaceId: 'profile-page',
    surfaceName: 'Public profile page',
    proposalText: text,
    assetRefs: [`agentos/runs/design-lab/assets/${id}.md`],
    scoring: { weight: 0.8, score: 0.7 },
    linearIssueId: 'JOV-1951',
    linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1951',
    status: 'pending',
    createdAt: CREATED_AT,
    reviewedAt: null,
    reviewer: null,
    reviewNotes: null,
    reviewDecision: null,
    dispatchId: null,
    dayBucket: '2026-09-20',
  };
}

const incumbentValue = {
  proposalText: 'Keep the existing profile header concise.',
} as const;

const contextInput = {
  decisionId: 'design-lab-profile-page',
  pageId: 'profile-page',
  audience: 'independent artists',
  offer: 'a public artist profile',
  conversionObjective: 'start a profile setup',
  claimRevision: 'claims-2026-09-20',
  recipeRevision: 'recipes-2026-09-20',
  rubricRevision: 'rubric-2026-09-20',
  sourceRevision: 'source-2026-09-20',
  allowedMutationScope: ['proposalText'],
  dependencyGraph: {},
};

const context = {
  ...contextInput,
  contextDigest: marketingDecisionContextDigest(contextInput),
};

const route = '/admin/design-lab/decision-review';

function candidateDigest(candidateId: string, statement: string): string {
  const value = {
    proposalText: statement,
  };
  return marketingDecisionCandidateDigest({
    id: candidateId,
    value,
    changedPaths: ['proposalText'],
    dependencyIds: [`design-proposal:${candidateId}`],
  });
}

function semanticInputBase(candidateId: string, statement: string) {
  return {
    route,
    pageId: context.pageId,
    audience: context.audience,
    objective: context.conversionObjective,
    sourceSha: SOURCE_SHA,
    artifactSha256: ARTIFACT_SHA256,
    candidateDigest: candidateDigest(candidateId, statement),
  };
}

function semanticInputs(candidateId: string, statement: string) {
  const base = semanticInputBase(candidateId, statement);
  return [
    {
      candidateDigest: base.candidateDigest,
      input: {
        ...base,
        check: 'claim-support' as const,
        claim: { id: candidateId, statement },
        supportingEvidence: [
          {
            id: `source-${candidateId}`,
            statement:
              'The supplied source brief describes this profile treatment.',
          },
        ],
      },
    },
    {
      candidateDigest: base.candidateDigest,
      input: {
        ...base,
        check: 'section-overlap' as const,
        sections: [
          {
            id: candidateId,
            question: 'What should the profile communicate first?',
            responsibility: statement,
            customerBelief: 'The profile gives an artist a clear destination.',
            renderedText: statement,
            evidenceRefs: [`source-${candidateId}`],
          },
          {
            id: `${candidateId}-supporting-proof`,
            question: 'What should support the first impression?',
            responsibility: 'Supporting proof for the artist profile.',
            customerBelief:
              'Artists need a clear next step after an introduction.',
            evidenceRefs: [`source-${candidateId}`],
          },
        ],
      },
    },
    {
      candidateDigest: base.candidateDigest,
      input: {
        ...base,
        check: 'cta-expectation' as const,
        cta: {
          id: candidateId,
          label: statement,
          href: '/start',
          expectedAction: 'start a profile setup',
          renderedLabel: statement,
        },
      },
    },
  ];
}

const candidateIds = ['proposal-a', 'proposal-b'] as const;

function protectedChecks(candidateId: string) {
  return [
    {
      dimension: 'audience-fit',
      verdict: 'pass' as const,
      evidenceRefs: [`brief:${candidateId}:audience`],
    },
    {
      dimension: 'section-job',
      verdict: 'pass' as const,
      evidenceRefs: [`brief:${candidateId}:job`],
    },
  ];
}

function params(overrides: Record<string, unknown> = {}) {
  const incumbentDigest = marketingDecisionIncumbentDigest({
    id: 'profile-page-incumbent',
    sourceRevision: context.sourceRevision,
    value: incumbentValue,
    dependencyIds: ['design-lab:incumbent'],
  });
  return {
    dayBucket: '2026-09-20',
    proposalIds: [...candidateIds],
    reviewId: 'profile-page-review-1',
    route,
    sourceSha: SOURCE_SHA,
    artifactSha256: ARTIFACT_SHA256,
    context,
    stage: 'narrative' as const,
    incumbent: {
      id: 'profile-page-incumbent',
      value: incumbentValue,
    },
    preference: {
      contextDigest: context.contextDigest,
      incumbentDigest,
      status: 'candidate' as const,
      candidateId: 'proposal-a',
      comparedCandidateIds: [...candidateIds],
      reason: 'The first candidate communicates the brief more clearly.',
    },
    protectedChecks: {
      'proposal-a': protectedChecks('proposal-a'),
      'proposal-b': protectedChecks('proposal-b'),
    },
    semanticInputs: {
      'proposal-a': semanticInputs(
        'proposal-a',
        'Use a restrained profile header band.'
      ),
      'proposal-b': semanticInputs(
        'proposal-b',
        'Use a quiet artist introduction at the top of the profile.'
      ),
    },
    learningRefs: ['learning-ledger:profile-page:approved-example-1'],
    createdAt: CREATED_AT,
    loadProposal: async (_dayBucket: string, id: string) =>
      id === 'proposal-a'
        ? proposal(id, 'Use a restrained profile header band.')
        : id === 'proposal-b'
          ? proposal(
              id,
              'Use a quiet artist introduction at the top of the profile.'
            )
          : null,
    ...overrides,
  };
}

describe('Design Lab decision review adapter', () => {
  let artifactRoot = '';

  beforeEach(async () => {
    artifactRoot = await mkdtemp(path.join(os.tmpdir(), 'design-review-'));
  });

  afterEach(async () => {
    await rm(artifactRoot, { recursive: true, force: true });
  });

  it('persists a decision and advisory semantic reviews, then reads the exact packet back', async () => {
    const evaluate = async (request: { readonly fingerprint: string }) => ({
      status: 'evaluated',
      alignment: 'supported',
      requestFingerprint: request.fingerprint,
    });
    const withEvaluation = (candidateId: string, statement: string) =>
      semanticInputs(candidateId, statement).map(binding => ({
        ...binding,
        options: { evaluate },
      }));
    const result = await prepareDesignLabDecisionReview({
      ...params(),
      artifactRootDirectory: artifactRoot,
      semanticInputs: {
        'proposal-a': withEvaluation(
          'proposal-a',
          'Use a restrained profile header band.'
        ),
        'proposal-b': withEvaluation(
          'proposal-b',
          'Use a quiet artist introduction at the top of the profile.'
        ),
      },
    });

    expect(result.artifact.decisionStatus).toBe('accepted');
    expect(result.artifact.selection).toMatchObject({
      selectedCandidate: { id: 'proposal-a' },
      certified: false,
    });
    expect(result.artifact.advisory).toBe(true);
    expect(result.artifact.dispatchTriggered).toBe(false);
    expect(result.artifact.generationTriggered).toBe(false);
    expect(result.artifact.published).toBe(false);

    const raw = JSON.parse(await readFile(result.artifactPath, 'utf8')) as {
      artifactDigest: string;
      semanticReviews: Array<{
        result: { evidenceFingerprint: string | null };
      }>;
    };
    expect(raw.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(raw.semanticReviews).toHaveLength(6);
    expect(
      raw.semanticReviews.every(item => item.result.evidenceFingerprint)
    ).toBe(true);

    const readback = await readDesignLabDecisionReviewArtifact(
      result.artifact.reviewId,
      { artifactRootDirectory: artifactRoot }
    );
    expect(readback).toEqual(result.artifact);
  });

  it('keeps an abstained semantic review unresolved without activating a candidate', async () => {
    const result = await prepareDesignLabDecisionReview({
      ...params(),
      artifactRootDirectory: artifactRoot,
    });

    expect(result.artifact.decisionStatus).toBe('unresolved');
    expect(result.artifact.selection).toMatchObject({
      selectedCandidate: null,
      certified: false,
    });
    expect(
      (result.artifact.semanticReviews[0]?.result as { abstained: boolean })
        .abstained
    ).toBe(true);
    expect(result.artifact.dispatchTriggered).toBe(false);
  });

  it('rejects semantic evidence bound to a different artifact digest', async () => {
    await expect(
      prepareDesignLabDecisionReview({
        ...params({
          semanticInputs: {
            ...params().semanticInputs,
            'proposal-a': semanticInputs(
              'proposal-a',
              'Use a restrained profile header band.'
            ).map(binding => ({
              ...binding,
              input: { ...binding.input, artifactSha256: 'c'.repeat(64) },
            })),
          },
          artifactRootDirectory: artifactRoot,
        }),
      })
    ).rejects.toThrow(/exact Design Lab route, context, source, and artifact/);
    await expect(
      readDesignLabDecisionReviewArtifact('profile-page-review-1', {
        artifactRootDirectory: artifactRoot,
      })
    ).resolves.toBeNull();
  });

  it('rejects an unbounded candidate set before semantic evaluation', async () => {
    await expect(
      prepareDesignLabDecisionReview({
        ...params({ proposalIds: ['proposal-a'] }),
        artifactRootDirectory: artifactRoot,
      })
    ).rejects.toThrow('requires 2-4 proposal candidates');
  });

  it('persists invalid candidate findings without invoking semantic evaluators', async () => {
    const invalidContextInput = {
      ...contextInput,
      allowedMutationScope: ['different-path'],
    } as const;
    const invalidContext = {
      ...invalidContextInput,
      contextDigest: marketingDecisionContextDigest(invalidContextInput),
    };
    const evaluate = vi.fn(
      async (request: { readonly fingerprint: string }) => ({
        status: 'evaluated',
        alignment: 'supported',
        requestFingerprint: request.fingerprint,
      })
    );
    const baseParams = params();
    const semanticInputsWithEvaluator = Object.fromEntries(
      Object.entries(baseParams.semanticInputs).map(
        ([candidateId, bindings]) => [
          candidateId,
          bindings.map(binding => ({
            ...binding,
            options: { evaluate },
          })),
        ]
      )
    ) as typeof baseParams.semanticInputs;

    const result = await prepareDesignLabDecisionReview({
      ...baseParams,
      context: invalidContext,
      preference: {
        ...baseParams.preference,
        contextDigest: invalidContext.contextDigest,
      },
      semanticInputs: semanticInputsWithEvaluator,
      artifactRootDirectory: artifactRoot,
    });

    expect(evaluate).not.toHaveBeenCalled();
    expect(result.artifact.candidateFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'mutation-out-of-scope',
          candidateId: 'proposal-a',
        }),
      ])
    );
    expect(result.artifact.semanticReviews).toEqual([]);
    expect(result.artifact.dispatchTriggered).toBe(false);
  });

  it('prepares and reads a review packet through the existing CLI entry', async () => {
    const baseParams = params();
    const request = {
      ...baseParams,
      proposalRecords: [
        proposal('proposal-a', 'Use a restrained profile header band.'),
        proposal(
          'proposal-b',
          'Use a quiet artist introduction at the top of the profile.'
        ),
      ],
    };
    const inputPath = path.join(artifactRoot, 'request.json');
    await writeFile(inputPath, `${JSON.stringify(request)}\n`, 'utf8');

    const repoRoot = path.resolve(process.cwd(), '../..');
    const cli = [
      '--filter',
      '@jovie/web',
      'exec',
      'tsx',
      'scripts/design-lab-decision-review.ts',
    ];
    const env = {
      ...process.env,
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ''} --conditions=react-server`.trim(),
    };
    const prepared = await execFileAsync(
      'pnpm',
      [...cli, `--input=${inputPath}`, `--artifact-root=${artifactRoot}`],
      { cwd: repoRoot, env, maxBuffer: 2_000_000 }
    );
    const summary = JSON.parse(prepared.stdout.trim()) as {
      reviewId: string;
      decisionStatus: string;
      semanticReviewCount: number;
      certified: boolean;
      dispatchTriggered: boolean;
      generationTriggered: boolean;
      published: boolean;
    };
    expect(summary).toMatchObject({
      reviewId: 'profile-page-review-1',
      decisionStatus: 'unresolved',
      semanticReviewCount: 6,
      certified: false,
      dispatchTriggered: false,
      generationTriggered: false,
      published: false,
    });

    const readback = await execFileAsync(
      'pnpm',
      [...cli, `--read=${summary.reviewId}`, `--artifact-root=${artifactRoot}`],
      { cwd: repoRoot, env, maxBuffer: 2_000_000 }
    );
    const artifact = JSON.parse(readback.stdout.trim()) as {
      schema: string;
      reviewId: string;
      advisory: boolean;
      certified: boolean;
      dispatchTriggered: boolean;
    };
    expect(artifact).toMatchObject({
      schema: 'design-lab-decision-review/v1',
      reviewId: summary.reviewId,
      advisory: true,
      certified: false,
      dispatchTriggered: false,
    });
  }, 30_000);

  it('reuses an existing exact packet before invoking semantic evaluators', async () => {
    const firstEvaluate = vi.fn(
      async (request: { readonly fingerprint: string }) => ({
        status: 'evaluated',
        alignment: 'supported',
        requestFingerprint: request.fingerprint,
      })
    );
    const firstParams = params();
    const first = await prepareDesignLabDecisionReview({
      ...firstParams,
      artifactRootDirectory: artifactRoot,
      semanticInputs: Object.fromEntries(
        Object.entries(firstParams.semanticInputs).map(
          ([candidateId, bindings]) => [
            candidateId,
            bindings.map(binding => ({
              ...binding,
              options: { evaluate: firstEvaluate },
            })),
          ]
        )
      ) as typeof firstParams.semanticInputs,
    });
    expect(firstEvaluate).toHaveBeenCalledTimes(6);

    const secondEvaluate = vi.fn(
      async (request: { readonly fingerprint: string }) => ({
        status: 'evaluated',
        alignment: 'contradicted',
        requestFingerprint: request.fingerprint,
      })
    );
    const secondParams = params();
    const second = await prepareDesignLabDecisionReview({
      ...secondParams,
      artifactRootDirectory: artifactRoot,
      semanticInputs: Object.fromEntries(
        Object.entries(secondParams.semanticInputs).map(
          ([candidateId, bindings]) => [
            candidateId,
            bindings.map(binding => ({
              ...binding,
              options: { evaluate: secondEvaluate },
            })),
          ]
        )
      ) as typeof secondParams.semanticInputs,
    });

    expect(secondEvaluate).not.toHaveBeenCalled();
    expect(second.artifact).toEqual(first.artifact);
    expect(second.artifactPath).toBe(first.artifactPath);
  });

  it('rejects conflicting input evidence before evaluation and leaves the packet unchanged', async () => {
    const first = await prepareDesignLabDecisionReview({
      ...params(),
      artifactRootDirectory: artifactRoot,
      semanticInputs: params().semanticInputs,
    });
    const conflictingEvaluate = vi.fn(
      async (request: { readonly fingerprint: string }) => ({
        status: 'evaluated',
        alignment: 'supported',
        requestFingerprint: request.fingerprint,
      })
    );
    const conflictingInputs = Object.fromEntries(
      Object.entries(params().semanticInputs).map(([candidateId, bindings]) => [
        candidateId,
        bindings.map(binding => ({
          ...binding,
          input:
            binding.input.check === 'claim-support'
              ? {
                  ...binding.input,
                  supportingEvidence: [
                    {
                      id: `changed-source-${candidateId}`,
                      statement: 'A different source-backed statement.',
                    },
                  ],
                }
              : binding.input,
          options: { evaluate: conflictingEvaluate },
        })),
      ])
    ) as PrepareDesignLabDecisionReviewParams['semanticInputs'];

    await expect(
      prepareDesignLabDecisionReview({
        ...params(),
        semanticInputs: conflictingInputs,
        artifactRootDirectory: artifactRoot,
      })
    ).rejects.toThrow('different input evidence');
    expect(conflictingEvaluate).not.toHaveBeenCalled();
    await expect(
      readDesignLabDecisionReviewArtifact(first.artifact.reviewId, {
        artifactRootDirectory: artifactRoot,
      })
    ).resolves.toEqual(first.artifact);
  });

  it('binds preference and protected checks into the idempotency manifest', async () => {
    const firstParams = params();
    const first = await prepareDesignLabDecisionReview({
      ...firstParams,
      artifactRootDirectory: artifactRoot,
    });
    const evaluate = vi.fn(
      async (request: { readonly fingerprint: string }) => ({
        status: 'evaluated',
        alignment: 'supported',
        requestFingerprint: request.fingerprint,
      })
    );
    const semanticInputs = Object.fromEntries(
      Object.entries(firstParams.semanticInputs).map(
        ([candidateId, bindings]) => [
          candidateId,
          bindings.map(binding => ({ ...binding, options: { evaluate } })),
        ]
      )
    ) as typeof firstParams.semanticInputs;

    await expect(
      prepareDesignLabDecisionReview({
        ...params(),
        artifactRootDirectory: artifactRoot,
        semanticInputs,
        preference: {
          ...firstParams.preference,
          reason: 'A different bounded preference evidence statement.',
        },
      })
    ).rejects.toThrow('different input evidence');
    expect(evaluate).not.toHaveBeenCalled();

    await expect(
      prepareDesignLabDecisionReview({
        ...params(),
        artifactRootDirectory: artifactRoot,
        semanticInputs,
        protectedChecks: {
          ...firstParams.protectedChecks,
          'proposal-a': [
            ...(firstParams.protectedChecks?.['proposal-a'] ?? []),
            {
              dimension: 'evidence-version',
              verdict: 'pass' as const,
              evidenceRefs: ['changed-protected-evidence'],
            },
          ],
        },
      })
    ).rejects.toThrow('different input evidence');
    expect(evaluate).not.toHaveBeenCalled();

    await expect(
      readDesignLabDecisionReviewArtifact(first.artifact.reviewId, {
        artifactRootDirectory: artifactRoot,
      })
    ).resolves.toEqual(first.artifact);
  });

  it('fails closed when concurrent writers produce different evidence for one review id', async () => {
    let evaluatorStarts = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>(resolve => {
      release = resolve;
    });
    const makeEvaluator =
      (alignment: 'supported' | 'contradicted') =>
      async (request: { readonly fingerprint: string }) => {
        evaluatorStarts += 1;
        if (evaluatorStarts === 2) release();
        await bothStarted;
        return {
          status: 'evaluated',
          alignment,
          requestFingerprint: request.fingerprint,
        };
      };
    const buildInputs = (alignment: 'supported' | 'contradicted') => {
      const candidateParams = params();
      return Object.fromEntries(
        Object.entries(candidateParams.semanticInputs).map(
          ([candidateId, bindings]) => [
            candidateId,
            bindings.map(binding => ({
              ...binding,
              options: { evaluate: makeEvaluator(alignment) },
            })),
          ]
        )
      ) as typeof candidateParams.semanticInputs;
    };
    const concurrentParams = params();
    const outcomes = await Promise.allSettled([
      prepareDesignLabDecisionReview({
        ...concurrentParams,
        artifactRootDirectory: artifactRoot,
        semanticInputs: buildInputs('supported'),
      }),
      prepareDesignLabDecisionReview({
        ...concurrentParams,
        artifactRootDirectory: artifactRoot,
        semanticInputs: buildInputs('contradicted'),
      }),
    ]);

    expect(
      outcomes.filter(outcome => outcome.status === 'fulfilled')
    ).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected'
    );
    expect(rejected?.reason).toMatchObject({
      message: expect.stringContaining(
        'already exists with different evidence'
      ),
    });
    const winner = outcomes.find(
      (
        outcome
      ): outcome is PromiseFulfilledResult<
        Awaited<ReturnType<typeof prepareDesignLabDecisionReview>>
      > => outcome.status === 'fulfilled'
    );
    if (!winner) throw new Error('concurrent review did not produce a winner');
    await expect(
      readDesignLabDecisionReviewArtifact(winner.value.artifact.reviewId, {
        artifactRootDirectory: artifactRoot,
      })
    ).resolves.toEqual(winner.value.artifact);
  });

  it('detects tampering on readback', async () => {
    const result = await prepareDesignLabDecisionReview({
      ...params(),
      artifactRootDirectory: artifactRoot,
      semanticInputs: Object.fromEntries(
        Object.entries(params().semanticInputs).map(
          ([candidateId, bindings]) => [
            candidateId,
            bindings.map(binding => ({
              ...binding,
              options: {
                evaluate: async (request: {
                  readonly fingerprint: string;
                }) => ({
                  status: 'evaluated',
                  alignment: 'supported',
                  requestFingerprint: request.fingerprint,
                }),
              },
            })),
          ]
        )
      ),
    });
    const tampered = JSON.parse(
      await readFile(result.artifactPath, 'utf8')
    ) as {
      decisionStatus: string;
    };
    tampered.decisionStatus = 'incumbent-retained';
    await writeFile(
      result.artifactPath,
      `${JSON.stringify(tampered)}\n`,
      'utf8'
    );

    await expect(
      readDesignLabDecisionReviewArtifact(result.artifact.reviewId, {
        artifactRootDirectory: artifactRoot,
      })
    ).rejects.toThrow('failed its evidence digest check');
  });
});
