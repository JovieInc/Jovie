import type { OvieLane, OvieReceipt } from '@/lib/ovie/ingest';

export const OVIE_MCP_PROTOCOL_VERSION = '2025-03-26';
export const OVIE_MCP_SERVER_NAME = 'ovie';
export const OVIE_MCP_IDENTITY = 'summer' as const;

export const OVIE_MCP_TOOLS = [
  'get_org_state',
  'get_invariant_stewardship',
  'record_decision',
  'create_initiative',
  'get_initiative',
  'get_feature_state',
  'certify_feature',
  'request_workflow_capture',
  'get_workflow_capture',
  'search_gbrain',
  'get_gbrain_page',
  'record_operational_memory',
  'coordinate_linear_work',
  'record_bounded_approval',
  'get_bounded_approval',
  'get_proof_brief',
  'list_linear_issues',
  'create_linear_issue',
  'list_github_pull_requests',
  'get_github_pull_request',
  'list_github_issues',
  'get_github_issue',
] as const;

export type OvieMcpToolName = (typeof OVIE_MCP_TOOLS)[number];

/** Every registered capability is founder-private and has an explicit scope. */
export const OVIE_MCP_TOOL_SCOPES = {
  get_org_state: 'ovie:read',
  get_invariant_stewardship: 'ovie:read',
  record_decision: 'ovie:write',
  create_initiative: 'ovie:write',
  get_initiative: 'ovie:read',
  get_feature_state: 'ovie:read',
  certify_feature: 'ovie:write',
  request_workflow_capture: 'ovie:write',
  get_workflow_capture: 'ovie:read',
  search_gbrain: 'ovie:read',
  get_gbrain_page: 'ovie:read',
  record_operational_memory: 'ovie:write',
  coordinate_linear_work: 'ovie:write',
  record_bounded_approval: 'ovie:write',
  get_bounded_approval: 'ovie:read',
  get_proof_brief: 'ovie:read',
  list_linear_issues: 'ovie:read',
  create_linear_issue: 'ovie:write',
  list_github_pull_requests: 'ovie:read',
  get_github_pull_request: 'ovie:read',
  list_github_issues: 'ovie:read',
  get_github_issue: 'ovie:read',
} as const satisfies Record<OvieMcpToolName, 'ovie:read' | 'ovie:write'>;

export const OVIE_WRITE_TOOLS = OVIE_MCP_TOOLS.filter(
  name => OVIE_MCP_TOOL_SCOPES[name] === 'ovie:write'
);

export const OVIE_FOUNDER_TOOLS = OVIE_MCP_TOOLS.filter(
  name => OVIE_MCP_TOOL_SCOPES[name] === 'ovie:read'
);

/** Only locally validated, static argument errors may be returned to callers. */
export class OvieMcpInputError extends Error {
  constructor(
    readonly publicMessage:
      | 'decided is required'
      | 'confidence must be high, medium, or low'
      | 'authenticated app user subject is required'
      | 'invalid workflow capture request'
      | 'capture_id is required'
      | 'query is required'
      | 'slug is required'
      | "action must be 'create' or 'update'"
      | 'limit must be an integer between 1 and 50'
      | 'state must be open, closed, or all'
      | 'number must be a positive integer'
      | 'invalid initiative handoff'
      | 'audience must be investor, customer, manager, founder, or internal'
      | 'kind must be observed, inference, proposal, or approved-decision'
      | 'verification requires action and repository together with actor'
  ) {
    super(publicMessage);
    this.name = 'OvieMcpInputError';
  }
}

export type CertLevel =
  | 'discovered'
  | 'implemented'
  | 'verified'
  | 'production-dogfooded'
  | 'certified'
  | 'broadly-rolled-out'
  | 'trusted';

export const INITIATIVE_CONFIDENCE = ['high', 'medium', 'low'] as const;

export type InitiativeConfidence = (typeof INITIATIVE_CONFIDENCE)[number];

