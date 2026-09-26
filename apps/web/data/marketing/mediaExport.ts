// JOV-6250: pure request/receipt layer over the JOV-6246 recipe registry.
// `produceOutput` is the seam existing capture/composition/job owners plug into.

export const MARKETING_MEDIA_EXPORT_RENDERER_VERSION = 'capture-stack-v1';

export const MARKETING_MEDIA_OUTPUT_PROFILES = [
  'still',
  'poster',
  'sequence',
] as const;
export type MarketingMediaOutputProfile =
  (typeof MARKETING_MEDIA_OUTPUT_PROFILES)[number];

// Two fixtures on one locked recipe prove reuse without a new component.
const DARK_GLASS_HEADER_SOURCE = {
  recipeId: 'dark-glass',
  accentRef: '--noir-ion-shell',
  sourceRevision: 'GTcgO@eoUUU',
} as const;
export const MARKETING_MEDIA_EXPORT_FIXTURES = [
  { fixtureId: 'homepage-header-bar', ...DARK_GLASS_HEADER_SOURCE },
  { fixtureId: 'pricing-header-bar', ...DARK_GLASS_HEADER_SOURCE },
] as const;
export type MarketingMediaExportFixture =
  (typeof MARKETING_MEDIA_EXPORT_FIXTURES)[number];

export interface MarketingMediaExportRequest {
  readonly fixtureId: string;
  readonly sourceRevision: string;
  readonly recipeId: string;
  readonly accentRef: string;
  readonly outputProfiles: readonly MarketingMediaOutputProfile[];
  readonly videoAvailable: boolean;
}

export type MarketingMediaExportFindingCode =
  | 'malformed-request'
  | 'unknown-fixture'
  | 'unknown-accent'
  | 'stale-approval-hash'
  | 'render-timeout'
  | 'render-failed'
  | 'provider-unavailable';

export interface MarketingMediaExportFinding {
  readonly code: MarketingMediaExportFindingCode;
  readonly message: string;
}

const isBadString = (value: unknown) => typeof value !== 'string' || !value;

export function validateMarketingMediaExportRequest(
  request: MarketingMediaExportRequest
): readonly MarketingMediaExportFinding[] {
  const profiles = request.outputProfiles;
  if (
    isBadString(request.fixtureId) ||
    isBadString(request.sourceRevision) ||
    isBadString(request.recipeId) ||
    isBadString(request.accentRef) ||
    typeof request.videoAvailable !== 'boolean' ||
    !Array.isArray(profiles) ||
    profiles.length === 0 ||
    new Set(profiles).size !== profiles.length ||
    !profiles.every(p =>
      (MARKETING_MEDIA_OUTPUT_PROFILES as readonly string[]).includes(p)
    )
  ) {
    return [{ code: 'malformed-request', message: 'required field missing.' }];
  }

  const fixture = MARKETING_MEDIA_EXPORT_FIXTURES.find(
    f => f.fixtureId === request.fixtureId
  );
  if (!fixture) {
    return [
      {
        code: 'unknown-fixture',
        message: `${request.fixtureId} not registered.`,
      },
    ];
  }
  if (
    request.accentRef !== fixture.accentRef ||
    request.recipeId !== fixture.recipeId
  ) {
    return [
      {
        code: 'unknown-accent',
        message: `${request.accentRef} not canonical for ${request.fixtureId}.`,
      },
    ];
  }
  return [];
}

// Same inputs -> same key, so repeats reuse instead of re-rendering.
export function computeMarketingMediaExportCacheKey(
  request: MarketingMediaExportRequest
): string {
  return [
    request.fixtureId,
    request.sourceRevision,
    request.recipeId,
    request.accentRef,
    MARKETING_MEDIA_EXPORT_RENDERER_VERSION,
    [...request.outputProfiles].sort().join(','),
  ].join('::');
}

