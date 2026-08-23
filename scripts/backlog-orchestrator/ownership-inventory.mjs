/** Repository-aware ownership inventory for JOV-5278 slice 1. JOV-INV-007. */

import { readFileSync } from 'node:fs';

export const OWNERSHIP_INVENTORY_SCHEMA = 'jovie-ownership-inventory/v1';
export const OWNERSHIP_INVENTORY_PATH = new URL(
  './ownership-inventory.json',
  import.meta.url
);
export const ADMISSION_TARGET_FIELDS = Object.freeze([
  'target_system',
  'target_repo',
  'artifact',
  'verification_authority',
]);
export const JOVIE_EXECUTION_REPO = 'JovieInc/Jovie';
export const LOGYOURBODY_EXECUTION_REPO = 'JovieInc/LogYourBody';
const CONTROL_PLANE_PREFIXES = [
  '.github/workflows/',
  'canon/',
  'scripts/backlog-orchestrator/',
  'scripts/hermes/',
];

const WORK_SECTION_NAMES = [
  'Proposed fix',
  'Implementation plan',
  'Scope',
  'Execution',
  'Follow-up',
  'Acceptance',
  'Acceptance criteria',
  'Target',
];
const ADMISSION_POLICIES = new Set([
  'allow',
  'adapter-only',
  'allow-until-rehome',
  'reject',
]);
const BEHAVIOR_OWNER_SYSTEMS = Object.freeze([
  'summer-runtime-policy',
  'company-canon',
  'runtime-ledger',
  'cross-repo-shipping',
]);
const PATH_PATTERN =
  /\b(?:apps|packages|scripts|canon|docs|content|\.github|lib)\/[A-Za-z0-9._\-\/]*/g;
const REPO_PATTERN = /\bJovieInc\/(?:Jovie|Ops|summer-config|LogYourBody)\b/g;

let cachedInventory = null;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sectionHeader(line) {
  const markdown = /^#{2,3}\s+(.+?)\s*$/.exec(line);
  if (markdown) return { name: markdown[1].trim(), inline: '' };
  const bold = /^\s*\*\*([^*]+?)\*\*\s*(?:[—:-]\s*)?(.*)$/.exec(line);
  return bold
    ? { name: bold[1].replace(/:\s*$/, '').trim(), inline: bold[2].trim() }
    : null;
}

function section(description, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const lines = String(description || '').split('\n');
  const start = lines.findIndex(line => {
    const header = sectionHeader(line);
    return header && wanted.has(header.name.toLowerCase());
  });
  if (start < 0) return '';
  const end = lines.findIndex(
    (line, index) => index > start && sectionHeader(line)
  );
  return [
    sectionHeader(lines[start])?.inline,
    ...lines.slice(start + 1, end < 0 ? undefined : end),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function teamKey(issue) {
  const key =
    issue?.team?.key ||
    /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(issue?.identifier || '')?.[1] ||
    '';
  return String(key).toUpperCase();
}

function artifactMatches(prefix, path) {
  return Boolean(
    prefix && path && (path === prefix || path.startsWith(prefix))
  );
}

function longestMatch(paths, prefixes) {
  let winner = null;
  for (const path of paths) {
    for (const prefix of prefixes) {
      if (
        artifactMatches(prefix, path) &&
        (!winner || prefix.length > winner.prefix.length)
      )
        winner = { path, prefix };
    }
  }
  return winner;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(nonEmptyString))];
}

export function admissionTargetPacket(value) {
  if (!value || typeof value !== 'object') return null;
  const packet = {
    target_system: String(value.target_system || '').trim(),
    target_repo: String(value.target_repo || '').trim(),
    artifact: String(value.artifact || '').trim(),
    verification_authority: String(value.verification_authority || '').trim(),
  };
  if (ADMISSION_TARGET_FIELDS.some(field => !packet[field])) return null;
  return {
    ...packet,
    collision_domains: collisionDomainsForTarget(packet),
  };
}

export function collisionDomainsForTarget(target) {
  const repo = String(target?.target_repo || '').trim();
  const artifact = String(target?.artifact || '')
    .trim()
    .replace(/\/$/, '');
  if (!repo || !artifact) return [];
  const segments = artifact.split('/').filter(Boolean);
  const surface =
    segments.length > 1 ? segments.slice(0, 2).join('/') : artifact;
  const domains = [`artifact:${repo}:${surface}`];
  if (
    CONTROL_PLANE_PREFIXES.some(prefix => artifactMatches(prefix, artifact))
  ) {
    domains.push(`risk:${repo}:control-plane`);
  }
  if (/\b(?:drizzle\/migrations|migration|schema)\b/i.test(artifact)) {
    domains.push(`risk:${repo}:database-schema`);
  }
  return domains.sort();
}

