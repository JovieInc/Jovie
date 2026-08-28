import type { OvieLane, OvieReceipt } from '@/lib/ovie/ingest';

export const OVIE_MCP_PROTOCOL_VERSION = '2025-03-26';
export const OVIE_MCP_SERVER_NAME = 'ovie';
export const OVIE_MCP_IDENTITY = 'ovie' as const;

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
] as const;

export type OvieMcpToolName = (typeof OVIE_MCP_TOOLS)[number];

export const OVIE_WRITE_TOOLS = [
  'record_decision',
  'create_initiative',
  'certify_feature',
  'request_workflow_capture',
] as const;

/** Read-only operating detail that is still founder-private. */
export const OVIE_FOUNDER_TOOLS = [
  'get_invariant_stewardship',
  'get_workflow_capture',
] as const;

export type CertLevel =
  | 'discovered'
  | 'implemented'
  | 'verified'
  | 'production-dogfooded'
  | 'certified'
  | 'broadly-rolled-out'
  | 'trusted';

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

export type OvieInitiative = {
  readonly id: string;
  readonly kind: 'initiative';
  readonly status: InitiativeStatus;
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidence: readonly OvieEvidence[];
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
