import { authorizeSummerControl } from '@/lib/ovie/control';
import { bindEveIdentityForTurn } from '@/lib/ovie/identity';
import {
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
import { type OperatingStore, sealId } from './store';
import {
  type InitiativeStatus,
  OVIE_MCP_IDENTITY,
  OVIE_MCP_TOOLS,
  OVIE_WRITE_TOOLS,
  type OvieMcpPrincipal,
  type OvieMcpToolName,
} from './types';

export function isOvieWriteTool(name: string): boolean {
  return (OVIE_WRITE_TOOLS as readonly string[]).includes(name);
}

export function authorizeOvieMcpTool(
  principal: OvieMcpPrincipal,
  tool: string
): { ok: true } | { ok: false; status: 401 | 403; message: string } {
  if (!principal.authenticated) {
    return { ok: false, status: 401, message: 'authentication required' };
  }
  if (isOvieWriteTool(tool)) {
    const gate = authorizeSummerControl({
      authenticated: principal.authenticated,
      isAdmin: principal.isAdmin,
    });
    if (!gate.ok) {
      return {
        ok: false,
        status: gate.status,
        message: 'founder authorization required for writes',
      };
    }
  }
  return { ok: true };
}

export function listOvieMcpTools() {
  return OVIE_MCP_TOOLS.map(name => ({
    name,
    description: toolDescription(name),
    inputSchema: { type: 'object', additionalProperties: true },
  }));
}

function toolDescription(name: OvieMcpToolName): string {
  switch (name) {
    case 'get_org_state':
      return 'Concise Ovie org/product state for a query.';
    case 'record_decision':
      return 'Persist a decision. Does not execute.';
    case 'create_initiative':
      return 'Ack and persist an Ovie initiative. No worker spawn.';
    case 'get_initiative':
      return 'Status plus evidence. Merged code is not certified.';
    case 'get_feature_state':
      return 'Implementation, flag, and certification ladder for a feature.';
    case 'certify_feature':
      return 'Draft or return an outcome-level certification spec. Does not run live money missions.';
  }
}

export function callOvieMcpTool(
  store: OperatingStore,
  principal: OvieMcpPrincipal,
  name: string,
  args: Record<string, unknown>
):
  | { ok: true; result: unknown }
  | { ok: false; message: string; status?: 401 | 403 } {
  const authz = authorizeOvieMcpTool(principal, name);
  if (!authz.ok) return authz;

  const turn = bindEveIdentityForTurn(OVIE_MCP_IDENTITY);
  if (isOvieWriteTool(name)) turn.require('ingest-ack');

  switch (name) {
    case 'get_org_state':
      return { ok: true, result: getOrgState(store, args) };
    case 'record_decision':
      return { ok: true, result: recordDecision(store, args) };
    case 'create_initiative':
      return { ok: true, result: createInitiative(store, args) };
    case 'get_initiative':
      return getInitiative(store, args);
    case 'get_feature_state':
      return { ok: true, result: getFeatureState(args) };
    case 'certify_feature':
      return { ok: true, result: certifyFeature(args) };
    default:
      return { ok: false, message: `Unknown tool: ${name}` };
  }
}

function getOrgState(store: OperatingStore, args: Record<string, unknown>) {
  const initiatives = store.listInitiatives();
  const inventory = loadProfileCapabilitiesFromDisk();
  return {
    identity: OVIE_MCP_IDENTITY,
    role: 'founder',
    query: typeof args.query === 'string' ? args.query : '',
    active_initiatives: initiatives.map(item => ({
      id: item.id,
      title: item.handoff.title,
      status: item.status,
    })),
    recent_decisions: store
      .listDecisions()
      .slice(-8)
      .map(item => ({
        id: item.id,
        decided: item.decided,
      })),
    awaiting_tim: initiatives
      .filter(item => item.status === 'blocked')
      .map(item => item.id),
    profile_capabilities: inventory.length,
    note: 'Merged code is not certified. Execution is ack + route, not in-request spawn.',
  };
}

function recordDecision(store: OperatingStore, args: Record<string, unknown>) {
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
  const record = { ...draft, id: sealId('dec', draft) };
  store.putDecision(record);
  return record;
}

function createInitiative(
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
    handoff: parsed,
    lane: classified.lane,
    destination: classified.destination,
    receipts: classified.receipts,
    decisionId: stringOpt(args.decision_id),
    workerSpawned: false as const,
    createdAt: now,
    updatedAt: now,
    evidence: classified.receipts.map(receipt => ({
      kind: 'receipt' as const,
      summary: receipt.ack,
      ref: receipt.destination,
    })),
  };
  const record = { ...draft, id: sealId('ini', draft) };
  store.putInitiative(record);
  return record;
}

function getInitiative(store: OperatingStore, args: Record<string, unknown>) {
  const id = typeof args.id === 'string' ? args.id : '';
  const record = store.getInitiative(id);
  if (!record)
    return { ok: false as const, message: `unknown initiative ${id}` };
  return {
    ok: true as const,
    result: {
      ...record,
      complete: false,
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
  return {
    feature: query,
    executed_live_mission: false,
    money_path_executed: false,
    spec:
      match?.proposedMission ??
      'Draft an outcome-level mission: a real user path must succeed; implementation details are not enough.',
    current_level: match?.certLevel ?? 'discovered',
    inventory: match,
    map: renderArtistProfileInventory(inventory).slice(0, 4000),
  };
}