export function admissionTargetsCollide(left, right) {
  const leftDomains = new Set(
    left?.collision_domains || collisionDomainsForTarget(left)
  );
  return (right?.collision_domains || collisionDomainsForTarget(right)).some(
    domain => leftDomains.has(domain)
  );
}

export function sameAdmissionTarget(left, right) {
  const a = admissionTargetPacket(left);
  const b = admissionTargetPacket(right);
  if (!a || !b) return false;
  return ADMISSION_TARGET_FIELDS.every(field => a[field] === b[field]);
}

function validateInventory(inventory) {
  const systems = inventory?.systems;
  if (
    inventory?.schema !== OWNERSHIP_INVENTORY_SCHEMA ||
    !inventory.repos ||
    !Array.isArray(systems) ||
    systems.length === 0
  )
    throw new Error('ownership-inventory-invalid');
  const ids = new Set();
  for (const system of systems) {
    if (
      !nonEmptyString(system?.id) ||
      ids.has(system.id) ||
      !inventory.repos[system.intended_repo] ||
      !inventory.repos[system.current_repo] ||
      !nonEmptyString(system.owner) ||
      !ADMISSION_POLICIES.has(system.jovie_admission)
    )
      throw new Error(`ownership-inventory-invalid:${system?.id}`);
    ids.add(system.id);
  }
  for (const required of BEHAVIOR_OWNER_SYSTEMS) {
    if (!ids.has(required))
      throw new Error(`ownership-inventory-missing-behavior:${required}`);
  }
  return inventory;
}

export function loadOwnershipInventory() {
  if (cachedInventory) return cachedInventory;
  const parsed = JSON.parse(readFileSync(OWNERSHIP_INVENTORY_PATH, 'utf8'));
  cachedInventory = Object.freeze(validateInventory(parsed));
  return cachedInventory;
}

export function normalizeSystem(system, inventory = loadOwnershipInventory()) {
  const adapterSet = system.adapter_set
    ? inventory.adapter_sets?.[system.adapter_set] || []
    : [];
  return {
    ...system,
    target_system: system.target_system || system.id,
    current_artifacts: system.current_artifacts || [],
    adapter_artifacts: [...(system.adapter_artifacts || []), ...adapterSet],
    keywords: system.keywords || [],
    later_slice: system.later_slice ?? null,
  };
}

export function systemById(id, inventory = loadOwnershipInventory()) {
  const system = inventory.systems.find(item => item.id === id) || null;
  return system ? normalizeSystem(system, inventory) : null;
}

export function authoritativeBehaviorOwners(
  inventory = loadOwnershipInventory()
) {
  return Object.fromEntries(
    BEHAVIOR_OWNER_SYSTEMS.map(id => {
      const system = systemById(id, inventory);
      return [
        id,
        {
          owner: system.owner,
          intended_repo: system.intended_repo,
          verification_authority: system.verification_authority,
        },
      ];
    })
  );
}

export function workTextForAdmission(issue) {
  const description = issue?.description || '';
  const named = section(description, ['Target']);
  const work = WORK_SECTION_NAMES.filter(name => name !== 'Target')
    .map(name => section(description, [name]))
    .filter(Boolean)
    .join('\n');
  return [issue?.title || '', named, work].filter(Boolean).join('\n').trim();
}

export function extractWorkPaths(text) {
  return uniqueStrings(
    (String(text || '').match(PATH_PATTERN) || []).map(value =>
      value.replace(/[,.;:]+$/, '')
    )
  );
}

export function extractWorkRepos(text) {
  return uniqueStrings(String(text || '').match(REPO_PATTERN) || []);
}