export interface MarketingMediaExportOutputReceipt {
  readonly profile: MarketingMediaOutputProfile;
  readonly assetHash: string;
  readonly approved: boolean;
  // Carried forward from an earlier cache key after a failed render, not
  // this key's own output: never a skip-render source, never re-blessed by
  // approve(), but still eligible to keep serving across repeated failures.
  readonly fallback: boolean;
}

export interface MarketingMediaExportReceipt {
  readonly cacheKey: string;
  readonly fixtureId: string;
  readonly rendererVersion: string;
  readonly outputs: readonly MarketingMediaExportOutputReceipt[];
  readonly findings: readonly MarketingMediaExportFinding[];
}

export type ProduceMarketingMediaOutput = (
  request: MarketingMediaExportRequest,
  profile: MarketingMediaOutputProfile
) =>
  | { readonly assetHash: string }
  | { readonly error: 'timeout' | 'provider-unavailable' | 'render-failed' };

const FAILURE_CODE = {
  timeout: 'render-timeout',
  'provider-unavailable': 'provider-unavailable',
  'render-failed': 'render-failed',
} as const;

export function executeMarketingMediaExportRequest(
  request: MarketingMediaExportRequest,
  produceOutput: ProduceMarketingMediaOutput,
  existingReceipt?: MarketingMediaExportReceipt
): MarketingMediaExportReceipt {
  const findings = validateMarketingMediaExportRequest(request);
  const fixtureId = request.fixtureId;
  const rendererVersion = MARKETING_MEDIA_EXPORT_RENDERER_VERSION;
  if (findings.length > 0) {
    return { cacheKey: '', fixtureId, rendererVersion, outputs: [], findings };
  }
  const cacheKey = computeMarketingMediaExportCacheKey(request);

  // Fallback never crosses fixtures and never skips a render for this key.
  const cacheHit = existingReceipt?.cacheKey === cacheKey;
  const sameFixture = existingReceipt?.fixtureId === fixtureId;
  const priorByProfile = new Map(
    (sameFixture ? (existingReceipt?.outputs ?? []) : []).map(o => [
      o.profile,
      o,
    ])
  );

  const outputs: MarketingMediaExportOutputReceipt[] = [];
  const runFindings: MarketingMediaExportFinding[] = [];

  for (const profile of request.outputProfiles) {
    if (profile === 'sequence' && !request.videoAvailable) {
      runFindings.push({
        code: 'provider-unavailable',
        message: 'video renderer unavailable; static-only outputs apply.',
      });
      continue;
    }
    const prior = priorByProfile.get(profile);
    if (cacheHit && prior?.approved && !prior.fallback) {
      outputs.push(prior);
      continue;
    }
    let result: ReturnType<ProduceMarketingMediaOutput>;
    try {
      result = produceOutput(request, profile);
    } catch {
      result = { error: 'render-failed' };
    }
    if ('error' in result || !result.assetHash) {
      const code =
        'error' in result ? FAILURE_CODE[result.error] : 'render-failed';
      runFindings.push({
        code,
        message: `${profile} failed to produce a usable asset.`,
      });
      if (prior?.approved) outputs.push({ ...prior, fallback: true });
      continue;
    }
    outputs.push({
      profile,
      assetHash: result.assetHash,
      approved: false,
      fallback: false,
    });
  }

  return {
    cacheKey,
    fixtureId,
    rendererVersion,
    outputs,
    findings: runFindings,
  };
}

// Success alone doesn't approve: the caller must restate the exact cache key.
export function approveMarketingMediaExportReceipt(
  receipt: MarketingMediaExportReceipt,
  restatedCacheKey: string
): MarketingMediaExportReceipt {
  if (restatedCacheKey !== receipt.cacheKey) {
    return {
      ...receipt,
      findings: [
        ...receipt.findings,
        {
          code: 'stale-approval-hash',
          message: 'restated key does not match.',
        },
      ],
    };
  }
  return {
    ...receipt,
    outputs: receipt.outputs.map(o =>
      o.fallback ? o : { ...o, approved: true }
    ),
  };
}
