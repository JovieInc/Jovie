#!/usr/bin/env node
/**
 * Ownership + agent identity registry check (canon/OWNERSHIP.md).
 *
 * Fails when something that runs has no owner:
 * - a workflow file, CI harness job, ci-fast lane, Mac lane, worker, app or
 *   canon doc on disk with no registry entry;
 * - an active entry whose source is gone (mark it retired instead);
 * - an owner that is a human or an unknown role, or an escalation chain that
 *   does not end at the one human owner of last resort;
 * - an agent role or identity without the fields an auditor needs.
 *
 * - a mesh sender kind with no identity, or a shared/borrowed identity
 *   without a tracked least-privilege fix.
 *
 * Usage: node scripts/ownership-registry.mjs [--report] [--json]
 *        node scripts/ownership-registry.mjs --live [--mesh-as kind | --mesh-file f] [--automation-file f]
 *
 * --live compares the identity registry with the running fleet: the live mesh
 * agent list (`jovie mesh read --json`, read-only) and the automation registry.
 * It never changes mesh tokens or flags.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OWNERSHIP_SCHEMA = 'jovie-ownership-registry/v1';
export const IDENTITY_SCHEMA = 'jovie-agent-identity-registry/v1';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, '..');

const ASSET_KINDS = new Set([
  'repo',
  'service',
  'workflow',
  'ci-lane',
  'runner-pool',
  'linear-team',
  'linear-area',
  'canon-doc',
  'data-store',
  'control-loop',
]);
const STATUSES = new Set(['active', 'retired']);
const IDENTITY_REQUIRED = [
  'name',
  'kind',
  'principals',
  'credentials',
  'allowedActions',
  'boundaries',
  'auditTrail',
  'owner',
];

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function listDir(root, rel, filter = () => true) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(filter)
    .map(entry => entry.name)
    .sort();
}

/** The Mac lanes are the `lane` choice options of mac-lane.yml. */
export function parseMacLanes(source) {
  const match = /lane:\s*\n(?:[^\n]*\n){0,4}?\s*options:\s*\[([^\]]*)\]/u.exec(
    source
  );
  if (!match) return [];
  return match[1]
    .split(',')
    .map(value => value.trim().replace(/^['"]|['"]$/gu, ''))
    .filter(Boolean);
}

/** Sender kinds the mesh client accepts (MESH_KINDS in the jovie CLI). */
export function parseMeshKinds(source) {
  const match = /MESH_KINDS\s*=\s*\[([^\]]*)\]/u.exec(source);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/gu)].map(item => item[1]);
}

/** Every ownable thing the repository itself can enumerate. */
export function discoverAssets(root = DEFAULT_ROOT) {
  const found = [];
  for (const file of listDir(root, '.github/workflows', entry =>
    /\.ya?ml$/u.test(entry.name)
  )) {
    found.push({
      id: `workflow:${file.replace(/\.ya?ml$/u, '')}`,
      kind: 'workflow',
    });
  }
  const harness = readJson(root, '.github/ci-harness/manifest.json');
  for (const job of harness.jobs ?? []) {
    found.push({ id: `ci-lane:harness:${job.id}`, kind: 'ci-lane' });
  }
  const macLane = path.join(root, '.github/workflows/mac-lane.yml');
  if (fs.existsSync(macLane)) {
    for (const lane of parseMacLanes(fs.readFileSync(macLane, 'utf8'))) {
      found.push({ id: `ci-lane:mac:${lane}`, kind: 'ci-lane' });
    }
  }
  for (const app of listDir(root, 'apps', entry => entry.isDirectory())) {
    found.push({ id: `service:app:${app}`, kind: 'service' });
  }
  for (const worker of listDir(root, 'workers', entry => entry.isDirectory())) {
    found.push({ id: `service:worker:${worker}`, kind: 'service' });
  }
  for (const doc of listDir(root, 'canon', entry =>
    /\.md$/u.test(entry.name)
  )) {
    found.push({ id: `canon-doc:${doc}`, kind: 'canon-doc' });
  }
  return found;
}

