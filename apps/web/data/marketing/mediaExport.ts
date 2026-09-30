/**
 * Marketing media export contract (JOV-6250) — bounded recipe rendering,
 * presets, and reusable receipts on top of the approved JOV-6246 media
 * recipes (`./mediaRecipes`).
 *
 * This module does not render pixels, run a queue, or talk to storage. It is
 * the request/validation/cache-key/receipt seam that the existing job
 * execution, storage, and screenshot/capture owners plug into via the
 * injected `produceOutput` callback in `executeMarketingMediaExportRequest`.
 * Keeping rendering out of this module is deliberate: it is what keeps
 * JOV-6232 (no automatic paid-model spend from deterministic capture paths)
 * intact — this contract has no network or provider call of its own.
 */

import {
  formatMarketingMediaRecipesForPrompt,
  isApprovedMarketingMediaRecipeId,
  JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
  MARKETING_MEDIA_RECIPES,
  type MarketingMediaRecipeId,
} from './mediaRecipes';

export const MARKETING_MEDIA_EXPORT_SCHEMA = 'jovie-marketing-media-export/v1';

export const MARKETING_MEDIA_EXPORT_OUTPUT_PROFILES = [
  'still',
  'poster',
  'sequence',
] as const;

export type MarketingMediaExportOutputProfile =
  (typeof MARKETING_MEDIA_EXPORT_OUTPUT_PROFILES)[number];

export function isMarketingMediaExportOutputProfile(
  value: string
): value is MarketingMediaExportOutputProfile {
  return (MARKETING_MEDIA_EXPORT_OUTPUT_PROFILES as readonly string[]).includes(
    value
  );
}

export const MARKETING_MEDIA_EXPORT_FALLBACK_POLICIES = [
  'static-only',
  'retain-last-approved',
] as const;

export type MarketingMediaExportFallbackPolicy =
  (typeof MARKETING_MEDIA_EXPORT_FALLBACK_POLICIES)[number];

export function isMarketingMediaExportFallbackPolicy(
  value: string
): value is MarketingMediaExportFallbackPolicy {
  return (
    MARKETING_MEDIA_EXPORT_FALLBACK_POLICIES as readonly string[]
  ).includes(value);
}

/**
 * Process rules, not taste. These apply to every recipe/preset and never
 * encode new visual values — inventing those belongs to the recipe contract
 * (`./mediaRecipes`), not this execution layer.
 */
export const MARKETING_MEDIA_EXPORT_NEGATIVE_CONSTRAINTS = [
  'Do not fabricate Jovie UI, text, logos, or claims. Only registered source components and approved fixtures may render real product surfaces.',
  'Concept renders (glass-module and product-frame previews) never substitute for source-backed implementation.',
  'Preserve breakpoint-specific safe areas. A background may bleed to the edges, but important foreground content stays intact.',
  'A generated success flag does not approve its own artifact. Publication requires separate scoped approval evidence.',
] as const;

export interface MarketingMediaExportFixture {
  readonly id: string;
  readonly label: string;
  readonly recipeId: MarketingMediaRecipeId;
  readonly accentToken: string;
  readonly componentId: string;
}

/**
 * Approved fixtures. The same shared MarketingHeader chrome is registered
 * under two routes to prove the dark-glass recipe reuses cleanly across
 * surfaces without a new component or page-specific style (JOV-6250
 * acceptance #2).
 */
export const MARKETING_MEDIA_EXPORT_FIXTURES: readonly MarketingMediaExportFixture[] =
  [
    {
      id: 'homepage-header-bar',
      label: 'Homepage header premium bar',
      recipeId: 'dark-glass',
      accentToken: MARKETING_MEDIA_RECIPES['dark-glass'].material.shellToken,
      componentId: 'apps/web/components/site/MarketingHeader.css',
    },
    {
      id: 'pricing-header-bar',
      label: 'Pricing header premium bar',
      recipeId: 'dark-glass',
      accentToken: MARKETING_MEDIA_RECIPES['dark-glass'].material.shellToken,
      componentId: 'apps/web/components/site/MarketingHeader.css',
    },
  ] as const;

export function getMarketingMediaExportFixture(
  id: string
): MarketingMediaExportFixture | undefined {
  return MARKETING_MEDIA_EXPORT_FIXTURES.find(fixture => fixture.id === id);
}

