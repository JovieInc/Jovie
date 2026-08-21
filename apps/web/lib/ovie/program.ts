/**
 * JOV-5214 program contract.
 *
 * Founder correction 2026-08-19/20. Canonical parent. Supersedes conflicting
 * historical issue prose, docs, configs, agent output, and PR descriptions.
 *
 * Ovie is Tim's door and ops presentation — not a persona, model identity,
 * independent memory, or source of truth. Eve intakes/acks/routes with no
 * discretionary authority. Summer owns company Kanban and never edits product
 * code. Symphony is the sole coding orchestrator. Gem is an Ubuntu host.
 */

export const OVIE_PROGRAM_ID = 'JOV-5214' as const;

export const OVIE_CANONICAL_FLOW =
  'Tim -> Ovie -> Eve intake/ack -> durable Kanban -> Summer -> Symphony -> identified coding worker on Gem Ubuntu' as const;

export const OVIE_PROGRAM_ROLES = {
  ovie: {
    kind: 'door',
    isPersona: false,
    isModelIdentity: false,
    isIndependentMemory: false,
    isSourceOfTruth: false,
    description:
      "Tim's macOS/iOS door and operations presentation. Not an agent persona.",
  },
  eve: {
    kind: 'intake',
    discretionaryAuthority: false,
    description:
      'Durably persists, classifies, acknowledges, and routes. Cannot choose priorities, answer as Summer, dispatch code, self-promote, or broaden permissions.',
  },
  summer: {
    kind: 'chief-of-staff',
    ownsCompanyKanban: true,
    mayEditProductCode: false,
    runtimeThroughM1: 'mac',
    description:
      'Chief of Staff. Owns priorities, initiative decomposition, follow-up, audits, and routing. Never edits product code. Stays on the authoritative Mac runtime through M1.',
  },
  symphony: {
    kind: 'coding-orchestrator',
    soleOrchestrator: true,
    description:
      'Sole coding orchestrator. Owns code decomposition, admission, WIP, retries, worker assignment, tests, coverage, and coding receipts.',
  },
  gem: {
    kind: 'execution-host',
    isAgent: false,
    isPersona: false,
    description: 'Ubuntu execution host, never an agent or persona.',
  },
} as const;

export const CODING_PROVENANCE = {
  orchestrator: 'symphony',
  executionHost: 'gem',
} as const;

export const MERGE_AUTHORITY = 'github-native-merge-queue' as const;

export const OVIE_PROGRAM_CHILDREN = [
  'JOV-5215',
  'JOV-5212',
  'JOV-5226',
  'JOV-5248',
  'JOV-5249',
  'JOV-4320',
  'JOV-5253',
] as const;

export const HELD_OVIE_PERSONA_PRS = [16253, 16268] as const;

export const GEM_OPENCLAW_AGENT_STATUS = 'retired' as const;

export const PROOF_TIERS = [
  'planned',
  'dispatched',
  'source',
  'tests',
  'coverage',
  'runtime',
  'pr',
  'ci',
  'native-queue',
  'merged',
  'deployed',
  'exact-build',
  'dogfood',
  'recurrence',
] as const;

export type ProofTier = (typeof PROOF_TIERS)[number];

/** Source through deploy are progress. M1 requires packaged dogfood plus independent reproduction. */
export const M1_INSUFFICIENT_PROOF_TIERS = [
  'planned',
  'dispatched',
  'source',
  'tests',
  'coverage',
  'runtime',
  'pr',
  'ci',
  'native-queue',
  'merged',
  'deployed',
  'exact-build',
] as const satisfies readonly ProofTier[];

export const M1_REQUIRED_PROOF_TIERS = [
  'dogfood',
  'recurrence',
] as const satisfies readonly ProofTier[];

export const OPERATIONAL_TRUTH_STATES = [
  'fresh',
  'stale',
  'disconnected',
  'unavailable',
  'unauthorized',
  'degraded',
  'unknown',
  'failure',
  'recovery',
] as const;

export type OperationalTruthState = (typeof OPERATIONAL_TRUTH_STATES)[number];

export const TELEMETRY_BRIDGE = {
  mode: 'read-only',
  forbiddenActuation: [
    'raw-logs',
    'secrets',
    'arbitrary-command',
    'dispatch',
    'retry',
    'cancel',
    'restart',
  ],
} as const;

export const OVIE_PROGRAM = {
  id: OVIE_PROGRAM_ID,
  flow: OVIE_CANONICAL_FLOW,
  m1Status: 'not-passed',
  gemOpenClawAgent: GEM_OPENCLAW_AGENT_STATUS,
  mergeAuthority: MERGE_AUTHORITY,
  provenance: CODING_PROVENANCE,
  summerRuntimeThroughM1: 'mac',
} as const;

export class OvieProgramError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'OvieProgramError';
  }
}

const OVIE_SELF_ID_RE =
  /\b(?:i\s+am|i['’]m|im)\s+ovie\b|\byou\s+are\s+(?:talking\s+to\s+)?ovie\b|\bask\s+ovie\b/i;

export function assertModelMustNotSelfIdentifyAsOvie(text: string): void {
  if (OVIE_SELF_ID_RE.test(text)) {
    throw new OvieProgramError(
      'ovie-self-id',
      'Ovie/Eve must not make a model self-identify as Ovie'
    );
  }
}

export type OvieDoorGenerationKind = 'artist-jovie' | 'summer-transport';

export function assertOvieDoorDoesNotUseArtistJovieGeneration(
  chatMode: 'ov' | null | undefined,
  generationKind: OvieDoorGenerationKind
): void {
  if (chatMode === 'ov' && generationKind === 'artist-jovie') {
    throw new OvieProgramError(
      'ovie-door-artist-jovie-fallthrough',
      'Ovie/Eve must never fall through to ordinary artist Jovie chat'
    );
  }
}

export type M1Evidence = {
  readonly dogfood: boolean;
  readonly independentReproduction: boolean;
  readonly presentTiers: readonly ProofTier[];
};

export function isM1Passed(evidence: M1Evidence): boolean {
  if (!evidence.dogfood || !evidence.independentReproduction) {
    return false;
  }
  const present = new Set(evidence.presentTiers);
  return M1_REQUIRED_PROOF_TIERS.every(tier => present.has(tier));
}

export function reportM1Status(evidence: M1Evidence): 'passed' | 'not-passed' {
  return isM1Passed(evidence) ? 'passed' : 'not-passed';
}

export function reviveGemOpenClawAgent(): never {
  throw new OvieProgramError(
    'gem-openclaw-retired',
    'The former Gem OpenClaw agent remains retired. No code path may revive or continue it.'
  );
}

export function telemetryBridgeAllowsActuation(
  surface: (typeof TELEMETRY_BRIDGE.forbiddenActuation)[number]
): false {
  void surface;
  return false;
}