function chainProblems(label, chain, roles) {
  const problems = [];
  if (!Array.isArray(chain) || chain.length === 0) {
    return [`${label}: escalation chain is empty`];
  }
  chain.forEach((roleId, index) => {
    const role = roles[roleId];
    if (!role) {
      problems.push(`${label}: escalation names unknown role "${roleId}"`);
      return;
    }
    const last = index === chain.length - 1;
    if (role.kind === 'human' && !last) {
      problems.push(
        `${label}: human "${roleId}" may only be the last escalation step`
      );
    }
    if (last && role.kind !== 'human') {
      problems.push(
        `${label}: escalation must end at the human owner of last resort`
      );
    }
  });
  return problems;
}

/** Pure validation over parsed registries; returns problems and coverage. */
export function validateRegistries({
  ownership,
  identities,
  discovered,
  meshKinds = [],
}) {
  const problems = [];
  if (ownership?.schema !== OWNERSHIP_SCHEMA) {
    problems.push(`canon/ownership.json: schema must be ${OWNERSHIP_SCHEMA}`);
  }
  if (identities?.schema !== IDENTITY_SCHEMA) {
    problems.push(
      `canon/agent-identities.json: schema must be ${IDENTITY_SCHEMA}`
    );
  }
  const roles = ownership?.roles ?? {};
  const identityMap = identities?.identities ?? {};
  const humans = Object.entries(roles).filter(
    ([, role]) => role.kind === 'human'
  );
  if (humans.length !== 1) {
    problems.push('roles: exactly one human owner of last resort is allowed');
  }

  for (const [roleId, role] of Object.entries(roles)) {
    if (!['agent', 'human'].includes(role.kind)) {
      problems.push(`role ${roleId}: kind must be agent or human`);
      continue;
    }
    if (!role.name || !role.job) {
      problems.push(`role ${roleId}: name and job are required`);
    }
    if (role.kind === 'agent') {
      if (!role.identity || !identityMap[role.identity]) {
        problems.push(
          `role ${roleId}: identity must name an entry in canon/agent-identities.json`
        );
      }
      problems.push(...chainProblems(`role ${roleId}`, role.escalation, roles));
    }
  }

  const seen = new Set();
  const assets = ownership?.assets ?? [];
  for (const asset of assets) {
    const label = `asset ${asset.id ?? '<missing id>'}`;
    if (!asset.id) problems.push(`${label}: id is required`);
    if (seen.has(asset.id)) problems.push(`${label}: duplicate id`);
    seen.add(asset.id);
    if (!ASSET_KINDS.has(asset.kind)) {
      problems.push(`${label}: unknown kind "${asset.kind}"`);
    }
    if (!STATUSES.has(asset.status ?? 'active')) {
      problems.push(`${label}: status must be active or retired`);
    }
    const owner = roles[asset.owner];
    if (!owner) {
      problems.push(
        `${label}: owner "${asset.owner}" is not a registered role`
      );
    } else if (owner.kind !== 'agent') {
      problems.push(
        `${label}: owner must be an agent role; humans are owners of last resort only`
      );
    }
    if (asset.escalation) {
      problems.push(...chainProblems(label, asset.escalation, roles));
    }
    if (asset.status === 'retired' && !asset.retired) {
      problems.push(`${label}: retired assets record when and why (retired)`);
    }
  }

  const discoveredIds = new Set(discovered.map(item => item.id));
  for (const item of discovered) {
    if (!seen.has(item.id)) {
      problems.push(
        `${item.id}: no owner. Add it to canon/ownership.json with an agent owner.`
      );
    }
  }
  const DISCOVERABLE = /^(workflow|ci-lane|service:(app|worker)|canon-doc):/u;
  for (const asset of assets) {
    if (
      (asset.status ?? 'active') === 'active' &&
      DISCOVERABLE.test(asset.id ?? '') &&
      !discoveredIds.has(asset.id)
    ) {
      problems.push(
        `${asset.id}: registered active but not found in the repository; mark it retired`
      );
    }
  }

  for (const [identityId, identity] of Object.entries(identityMap)) {
    for (const field of IDENTITY_REQUIRED) {
      const value = identity[field];
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        problems.push(`identity ${identityId}: ${field} is required`);
      }
    }
    if (identity.owner && roles[identity.owner]?.kind !== 'agent') {
      problems.push(
        `identity ${identityId}: owner must be an agent role (got "${identity.owner}")`
      );
    }
    for (const credential of identity.credentials ?? []) {
      if (typeof credential !== 'object' || !credential.name) {
        problems.push(`identity ${identityId}: each credential needs a name`);
      } else if ('value' in credential) {
        problems.push(
          `identity ${identityId}: credential ${credential.name} must not carry a value`
        );
      }
    }
    if (
      identity.sharing &&
      !['dedicated', 'shared', 'borrowed'].includes(identity.sharing.status)
    ) {
      problems.push(
        `identity ${identityId}: sharing.status must be dedicated, shared or borrowed`
      );
    }
    if (
      ['shared', 'borrowed'].includes(identity.sharing?.status) &&
      !/^(JOV-\d+|by-design)$/u.test(identity.sharing.fix ?? '')
    ) {
      problems.push(
        `identity ${identityId}: a shared or borrowed identity needs a tracked least-privilege fix (a JOV issue or by-design)`
      );
    }
    if (identity.mesh?.registered && !identity.mesh.senderKind) {
      problems.push(
        `identity ${identityId}: a mesh registration names its senderKind`
      );
    }
  }
  const meshIdentityKinds = new Set(
    Object.values(identityMap)
      .map(identity => identity.mesh?.senderKind)
      .filter(Boolean)
  );
  for (const kind of meshKinds) {
    if (!meshIdentityKinds.has(kind)) {
      problems.push(
        `mesh kind ${kind}: no identity in canon/agent-identities.json declares it`
      );
    }
  }

  const active = assets.filter(
    asset => (asset.status ?? 'active') === 'active'
  );
  const byKind = {};
  for (const asset of assets) {
    const key = asset.kind ?? 'unknown';
    byKind[key] ??= { total: 0, owned: 0, retired: 0 };
    byKind[key].total += 1;
    if (roles[asset.owner]?.kind === 'agent') byKind[key].owned += 1;
    if (asset.status === 'retired') byKind[key].retired += 1;
  }
  const unowned = discovered.filter(item => !seen.has(item.id)).length;
  return {
    problems,
    coverage: {
      registered: assets.length,
      active: active.length,
      owned: assets.filter(asset => roles[asset.owner]?.kind === 'agent')
        .length,
      discovered: discovered.length,
      discoveredUnowned: unowned,
      identities: Object.keys(identityMap).length,
      sharedOrBorrowed: Object.values(identityMap).filter(identity =>
        ['shared', 'borrowed'].includes(identity.sharing?.status)
      ).length,
      byKind,
    },
  };
}