export interface MarketingMediaExportRequest {
  readonly fixtureId: string;
  readonly sourceRevision: string;
  readonly recipeId: string;
  readonly accentToken: string;
  readonly outputProfiles: readonly string[];
  readonly rendererVersion: string;
  readonly tokenPolicyVersion: string;
  readonly fallbackPolicy: string;
}

export type MarketingMediaExportFindingCode =
  | 'unknown-fixture'
  | 'unknown-media-recipe'
  | 'fixture-recipe-mismatch'
  | 'accent-mismatch'
  | 'missing-source-revision'
  | 'empty-output-profiles'
  | 'unsupported-output-profile'
  | 'duplicate-output-profile'
  | 'unsupported-fallback-policy'
  | 'static-only-excludes-sequence'
  | 'stale-approval-hash'
  | 'missing-approval-evidence'
  | 'output-timeout'
  | 'output-provider-unavailable'
  | 'output-render-failed';

export interface MarketingMediaExportFinding {
  readonly code: MarketingMediaExportFindingCode;
  readonly subject: string;
  readonly message: string;
}

function finding(
  code: MarketingMediaExportFindingCode,
  subject: string,
  message: string
): MarketingMediaExportFinding {
  return { code, subject, message };
}

export function validateMarketingMediaExportRequest(
  request: MarketingMediaExportRequest
): readonly MarketingMediaExportFinding[] {
  const findings: MarketingMediaExportFinding[] = [];

  const fixture = getMarketingMediaExportFixture(request.fixtureId);
  if (!fixture) {
    findings.push(
      finding(
        'unknown-fixture',
        request.fixtureId,
        `${request.fixtureId} is not a registered approved fixture.`
      )
    );
  }

  if (!isApprovedMarketingMediaRecipeId(request.recipeId)) {
    findings.push(
      finding(
        'unknown-media-recipe',
        request.recipeId,
        'Only approved marketing media recipes may be resolved for export.'
      )
    );
  } else if (fixture && request.recipeId !== fixture.recipeId) {
    findings.push(
      finding(
        'fixture-recipe-mismatch',
        request.fixtureId,
        `${request.fixtureId} is registered against ${fixture.recipeId}, not ${request.recipeId}.`
      )
    );
  }

  if (fixture && request.accentToken !== fixture.accentToken) {
    findings.push(
      finding(
        'accent-mismatch',
        request.accentToken,
        `Accent must resolve to the fixture's canonical accent ${fixture.accentToken}.`
      )
    );
  }

  if (!request.sourceRevision.trim()) {
    findings.push(
      finding(
        'missing-source-revision',
        request.fixtureId,
        'A source/fixture revision is required before executing.'
      )
    );
  }

  if (request.outputProfiles.length === 0) {
    findings.push(
      finding(
        'empty-output-profiles',
        request.fixtureId,
        'At least one output profile is required.'
      )
    );
  }
  const seenProfiles = new Set<string>();
  for (const profile of request.outputProfiles) {
    if (!isMarketingMediaExportOutputProfile(profile)) {
      findings.push(
        finding(
          'unsupported-output-profile',
          profile,
          `${profile} is not a supported output profile.`
        )
      );
    } else if (seenProfiles.has(profile)) {
      findings.push(
        finding(
          'duplicate-output-profile',
          profile,
          `${profile} was requested more than once.`
        )
      );
    }
    seenProfiles.add(profile);
  }

  if (!isMarketingMediaExportFallbackPolicy(request.fallbackPolicy)) {
    findings.push(
      finding(
        'unsupported-fallback-policy',
        request.fallbackPolicy,
        `${request.fallbackPolicy} is not a supported fallback policy.`
      )
    );
  } else if (
    request.fallbackPolicy === 'static-only' &&
    request.outputProfiles.includes('sequence')
  ) {
    findings.push(
      finding(
        'static-only-excludes-sequence',
        request.fixtureId,
        'A static-only fallback policy cannot request the video sequence output.'
      )
    );
  }

  return findings;
}

/**
 * Deterministic reuse key: content/source revision, recipe + its locked
 * version, accent, token policy, renderer version, and the requested output
 * set. Two requests that differ only by an unrelated field never collide,
 * and any of these fields changing produces a new key — the only way an
 * unchanged request can be served from cache.
 */
