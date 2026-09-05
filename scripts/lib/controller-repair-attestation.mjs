import { createHash } from 'node:crypto';

export const CONTROLLER_REPAIR_ATTESTATION_SCHEMA =
  'jovie-controller-repair-attestation/v1';
export const CONTROLLER_REPAIR_ATTESTATION_MARKER =
  '<!-- jovie-controller-repair-attestation/v1 -->';
export const CONTROLLER_REPAIR_ATTESTATION_ACTOR = 'jovie-bot[bot]';

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;
const OPERATION_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;
const MAX_LIFETIME_MS = 15 * 60_000;
const CLOCK_SKEW_MS = 60_000;
const EXACT_KEYS = [
  'changedPathsSha256',
  'condition',
  'deploymentsAllowed',
  'expiresAt',
  'head',
  'issuedAt',
  'kind',
  'mainSha',
  'operationId',
  'pr',
  'repository',
  'reviewAuthority',
  'reviewId',
  'reviewedHead',
  'runtimeActivationAllowed',
  'schema',
];

function exactKeys(candidate) {
  return (
    JSON.stringify(Object.keys(candidate).sort()) === JSON.stringify(EXACT_KEYS)
  );
}

export function hashControllerRepairPaths(paths) {
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.some(path => typeof path !== 'string' || path.length === 0)
  ) {
    throw new Error('paths must be a non-empty string array');
  }
  const normalized = [...new Set(paths)].sort();
  if (normalized.length !== paths.length) {
    throw new Error('paths must not contain duplicates');
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function validateControllerRepairAttestation(
  candidate,
  now = Date.now()
) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      ok: false,
      errors: ['attestation must be an object'],
      attestation: null,
    };
  }
  if (!exactKeys(candidate)) errors.push('attestation keys must match schema');
  if (candidate.schema !== CONTROLLER_REPAIR_ATTESTATION_SCHEMA) {
    errors.push(`schema must be ${CONTROLLER_REPAIR_ATTESTATION_SCHEMA}`);
  }
  if (candidate.kind !== 'controller-runtime-repair') {
    errors.push('kind must be controller-runtime-repair');
  }
  if (candidate.condition !== 'controller-failure') {
    errors.push('condition must be controller-failure');
  }
  if (
    typeof candidate.repository !== 'string' ||
    !REPOSITORY.test(candidate.repository)
  ) {
    errors.push('repository must be owner/name');
  }
  if (!Number.isInteger(candidate.pr) || candidate.pr < 1) {
    errors.push('pr must be a positive integer');
  }
  if (typeof candidate.head !== 'string' || !SHA.test(candidate.head)) {
    errors.push('head must be an exact lowercase SHA');
  }
  if (typeof candidate.mainSha !== 'string' || !SHA.test(candidate.mainSha)) {
    errors.push('mainSha must be an exact lowercase SHA');
  }
  if (candidate.reviewAuthority !== 'independent-llm-review') {
    errors.push('reviewAuthority must be independent-llm-review');
  }
  if (
    typeof candidate.reviewId !== 'string' ||
    !OPERATION_ID.test(candidate.reviewId)
  ) {
    errors.push('reviewId must be a bounded lowercase review id');
  }
  if (
    typeof candidate.reviewedHead !== 'string' ||
    !SHA.test(candidate.reviewedHead) ||
    candidate.reviewedHead !== candidate.head
  ) {
    errors.push('reviewedHead must equal the exact attested head');
  }
  if (
    typeof candidate.changedPathsSha256 !== 'string' ||
    !SHA256.test(candidate.changedPathsSha256)
  ) {
    errors.push('changedPathsSha256 must be a lowercase SHA-256 digest');
  }
  if (
    typeof candidate.operationId !== 'string' ||
    !OPERATION_ID.test(candidate.operationId)
  ) {
    errors.push('operationId must be a bounded lowercase operation id');
  }
  const issued = Date.parse(String(candidate.issuedAt ?? ''));
  const expires = Date.parse(String(candidate.expiresAt ?? ''));
  if (!Number.isFinite(issued))
    errors.push('issuedAt must be an ISO timestamp');
  if (!Number.isFinite(expires))
    errors.push('expiresAt must be an ISO timestamp');
  if (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    (expires <= issued || expires - issued > MAX_LIFETIME_MS)
  ) {
    errors.push('attestation lifetime must be positive and at most 15 minutes');
  }
  if (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    (now < issued - CLOCK_SKEW_MS || now > expires)
  ) {
    errors.push('attestation is not currently valid');
  }
  if (candidate.deploymentsAllowed !== false) {
    errors.push('deploymentsAllowed must be false');
  }
  if (candidate.runtimeActivationAllowed !== false) {
    errors.push('runtimeActivationAllowed must be false');
  }
  if (errors.length) return { ok: false, errors, attestation: null };
  return {
    ok: true,
    errors: [],
    attestation: {
      ...candidate,
      issuedAt: new Date(issued).toISOString(),
      expiresAt: new Date(expires).toISOString(),
    },
  };
}