function readMeshKinds(root) {
  const file = path.join(root, 'packages/jovie-cli/src/mesh.ts');
  return fs.existsSync(file)
    ? parseMeshKinds(fs.readFileSync(file, 'utf8'))
    : [];
}

export function checkRepository(root = DEFAULT_ROOT) {
  return validateRegistries({
    ownership: readJson(root, 'canon/ownership.json'),
    identities: readJson(root, 'canon/agent-identities.json'),
    discovered: discoverAssets(root),
    meshKinds: readMeshKinds(root),
  });
}

export const STALE_MESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Agent names an automation registry entry runs as (format-tolerant). */
function automationAgent(entry) {
  return entry.identity ?? entry.agent ?? entry.actor ?? entry.runsAs ?? null;
}

/**
 * Live drift between the registry and the running fleet. `liveMesh` is the
 * `agents` array of a mesh mailbox read; `automations` is the automation
 * registry's entry list. Pure: callers fetch.
 */
export function compareLiveFleet({ identities, liveMesh, automations, now }) {
  const drift = [];
  const identityMap = identities?.identities ?? {};
  const byKind = new Map(
    Object.entries(identityMap)
      .filter(([, identity]) => identity.mesh?.senderKind)
      .map(([id, identity]) => [identity.mesh.senderKind, { id, identity }])
  );
  if (liveMesh) {
    const liveKinds = new Set(liveMesh.map(agent => agent.senderKind));
    for (const agent of liveMesh) {
      const known = byKind.get(agent.senderKind);
      if (!known || !known.identity.mesh.registered) {
        drift.push({
          kind: 'unregistered-running',
          subject: `mesh:${agent.senderKind}`,
          detail:
            'live on the mesh but not registered in canon/agent-identities.json',
        });
        continue;
      }
      const seen = agent.lastSeenAt ? Date.parse(agent.lastSeenAt) : Number.NaN;
      if (!Number.isFinite(seen) || now.getTime() - seen > STALE_MESH_MS) {
        drift.push({
          kind: 'registered-dead',
          subject: `mesh:${agent.senderKind}`,
          detail: agent.lastSeenAt
            ? `last seen ${agent.lastSeenAt}, over 7 days ago`
            : 'registered but never seen',
        });
      }
    }
    for (const [kind, { id, identity }] of byKind) {
      if (
        identity.mesh.registered &&
        kind !== 'summer' &&
        !liveKinds.has(kind)
      ) {
        drift.push({
          kind: 'registry-stale',
          subject: `identity:${id}`,
          detail: `registry says mesh kind ${kind} is registered; the live mesh does not list it`,
        });
      }
    }
  }
  for (const entry of automations ?? []) {
    const agent = automationAgent(entry);
    if (!agent) {
      drift.push({
        kind: 'automation-unattributed',
        subject: `automation:${entry.id ?? '<unknown>'}`,
        detail: 'automation entry names no identity it runs as',
      });
    } else if (!identityMap[agent]) {
      drift.push({
        kind: 'unregistered-running',
        subject: `automation:${entry.id ?? '<unknown>'}`,
        detail: `runs as ${agent}, which canon/agent-identities.json does not list`,
      });
    } else if (['retired', 'disabled'].includes(identityMap[agent].status)) {
      drift.push({
        kind: 'retired-running',
        subject: `automation:${entry.id ?? '<unknown>'}`,
        detail: `runs as ${agent}, which the registry marks ${identityMap[agent].status}`,
      });
    }
  }
  return drift;
}

