import { authorizeSummerControl } from '@/lib/ovie/control';
import { bindEveIdentityForTurn } from '@/lib/ovie/identity';
import { initiativeAckView } from '@/lib/ovie/persist';
import { getPage, searchPages } from '@/lib/wiki/gbrain-client';
import { CreateWorkflowCaptureRequestSchema } from '@/lib/workflow-capture/contract';
import {
  createWorkflowCaptureRequest,
  getWorkflowCaptureReceipt,
} from '@/lib/workflow-capture/server';
import stewardshipAudit from '../generated/invariant-stewardship.current-week.json';
import {
  certificationPasses,
  findProfileCapability,
  loadProfileCapabilitiesFromDisk,
  renderArtistProfileInventory,
} from './artist-profile-inventory';
import {
  classifyHandoff,
  parseHandoff,
  stringList,
  stringOpt,
} from './handoff';
import { newRecordId, type OperatingStore } from './store';
import {
  INITIATIVE_CONFIDENCE,
  type InitiativeConfidence,
  type InitiativeStatus,
  OVIE_FOUNDER_TOOLS,
  OVIE_MCP_IDENTITY,
  OVIE_MCP_TOOLS,
  OVIE_WRITE_TOOLS,
  type OvieMcpPrincipal,
  type OvieMcpToolName,
} from './types';

export function isOvieWriteTool(name: string): boolean {
  return (OVIE_WRITE_TOOLS as readonly string[]).includes(name);
}

export function isOvieFounderTool(name: string): boolean {
  return (OVIE_FOUNDER_TOOLS as readonly string[]).includes(name);
}

export function authorizeOvieMcpTool(
  principal: OvieMcpPrincipal,
  tool: string
): { ok: true } | { ok: false; status: 401 | 403; message: string } {
  if (!principal.authenticated) {
    return { ok: false, status: 401, message: 'authentication required' };
  }
  if (isOvieWriteTool(tool) || isOvieFounderTool(tool)) {
    const gate = authorizeSummerControl({
      authenticated: principal.authenticated,
      isAdmin: principal.isAdmin,
    });
    if (!gate.ok) {
      return {
        ok: false,
        status: gate.status,
        message: isOvieWriteTool(tool)
          ? 'founder authorization required for writes'
          : 'founder authorization required for operating detail',
      };
    }
  }
  return { ok: true };
}

export function listOvieMcpTools() {
  return OVIE_MCP_TOOLS.map(name => ({
    name,
    description: toolDescription(name),
    inputSchema: toolInputSchema(name),
  }));
}

function toolInputSchema(name: OvieMcpToolName): Record<string, unknown> {
  if (name === 'request_workflow_capture') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['requesting_task_id', 'title', 'instructions'],
      properties: {
        requesting_task_id: { type: 'string', minLength: 1, maxLength: 200 },
        request_key: { type: 'string', minLength: 1, maxLength: 128 },
        title: { type: 'string', minLength: 1, maxLength: 160 },
        instructions: { type: 'string', minLength: 1, maxLength: 2000 },
        start_url: { type: 'string', format: 'uri' },
        expires_in_hours: { type: 'integer', minimum: 1, maximum: 720 },
      },
    };
  }
  if (name === 'get_workflow_capture') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['capture_id'],
      properties: {
        capture_id: { type: 'string', minLength: 1 },
      },
    };
  }
  return { type: 'object', additionalProperties: true };
}

function toolDescription(name: OvieMcpToolName): string {
  switch (name) {
    case 'get_org_state':
      return 'Concise Ovie org/product state for a query.';
    case 'get_invariant_stewardship':
      return 'Current Summer invariant exceptions and founder decision queue; healthy detail stays in drill-down.';
    case 'record_decision':
      return 'Persist a decision. Does not execute.';
    case 'create_initiative':
      return 'Ack and persist an Ovie initiative with confidence. No worker spawn.';
    case 'get_initiative':
      return 'Status plus evidence. Merged code is not certified.';
    case 'get_feature_state':
      return 'Implementation, flag, and certification ladder for a feature.';
    case 'certify_feature':
      return 'Draft a four-pass outcome certification spec. Does not run live money missions.';
    case 'request_workflow_capture':
      return 'Put an owner-scoped Record Workflow card in Ovie Inbox for the requesting task. Returns a durable receipt; never starts recording automatically.';
    case 'get_workflow_capture':
      return 'Read the owner-scoped recording receipt for a requesting task. Ready receipts include an authenticated media path, never a blob credential.';
    case 'search_gbrain':
      return 'Read-only gbrain search. Does not write memory.';
    case 'get_gbrain_page':
      return 'Read-only gbrain page by slug. Does not write memory.';
  }
}

export async function callOvieMcpTool(
  store: OperatingStore,
  principal: OvieMcpPrincipal,
  name: string,
  args: Record<string, unknown>
): Promise<
  | { ok: true; result: unknown }
  | { ok: false; message: string; status?: 401 | 403 }
