/**
 * Exact-head evidence for the single repair PR that may be admitted while
 * production is green but not bound to current main. This is intentionally a
 * narrow routing exception: it never authorizes a deployment or an ordinary
 * PR, and the queue controller still verifies all current source checks and
 * hard holds before enrollment.
 */

export const PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA =
  'jovie-production-unbound-repair-attestation/v1';
export const PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER =
  '<!-- jovie-production-unbound-repair-attestation/v1 -->';

const SHA = /^[0-9a-f]{40}$/;

function exactSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

export function validateProductionUnboundRepairAttestation(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      ok: false,
      errors: ['attestation must be an object'],
      attestation: null,
    };
  }
  if (candidate.schema !== PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA) {
    errors.push(
      `schema must be ${PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA}`
    );
  }
  if (candidate.kind !== 'production-release-repair') {
    errors.push('kind must be production-release-repair');
  }
  if (candidate.condition !== 'production-deployment-unbound') {
    errors.push('condition must be production-deployment-unbound');
  }
  if (!Number.isInteger(candidate.pr) || candidate.pr < 1) {
    errors.push('pr must be a positive integer');
  }
  if (!exactSha(candidate.head))
    errors.push('head must be an exact lowercase SHA');
  if (!exactSha(candidate.mainSha))
    errors.push('mainSha must be an exact lowercase SHA');
  if (candidate.deploymentsAllowed !== false) {
    errors.push('deploymentsAllowed must be false');
  }
  if (errors.length) return { ok: false, errors, attestation: null };
  return {
    ok: true,
    errors: [],
    attestation: {
      schema: PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA,
      kind: candidate.kind,
      condition: candidate.condition,
      pr: candidate.pr,
      head: candidate.head,
      mainSha: candidate.mainSha,
      deploymentsAllowed: false,
    },
  };
}

export function renderProductionUnboundRepairAttestation(input) {
  const { ok, errors, attestation } =
    validateProductionUnboundRepairAttestation(input);
  if (!ok) throw new Error(errors.join('; '));
  return `${PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER}\n## Production-unbound repair admission\n\n\`\`\`json\n${JSON.stringify(attestation, null, 2)}\n\`\`\`\n\nExact-head repair-only admission; no deployment authority.`;
}

export function extractProductionUnboundRepairAttestation(body) {
  if (
    typeof body !== 'string' ||
    !body.includes(PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER)
  ) {
    return null;
  }
  const markerAt = body.indexOf(PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER);
  const afterMarker = body.slice(
    markerAt + PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER.length
  );
  const match = afterMarker.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const result = validateProductionUnboundRepairAttestation(
      JSON.parse(match[1])
    );
    return result.ok ? result.attestation : null;
  } catch {
    return null;
  }
}

export function attestationMatchesRepairScope(body, { pr, head, mainSha }) {
  const attestation = extractProductionUnboundRepairAttestation(body);
  return Boolean(
    attestation &&
      attestation.pr === pr &&
      attestation.head === head &&
      attestation.mainSha === mainSha
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
  if (command === 'extract') {
    const attestation = extractProductionUnboundRepairAttestation(
      await stdin()
    );
    if (!attestation) return 3;
    process.stdout.write(`${JSON.stringify(attestation)}\n`);
    return 0;
  }
  if (command === 'matches') {
    const matches = attestationMatchesRepairScope(await stdin(), {
      pr: Number(args.pr),
      head: args.head,
      mainSha: args['main-sha'],
    });
    process.stdout.write(`${JSON.stringify({ allowed: matches })}\n`);
    return matches ? 0 : 3;
  }
  if (command === 'render') {
    process.stdout.write(
      `${renderProductionUnboundRepairAttestation({
        schema: PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA,
        kind: 'production-release-repair',
        condition: 'production-deployment-unbound',
        pr: Number(args.pr),
        head: args.head,
        mainSha: args['main-sha'],
        deploymentsAllowed: false,
      })}\n`
    );
    return 0;
  }
  throw new Error(
    'Usage: production-unbound-repair-attestation.mjs <extract|matches|render>'
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