export function parseNamedAdmissionTarget(issue) {
  const body = section(issue?.description, ['Target']);
  if (!body) return null;
  const fields = {};
  for (const field of ADMISSION_TARGET_FIELDS) {
    const match = new RegExp(
      `(?:^|\\n)\\s*(?:[-*]\\s*)?${field}\\s*[:=]\\s*(.+?)\\s*$`,
      'im'
    ).exec(body);
    if (match) fields[field] = match[1].trim().replace(/^[`"]|[`"]$/g, '');
  }
  return admissionTargetPacket(fields);
}

function packetForSystem(system, artifact) {
  const jovieExecutable =
    system.jovie_admission === 'allow' ||
    system.jovie_admission === 'allow-until-rehome' ||
    (system.jovie_admission === 'adapter-only' &&
      (system.adapter_artifacts || []).some(prefix =>
        artifactMatches(prefix, artifact)
      ));
  return admissionTargetPacket({
    target_system: system.target_system,
    target_repo: jovieExecutable ? system.current_repo : system.intended_repo,
    artifact: artifact || system.default_artifact,
    verification_authority: system.verification_authority,
  });
}

function canAdmitToJovie(system, artifact) {
  if (system.jovie_admission === 'allow') return true;
  if (system.jovie_admission === 'allow-until-rehome') {
    return system.current_repo === JOVIE_EXECUTION_REPO;
  }
  if (system.jovie_admission === 'adapter-only') {
    return (system.adapter_artifacts || []).some(prefix =>
      artifactMatches(prefix, artifact)
    );
  }
  return false;
}

function matchSystems(inventory, { paths, repos, text }) {
  const matches = [];
  for (const raw of inventory.systems) {
    const system = normalizeSystem(raw, inventory);
    const prefixes = [
      ...(system.current_artifacts || []),
      ...(system.adapter_artifacts || []),
    ];
    const pathHit = longestMatch(paths, prefixes);
    const repoHit =
      repos.includes(system.intended_repo) ||
      repos.includes(system.current_repo);
    const keywordHit = (system.keywords || []).some(keyword =>
      text.toLowerCase().includes(String(keyword).toLowerCase())
    );
    if (!pathHit && !repoHit && !keywordHit) continue;
    matches.push({
      system,
      artifact: pathHit?.path || system.default_artifact,
      pathLength: pathHit?.prefix.length || 0,
    });
  }
  return matches.sort((a, b) => b.pathLength - a.pathLength);
}

function defaultSystemForIssue(issue, inventory) {
  const key = teamKey(issue);
  if (key === 'LYB') return systemById('logyourbody-product', inventory);
  if (key === 'JOV') return systemById('jovie-product', inventory);
  return null;
}

function admit(target) {
  return { decision: 'admit', reason: null, target };
}

function reroute(target, reason = 'no-jovie-artifact') {
  return { decision: 'reroute', reason, target, reroute: target };
}

function reject(reason, target = null) {
  return { decision: 'reject', reason, target };
}

export function resolveAdmissionTarget(
  issue,
  inventory = loadOwnershipInventory()
) {
  const named = parseNamedAdmissionTarget(issue);
  const text = workTextForAdmission(issue);
  const paths = extractWorkPaths(text);
  const repos = extractWorkRepos(text);
  const matches = matchSystems(inventory, { paths, repos, text });
  const key = teamKey(issue);

  if (named) {
    const system = systemById(named.target_system, inventory);
    if (!system) return reject('named-target-unknown-system', named);
    if (
      key === 'LYB' &&
      named.target_repo === LOGYOURBODY_EXECUTION_REPO &&
      named.target_system === 'logyourbody-product'
    )
      return admit(named);
    if (
      named.target_repo === JOVIE_EXECUTION_REPO &&
      canAdmitToJovie(system, named.artifact) &&
      named.verification_authority === system.verification_authority
    )
      return admit(named);
    if (named.target_repo !== JOVIE_EXECUTION_REPO) return reroute(named);
    return reject('named-target-invalid', named);
  }

  if (key === 'LYB') {
    const lyb =
      matches.find(
        ({ system }) => system.current_repo === LOGYOURBODY_EXECUTION_REPO
      )?.system || defaultSystemForIssue(issue, inventory);
    return admit(packetForSystem(lyb, paths[0] || lyb.default_artifact));
  }

  const jovieMatch = matches.find(({ system, artifact }) =>
    canAdmitToJovie(system, artifact)
  );
  if (jovieMatch) {
    const target = packetForSystem(jovieMatch.system, jovieMatch.artifact);
    return target.target_repo === JOVIE_EXECUTION_REPO
      ? admit(target)
      : reroute(target);
  }
  const foreign = matches.find(
    ({ system, artifact }) => !canAdmitToJovie(system, artifact)
  );
  if (foreign) {
    return reroute(packetForSystem(foreign.system, foreign.artifact));
  }
  const fallback = defaultSystemForIssue(issue, inventory);
  if (!fallback) return reject('unresolved-target');
  return admit(
    packetForSystem(fallback, paths[0] || fallback.default_artifact)
  );
}