> {
  const authz = authorizeOvieMcpTool(principal, name);
  if (!authz.ok) return authz;

  const turn = bindEveIdentityForTurn(OVIE_MCP_IDENTITY);
  if (isOvieWriteTool(name)) turn.require('ingest-ack');
  if (name === 'search_gbrain' || name === 'get_gbrain_page') {
    turn.require('gbrain-read');
  }

  switch (name) {
    case 'get_org_state':
      return { ok: true, result: await getOrgState(store, args) };
    case 'get_invariant_stewardship':
      return { ok: true, result: getInvariantStewardship() };
    case 'record_decision':
      return { ok: true, result: await recordDecision(store, args) };
    case 'create_initiative':
      return { ok: true, result: await createInitiative(store, args) };
    case 'get_initiative':
      return await getInitiative(store, args);
    case 'get_feature_state':
      return { ok: true, result: getFeatureState(args) };
    case 'certify_feature':
      return { ok: true, result: certifyFeature(args) };
    case 'request_workflow_capture':
      return {
        ok: true,
        result: await requestWorkflowCapture(principal, args),
      };
    case 'get_workflow_capture':
      return {
        ok: true,
        result: await getWorkflowCapture(principal, args),
      };
    case 'search_gbrain':
      return { ok: true, result: await searchGbrain(args) };
    case 'get_gbrain_page':
      return { ok: true, result: await getGbrainPage(args) };
    default:
      return { ok: false, message: `Unknown tool: ${name}` };
  }
}

function principalUserId(principal: OvieMcpPrincipal): string {
  const userId = principal.subject?.trim();
  if (!userId) throw new Error('authenticated app user subject is required');
  return userId;
}

async function requestWorkflowCapture(
  principal: OvieMcpPrincipal,
  args: Record<string, unknown>
) {
  const parsed = CreateWorkflowCaptureRequestSchema.safeParse({
    requestingTaskId: stringOpt(args.requesting_task_id),
    requestKey: stringOpt(args.request_key),
    title: stringOpt(args.title),
    instructions: stringOpt(args.instructions),
    startUrl: stringOpt(args.start_url),
    expiresInHours: args.expires_in_hours,
    requestedBy: 'jovie_agent',
  });
  if (!parsed.success) throw new Error('invalid workflow capture request');

  const receipt = await createWorkflowCaptureRequest({
    userId: principalUserId(principal),
    request: parsed.data,
  });
  return workflowCaptureToolReceipt(receipt);
}

async function getWorkflowCapture(
  principal: OvieMcpPrincipal,
  args: Record<string, unknown>
) {
  const captureId = stringOpt(args.capture_id)?.trim();
  if (!captureId) throw new Error('capture_id is required');
  const receipt = await getWorkflowCaptureReceipt(
    captureId,
    principalUserId(principal)
  );
  return workflowCaptureToolReceipt(receipt);
}

function workflowCaptureToolReceipt(
  receipt: Awaited<ReturnType<typeof getWorkflowCaptureReceipt>>
) {
  return {
    ...receipt,
    delivery: 'ovie_inbox' as const,
    inboxPath: '/app' as const,
    recordButton: receipt.state === 'pending',
    pollWith: 'get_workflow_capture' as const,
    ...(receipt.state === 'ready'
      ? { mediaPath: `/api/workflow-captures/${receipt.captureId}/media` }
      : {}),
  };
}

function getInvariantStewardship() {
  return {
    schemaVersion: stewardshipAudit.schemaVersion,
    generatedAt: stewardshipAudit.generatedAt,
    window: stewardshipAudit.window,
    canonicalRegistry: stewardshipAudit.canonicalRegistry,
    summary: {
      candidates: stewardshipAudit.candidates.length,
      actionableExceptions: stewardshipAudit.declaredFindings.length,
      founderDecisions: stewardshipAudit.founderQueue.length,
      sourceGaps: stewardshipAudit.sources.filter(
        source => source.status !== 'covered' && source.status !== 'excluded'
      ).length,
    },
    summerQueue: stewardshipAudit.declaredFindings,
    founderQueue: stewardshipAudit.founderQueue,
    drillDown:
      'apps/web/lib/ovie/generated/invariant-stewardship.current-week.json' as const,
  };
}

async function getOrgState(
  store: OperatingStore,
  args: Record<string, unknown>
) {
  const initiatives = await store.listInitiatives();
  const inventory = loadProfileCapabilitiesFromDisk();
  const launchCritical = inventory.filter(
    item => item.launchRelevance === 'must-sell'
  );
  const uncertifiedLaunch = launchCritical.filter(
    item => item.certLevel !== 'certified' && item.certLevel !== 'trusted'
  );
  const recentDecisions = (await store.listDecisions()).slice(-8);
  return {
    identity: OVIE_MCP_IDENTITY,
    role: 'founder',
    query: typeof args.query === 'string' ? args.query : '',
    active_initiatives: initiatives.map(item => ({
      id: item.id,
      title: item.handoff.title,
      status: item.status,
      confidence: item.confidence,
    })),
    recent_decisions: recentDecisions.map(item => ({
      id: item.id,
      decided: item.decided,
    })),
    awaiting_tim: initiatives
      .filter(item => item.status === 'blocked')
      .map(item => item.id),
    profile_capabilities: inventory.length,
    uncertified_launch_critical: uncertifiedLaunch.map(item => ({
      id: item.id,
      feature: item.feature,
      cert_level: item.certLevel,
    })),
    session_handoff: {
      decisions: recentDecisions.map(item => item.decided),
      initiatives: initiatives.map(item => ({
        title: item.handoff.title,
        confidence: item.confidence,
        status: item.status,
      })),
      open_questions: initiatives.flatMap(
        item => item.handoff.open_questions ?? []
      ),
    },
    note: 'Merged code is not certified. Execution is ack + route, not in-request spawn.',
  };
}