export function computeMarketingMediaExportCacheKey(
  request: MarketingMediaExportRequest
): string {
  // An ordered array via JSON.stringify (not a delimiter-joined string) so a
  // field value that happens to contain the delimiter can never collide with
  // a different field split.
  return JSON.stringify([
    request.fixtureId,
    request.sourceRevision,
    request.recipeId,
    JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
    request.accentToken,
    request.tokenPolicyVersion,
    request.rendererVersion,
    [...request.outputProfiles].toSorted(),
  ]);
}

export interface MarketingMediaExportOutputReceipt {
  readonly profile: MarketingMediaExportOutputProfile;
  readonly assetHash: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly rightsProvenance: string;
  readonly carriedForward: boolean;
}

export interface MarketingMediaExportReceipt {
  readonly schema: typeof MARKETING_MEDIA_EXPORT_SCHEMA;
  readonly cacheKey: string;
  readonly fixtureId: string;
  readonly sourceRevision: string;
  readonly recipeId: MarketingMediaRecipeId;
  readonly recipeVersion: string;
  readonly tokenPolicyVersion: string;
  readonly rendererVersion: string;
  readonly outputs: readonly MarketingMediaExportOutputReceipt[];
  readonly receiptDigest: string;
  readonly approved: boolean;
  readonly approvalEvidenceId?: string;
}

function computeReceiptDigest(
  outputs: readonly MarketingMediaExportOutputReceipt[]
): string {
  return outputs
    .map(output => `${output.profile}:${output.assetHash}`)
    .toSorted()
    .join('|');
}

export type MarketingMediaExportOutputResult =
  | {
      readonly ok: true;
      readonly assetHash: string;
      readonly width: number;
      readonly height: number;
      readonly format: string;
      readonly rightsProvenance: string;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'output-timeout'
        | 'output-provider-unavailable'
        | 'output-render-failed';
    };

export interface MarketingMediaExportExecutionInput {
  readonly request: MarketingMediaExportRequest;
  /** The last accepted (approved) receipt for this fixture, if any. */
  readonly existingReceipt?: MarketingMediaExportReceipt;
  /**
   * The seam existing job execution / capture / composition owners plug
   * into. Never called for a reused request, and never called for a profile
   * the request did not ask for (e.g. video stays untouched on a
   * static-only request even when the video renderer is unavailable).
   */
  readonly produceOutput: (
    profile: MarketingMediaExportOutputProfile
  ) => MarketingMediaExportOutputResult;
}

export type MarketingMediaExportExecutionResult =
  | {
      readonly status: 'rejected';
      readonly findings: readonly MarketingMediaExportFinding[];
    }
  | { readonly status: 'reused'; readonly receipt: MarketingMediaExportReceipt }
  | {
      readonly status: 'executed';
      readonly receipt: MarketingMediaExportReceipt;
    }
  | {
      readonly status: 'partial';
      readonly receipt: MarketingMediaExportReceipt;
      readonly findings: readonly MarketingMediaExportFinding[];
    };