export type InitiativeStatus =
  | 'proposed'
  | 'accepted'
  | 'planned'
  | 'executing'
  | 'blocked'
  | 'implemented'
  | 'verified'
  | 'certified'
  | 'rolled-out'
  | 'failed'
  | 'cancelled';

export type OvieRoutingState =
  | 'queued'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'unavailable'
  | 'landed'
  | 'done';

export type OvieHandoff = {
  readonly title: string;
  readonly intent: string;
  readonly why?: string;
  readonly desired_outcome?: string;
  readonly success_criteria?: readonly string[];
  readonly constraints?: readonly string[];
  readonly non_goals?: readonly string[];
  readonly priority?: OvieLane;
  readonly scope?: string;
  readonly known_context?: string;
  readonly open_questions?: readonly string[];
  readonly evidence_required?: readonly string[];
  readonly provenance?: string;
};

export type OvieDecision = {
  readonly id: string;
  readonly kind: 'decision';
  readonly decided: string;
  readonly why?: string;
  readonly constraints?: readonly string[];
  readonly provenance?: string;
  readonly affected?: readonly string[];
  readonly supersedes?: string;
  readonly createdAt: string;
};

export type OvieBlocker = {
  readonly summary?: string;
  readonly owner?: string;
  readonly nextAction?: string;
  /** ISO timestamp by which the next proof must be observed. */
  readonly nextProofDeadline?: string;
};

export type OvieInitiative = {
  readonly id: string;
  readonly kind: 'initiative';
  readonly status: InitiativeStatus;
  readonly confidence: InitiativeConfidence;
  readonly handoff: OvieHandoff;
  readonly lane: OvieLane;
  readonly destination: OvieReceipt['destination'];
  readonly receipts: readonly OvieReceipt[];
  readonly decisionId?: string;
  readonly workerSpawned: false;
  /** Kanban task id or Linear identifier. Null until ovie-intake-to-kanban.py lands. */
  readonly destinationHandle?: string | null;
  readonly idempotencyKey?: string;
  readonly routingState?: OvieRoutingState;
  readonly routingReason?: string;
  /** Persisted blocker facts. Present only while routingState is blocked. */
  readonly blocker?: OvieBlocker;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidence: readonly OvieEvidence[];
};

export type CertificationPassName =
  | 'author'
  | 'adversary'
  | 'execute'
  | 'backfill';

export type CertificationPass = {
  readonly n: 1 | 2 | 3 | 4;
  readonly name: CertificationPassName;
  readonly job: string;
};

export type OvieSummerTurnState = 'queued' | 'claimed' | 'completed' | 'failed';

export type OvieSummerTurn = {
  readonly id: string;
  readonly kind: 'summer-turn';
  readonly conversationId: string;
  readonly userText: string;
  readonly state: OvieSummerTurnState;
  readonly eveWorkId?: string | null;
  readonly eveAcks?: readonly string[];
  readonly responseText?: string;
  readonly failureCode?: string;
  readonly claimedBy?: string;
  readonly claimToken?: string;
  readonly claimExpiresAt?: string;
  readonly tool?: {
    readonly name: string;
    readonly ok: boolean;
    readonly receiptId: string;
    readonly summary: string;
    /** Optional structured card payload (e.g. summer.ops-card.v1). */
    readonly data?: unknown;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OvieEvidence = {
  readonly kind:
    | 'receipt'
    | 'destination'
    | 'cert-spec'
    | 'inventory'
    | 'landed';
  readonly summary: string;
  readonly ref?: string;
  /** Kanban task id or Linear identifier after the Mac lander writes. */
  readonly landed_ref?: string;
  /** ISO timestamp when the evidence was observed by its writer. */
  readonly observedAt?: string;
};

export type OvieMcpPrincipal = {
  readonly authenticated: boolean;
  readonly isAdmin: boolean;
  readonly subject?: string;
  readonly email?: string;
  readonly scopes: readonly string[];
};

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  readonly jsonrpc?: string;
  readonly id?: JsonRpcId;
  readonly method?: string;
  readonly params?: unknown;
};