export function renderControllerRepairAttestation(input, now = Date.now()) {
  const { ok, errors, attestation } = validateControllerRepairAttestation(
    input,
    now
  );
  if (!ok) throw new Error(errors.join('; '));
  return `${CONTROLLER_REPAIR_ATTESTATION_MARKER}\n## Controller repair admission\n\n\`\`\`json\n${JSON.stringify(attestation, null, 2)}\n\`\`\`\n\nSingle-attempt exact-head source-repair lease only. Operator holds, required source and merge checks, deployment, and runtime activation remain authoritative and forbidden where applicable.`;
}

export function extractControllerRepairAttestation(body, now = Date.now()) {
  if (typeof body !== 'string') return null;
  const markerAt = body.lastIndexOf(CONTROLLER_REPAIR_ATTESTATION_MARKER);
  if (markerAt < 0) return null;
  const afterMarker = body.slice(
    markerAt + CONTROLLER_REPAIR_ATTESTATION_MARKER.length
  );
  const match = afterMarker.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const result = validateControllerRepairAttestation(
      JSON.parse(match[1]),
      now
    );
    return result.ok ? result.attestation : null;
  } catch {
    return null;
  }
}

export function attestationMatchesControllerRepair(
  body,
  {
    repository,
    pr,
    head,
    mainSha,
    changedPathsSha256,
    operationId,
    minimumValidForMs = 0,
    now = Date.now(),
  }
) {
  const attestation = extractControllerRepairAttestation(body, now);
  return Boolean(
    attestation &&
      Number.isSafeInteger(minimumValidForMs) &&
      minimumValidForMs >= 0 &&
      Date.parse(attestation.expiresAt) - now >= minimumValidForMs &&
      attestation.repository === repository &&
      attestation.pr === pr &&
      attestation.head === head &&
      attestation.mainSha === mainSha &&
      attestation.changedPathsSha256 === changedPathsSha256 &&
      attestation.operationId === operationId
  );
}

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    result[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === 'paths-hash') {
    process.stdout.write(
      `${hashControllerRepairPaths(JSON.parse(await stdin()))}\n`
    );
    return 0;
  }
  if (command === 'extract') {
    const attestation = extractControllerRepairAttestation(await stdin());
    if (!attestation) return 3;
    process.stdout.write(`${JSON.stringify(attestation)}\n`);
    return 0;
  }
  if (command === 'matches') {
    const matches = attestationMatchesControllerRepair(await stdin(), {
      repository: args.repository,
      pr: Number(args.pr),
      head: args.head,
      mainSha: args['main-sha'],
      changedPathsSha256: args['changed-paths-sha256'],
      operationId: args['operation-id'],
      minimumValidForMs: Number(args['minimum-valid-for-ms'] ?? 0),
    });
    process.stdout.write(`${JSON.stringify({ allowed: matches })}\n`);
    return matches ? 0 : 3;
  }
  if (command === 'render') {
    const issued = Date.parse(args['issued-at'] ?? new Date().toISOString());
    const expires =
      args['expires-at'] ?? new Date(issued + 10 * 60_000).toISOString();
    process.stdout.write(
      `${renderControllerRepairAttestation({
        schema: CONTROLLER_REPAIR_ATTESTATION_SCHEMA,
        kind: 'controller-runtime-repair',
        condition: 'controller-failure',
        repository: args.repository,
        pr: Number(args.pr),
        head: args.head,
        mainSha: args['main-sha'],
        reviewAuthority: 'independent-llm-review',
        reviewId: args['review-id'],
        reviewedHead: args.head,
        changedPathsSha256: args['changed-paths-sha256'],
        operationId: args['operation-id'],
        issuedAt: new Date(issued).toISOString(),
        expiresAt: expires,
        deploymentsAllowed: false,
        runtimeActivationAllowed: false,
      })}\n`
    );
    return 0;
  }
  throw new Error(
    'Usage: controller-repair-attestation.mjs <paths-hash|extract|matches|render>'
  );
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli()
    .then(code => (process.exitCode = code))
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