async function recordDecision(
  store: OperatingStore,
  args: Record<string, unknown>
) {
  const decided = (
    stringOpt(args.decided) ??
    stringOpt(args.what) ??
    ''
  ).trim();
  if (!decided) throw new Error('decided is required');
  const draft = {
    kind: 'decision' as const,
    decided,
    why: stringOpt(args.why),
    constraints: stringList(args.constraints),
    provenance: stringOpt(args.provenance),
    affected: stringList(args.affected),
    supersedes: stringOpt(args.supersedes),
    createdAt: new Date().toISOString(),
  };
  const record = { ...draft, id: newRecordId('dec') };
  await store.putDecision(record);
  return record;
}

function parseConfidence(value: unknown): InitiativeConfidence {
  if (value === undefined || value === null || value === '') return 'medium';
  if (
    typeof value === 'string' &&
    (INITIATIVE_CONFIDENCE as readonly string[]).includes(value)
  ) {
    return value as InitiativeConfidence;
  }
  throw new Error('confidence must be high, medium, or low');
}

async function createInitiative(
  store: OperatingStore,
  args: Record<string, unknown>
) {
  const parsed = parseHandoff(args.handoff ?? args);
  if (typeof parsed === 'string') throw new Error(parsed);
  const classified = classifyHandoff(parsed);
  const now = new Date().toISOString();
  const draft = {
    kind: 'initiative' as const,
    status: (args.status === 'proposed'
      ? 'proposed'
      : 'accepted') as InitiativeStatus,
    confidence: parseConfidence(args.confidence),
    handoff: parsed,
    lane: classified.lane,
    destination: classified.destination,
    receipts: classified.receipts,
    decisionId: stringOpt(args.decision_id),
    workerSpawned: false as const,
    destinationHandle: null,
    createdAt: now,
    updatedAt: now,
    evidence: classified.receipts.map(receipt => ({
      kind: 'receipt' as const,
      summary: receipt.ack,
      ref: receipt.destination,
    })),
  };
  const record = { ...draft, id: newRecordId('ini') };
  await store.putInitiative(record);
  return initiativeAckView(record);
}

async function getInitiative(
  store: OperatingStore,
  args: Record<string, unknown>
) {
  const id = typeof args.id === 'string' ? args.id : '';
  const record = await store.getInitiative(id);
  if (!record)
    return { ok: false as const, message: `unknown initiative ${id}` };
  return {
    ok: true as const,
    result: {
      ...initiativeAckView(record),
      certified: record.status === 'certified',
      merged_is_not_complete: true,
    },
  };
}

function getFeatureState(args: Record<string, unknown>) {
  const query = typeof args.feature === 'string' ? args.feature : '';
  const inventory = loadProfileCapabilitiesFromDisk();
  const match = findProfileCapability(inventory, query);
  if (!match) {
    return { feature: query, found: false, inventory_size: inventory.length };
  }
  return {
    found: true,
    ...match,
    implementation_state: match.registryStatus,
    certification_state: match.certLevel,
    merged_is_not_certified: true,
  };
}

function certifyFeature(args: Record<string, unknown>) {
  const query =
    typeof args.feature === 'string' ? args.feature : 'public-profile';
  const inventory = loadProfileCapabilitiesFromDisk();
  const match = findProfileCapability(inventory, query);
  const spec =
    match?.proposedMission ??
    'Draft an outcome-level mission: a real user path must succeed; implementation details are not enough.';
  return {
    feature: query,
    executed_live_mission: false,
    money_path_executed: false,
    spec,
    passes: certificationPasses(spec),
    current_level: match?.certLevel ?? 'discovered',
    inventory: match,
    map: renderArtistProfileInventory(inventory).slice(0, 4000),
  };
}

async function searchGbrain(args: Record<string, unknown>) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('query is required');
  const limit = typeof args.limit === 'number' ? args.limit : 8;
  const hits = await searchPages(query, Math.min(Math.max(limit, 1), 20));
  return { query, write: false, hits };
}

async function getGbrainPage(args: Record<string, unknown>) {
  const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
  if (!slug) throw new Error('slug is required');
  const page = await getPage(slug);
  return { slug, write: false, found: Boolean(page), page };
}