export function executeMarketingMediaExportRequest(
  input: MarketingMediaExportExecutionInput
): MarketingMediaExportExecutionResult {
  const { request, existingReceipt, produceOutput } = input;

  const validation = validateMarketingMediaExportRequest(request);
  if (
    validation.length > 0 ||
    !isApprovedMarketingMediaRecipeId(request.recipeId)
  ) {
    return { status: 'rejected', findings: validation };
  }

  const cacheKey = computeMarketingMediaExportCacheKey(request);
  const requestedProfiles = request.outputProfiles.filter(
    isMarketingMediaExportOutputProfile
  );

  if (
    existingReceipt &&
    existingReceipt.approved &&
    existingReceipt.cacheKey === cacheKey &&
    requestedProfiles.every(profile =>
      existingReceipt.outputs.some(output => output.profile === profile)
    )
  ) {
    return { status: 'reused', receipt: existingReceipt };
  }

  const outputs: MarketingMediaExportOutputReceipt[] = [];
  const executionFindings: MarketingMediaExportFinding[] = [];
  // Carrying forward on failure is independent of the source revision that
  // triggered this attempt — the point is to never publish nothing for a
  // slot that already has an approved asset. It still only applies within
  // the same fixture + recipe pairing.
  const canCarryForward =
    request.fallbackPolicy === 'retain-last-approved' &&
    existingReceipt !== undefined &&
    existingReceipt.approved &&
    existingReceipt.fixtureId === request.fixtureId &&
    existingReceipt.recipeId === request.recipeId;

  for (const profile of requestedProfiles) {
    const result = produceOutput(profile);
    if (result.ok) {
      outputs.push({
        profile,
        assetHash: result.assetHash,
        width: result.width,
        height: result.height,
        format: result.format,
        rightsProvenance: result.rightsProvenance,
        carriedForward: false,
      });
      continue;
    }

    executionFindings.push(
      finding(result.code, profile, `${profile} failed: ${result.code}.`)
    );

    const carried = canCarryForward
      ? existingReceipt?.outputs.find(output => output.profile === profile)
      : undefined;
    if (carried) {
      outputs.push({ ...carried, carriedForward: true });
    }
  }

  const receipt: MarketingMediaExportReceipt = {
    schema: MARKETING_MEDIA_EXPORT_SCHEMA,
    cacheKey,
    fixtureId: request.fixtureId,
    sourceRevision: request.sourceRevision,
    recipeId: request.recipeId,
    recipeVersion: JOVIE_MARKETING_MEDIA_RECIPE_VERSION,
    tokenPolicyVersion: request.tokenPolicyVersion,
    rendererVersion: request.rendererVersion,
    outputs,
    receiptDigest: computeReceiptDigest(outputs),
    approved: false,
  };

  if (executionFindings.length === 0) {
    return { status: 'executed', receipt };
  }

  return { status: 'partial', receipt, findings: executionFindings };
}

export interface MarketingMediaExportApprovalEvidence {
  readonly approvedReceiptDigest: string;
  readonly approvalEvidenceId: string;
}

export type MarketingMediaExportApprovalResult =
  | { readonly ok: true; readonly receipt: MarketingMediaExportReceipt }
  | {
      readonly ok: false;
      readonly findings: readonly MarketingMediaExportFinding[];
    };

/**
 * A successful `execute` never self-approves (JOV-6250: "a generated success
 * flag does not approve its own artifact"). Promotion is this separate step,
 * gated on the caller re-stating the exact receipt digest it reviewed — a
 * digest that no longer matches (stale or changed output) is rejected.
 */
export function approveMarketingMediaExportReceipt(
  receipt: MarketingMediaExportReceipt,
  evidence: MarketingMediaExportApprovalEvidence
): MarketingMediaExportApprovalResult {
  if (evidence.approvedReceiptDigest !== receipt.receiptDigest) {
    return {
      ok: false,
      findings: [
        finding(
          'stale-approval-hash',
          receipt.fixtureId,
          'The approval evidence digest does not match the current receipt. Re-review before approving.'
        ),
      ],
    };
  }
  if (!evidence.approvalEvidenceId.trim()) {
    return {
      ok: false,
      findings: [
        finding(
          'missing-approval-evidence',
          receipt.fixtureId,
          'Approval requires a scoped evidence id, not a bare success flag.'
        ),
      ],
    };
  }

  return {
    ok: true,
    receipt: {
      ...receipt,
      approved: true,
      approvalEvidenceId: evidence.approvalEvidenceId,
    },
  };
}

function formatRecipeSpecificExportConstraints(
  recipeId: MarketingMediaRecipeId
): readonly string[] {
  if (recipeId === 'flowing-accent') {
    return [
      'Flow direction: one coherent dominant sweep — never crossing or contradicting curves.',
    ];
  }
  return [];
}

/**
 * Prompt block for a specific export request. Snapshot-tested to prove the
 * canonical accent, flow-direction and safe-area rules are always present
 * and that fabricated UI stays prohibited (JOV-6250 acceptance #5).
 */
export function formatMarketingMediaExportRequestForPrompt(
  request: MarketingMediaExportRequest
): string {
  const recipeConstraints = isApprovedMarketingMediaRecipeId(request.recipeId)
    ? formatRecipeSpecificExportConstraints(request.recipeId)
    : [];

  return [
    formatMarketingMediaRecipesForPrompt(),
    `Canonical accent for this export: ${request.accentToken}.`,
    `Output profiles: ${request.outputProfiles.join(', ')}.`,
    `Fallback policy: ${request.fallbackPolicy}.`,
    ...recipeConstraints,
    ...MARKETING_MEDIA_EXPORT_NEGATIVE_CONSTRAINTS,
  ].join('\n');
}