function readLiveMesh(argv) {
  const file = flagValue(argv, '--mesh-file');
  const raw = file
    ? fs.readFileSync(file, 'utf8')
    : execFileSync(
        'jovie',
        [
          'mesh',
          'read',
          '--as',
          flagValue(argv, '--mesh-as') ??
            process.env.JOVIE_MESH_SENDER_KIND ??
            'claude',
          '--json',
        ],
        {
          encoding: 'utf8',
          timeout: 30_000,
        }
      );
  return JSON.parse(raw).agents ?? [];
}

function readAutomations(argv) {
  const file = flagValue(argv, '--automation-file');
  if (!file) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed)
    ? parsed
    : (parsed.automations ?? parsed.entries ?? []);
}

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function live(argv) {
  const drift = compareLiveFleet({
    identities: readJson(DEFAULT_ROOT, 'canon/agent-identities.json'),
    liveMesh: readLiveMesh(argv),
    automations: readAutomations(argv),
    now: new Date(),
  });
  process.stdout.write(`${JSON.stringify({ drift }, null, 2)}\n`);
  return drift.length === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--live')) return live(argv);
  const result = checkRepository();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const { coverage } = result;
    if (argv.includes('--report')) {
      for (const [kind, counts] of Object.entries(coverage.byKind).sort()) {
        process.stdout.write(
          `${kind.padEnd(14)} owned ${counts.owned}/${counts.total}` +
            (counts.retired ? ` (retired ${counts.retired})` : '') +
            '\n'
        );
      }
    }
    process.stdout.write(
      `ownership: ${coverage.owned}/${coverage.registered} assets agent-owned; ` +
        `${coverage.discovered - coverage.discoveredUnowned}/${coverage.discovered} discovered assets registered; ` +
        `${coverage.identities} identities (${coverage.sharedOrBorrowed} shared/borrowed)\n`
    );
    for (const problem of result.problems) {
      process.stderr.write(`::error::${problem}\n`);
    }
  }
  return result.problems.length === 0 ? 0 : 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
