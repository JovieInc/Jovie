/**
 * Fleet registry: pure validation for ops/registry/fleet.json.
 * Joins by id to canon/agent-identities.json and ops/registry/capacity.json.
 * Metadata only. Runtime state (assignment, heartbeat, utilization) is
 * derived by Summer (summer-config agent/lib/agent-fleet.ts), never stored here.
 */
export const SCHEMA = 'jovie.fleet-registry/v1';
export const ROUTE_KINDS = [
  'mesh',
  'hyperagent-mcp',
  'gem-lanes',
  'jovie-fleet-lease',
  'cursor-cli',
  'slack',
  'imessage',
  'none',
];
export const TOS_VERDICTS = [
  'allowed',
  'allowed-by-design',
  'conditional',
  'restricted',
  'forbidden',
  'unverified',
];
export const DISPATCHABLE_VERDICTS = [
  'allowed',
  'allowed-by-design',
  'conditional',
];
export const VERIFIED_LEVELS = ['unverified', 'config', 'observed'];
export const RESULT_KINDS = [
  'findings',
  'review',
  'drafts',
  'proposals',
  'brief',
];

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const SECRET =
  /sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9]{20,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/i;

export function validateFleetRegistry(
  registry,
  { identities = {}, providerIds = [] } = {}
) {
  if (!isObject(registry) || registry.schema !== SCHEMA)
    return [`schema must be ${SCHEMA}`];
  const errors = [];
  const t = registry.thresholds ?? {};
  for (const k of [
    'idleAlarmMinutes',
    'utilizationWindowHours',
    'meshHeartbeatStaleMinutes',
    'perTaskDefaultMaxMinutes',
  ]) {
    if (!Number.isFinite(t[k]) || t[k] <= 0)
      errors.push(`thresholds.${k} must be a positive number`);
  }
  const workloads = new Map();
  for (const w of registry.workloads ?? []) {
    if (!w?.id || workloads.has(w.id))
      errors.push(`workload ${w?.id ?? '?'}: id missing or duplicated`);
    workloads.set(w?.id, w);
    if (!RESULT_KINDS.includes(w?.result))
      errors.push(`workload ${w?.id}: result ${w?.result} unknown`);
    if (!Number.isFinite(w?.maxMinutes) || w.maxMinutes <= 0)
      errors.push(`workload ${w?.id}: maxMinutes required`);
    if (w?.outbound && !w.draftOnly)
      errors.push(
        `workload ${w.id}: outbound work must be draftOnly (real sends need Tim's approval)`
      );
  }
  const seen = new Set();
  const identityKeys = new Set(Object.keys(identities));
  const providers = new Set(providerIds);
  for (const a of registry.agents ?? []) {
    const where = `agent ${a?.id ?? '?'}`;
    if (!a?.id || seen.has(a.id))
      errors.push(`${where}: id missing or duplicated`);
    seen.add(a?.id);
    const identity = identities[a?.identityId];
    if (a?.identityId === null && a?.kind === 'local-proxy') {
      /* host services have no mesh identity */
    } else if (identityKeys.size && !identity)
      errors.push(
        `${where}: identityId ${a?.identityId} not in agent-identities`
      );
    if (
      a?.capacityProviderId &&
      providers.size &&
      !providers.has(a.capacityProviderId)
    )
      errors.push(
        `${where}: capacityProviderId ${a.capacityProviderId} not in capacity providers`
      );
    if (!ROUTE_KINDS.includes(a?.route?.kind))
      errors.push(`${where}: route.kind ${a?.route?.kind} unknown`);
    if (a?.route?.kind === 'mesh') {
      if (!a.route.senderKind)
        errors.push(`${where}: mesh route needs senderKind`);
      else if (
        identity?.mesh?.senderKind &&
        identity.mesh.senderKind !== a.route.senderKind
      )
        errors.push(
          `${where}: route.senderKind ${a.route.senderKind} differs from identity mesh.senderKind ${identity.mesh.senderKind}`
        );
    }
    if (!TOS_VERDICTS.includes(a?.tos?.verdict))
      errors.push(`${where}: tos.verdict ${a?.tos?.verdict} unknown`);
    if (!a?.tos?.basis) errors.push(`${where}: tos.basis required`);
    if (a?.tos?.verdict === 'conditional' && !a.tos.condition)
      errors.push(`${where}: conditional verdict needs tos.condition`);
    if (a?.tos?.verdict === 'allowed' && !a.tos.checkedAt)
      errors.push(
        `${where}: allowed verdict needs tos.checkedAt (a read primary source)`
      );
    if (!VERIFIED_LEVELS.includes(a?.verified?.level))
      errors.push(`${where}: verified.level unknown`);
    if (
      a?.verified?.level === 'observed' &&
      (!a.verified.evidence || !a.verified.asOf)
    )
      errors.push(`${where}: observed needs evidence and asOf`);
    if (![true, false, 'unknown'].includes(a?.box?.has))
      errors.push(`${where}: box.has must be true, false or "unknown"`);
    const standing = a?.standingWorkloads ?? [];
    for (const id of standing)
      if (!workloads.has(id))
        errors.push(`${where}: standing workload ${id} not defined`);
    if (standing.length) {
      if (
        !DISPATCHABLE_VERDICTS.includes(a.tos?.verdict) &&
        a.tos?.verdict !== 'unverified'
      )
        errors.push(
          `${where}: ${a.tos?.verdict} agents cannot carry standing workloads`
        );
      if (a.route?.kind === 'none' || a.route?.kind === 'gem-lanes')
        errors.push(
          `${where}: route ${a.route.kind} cannot be dispatched by Summer`
        );
      if (['disabled', 'retired'].includes(a.status))
        errors.push(
          `${where}: ${a.status} agents cannot carry standing workloads`
        );
      const caps = new Set(a.capabilities ?? []);
      for (const id of standing)
        for (const need of workloads.get(id)?.needs ?? [])
          if (!caps.has(need))
            errors.push(`${where}: workload ${id} needs capability ${need}`);
    }
  }
  if (SECRET.test(JSON.stringify(registry)))
    errors.push('registry must not contain secrets or addresses');
  return errors;
}
