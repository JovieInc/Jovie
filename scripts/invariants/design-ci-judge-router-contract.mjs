/**
 * JOV-INV-040: Design CI batch judge router (JOV-6944).
 *
 * The router that owns this invariant is TypeScript under
 * apps/web/scripts/ — it must import the marketing/app-screen TS
 * registries and the certification adapter, so it cannot be a plain
 * scripts/invariants/*.mjs module the way most invariants are, and it
 * cannot be composed into validate.mjs the way a normal validator
 * function is. This file is the structural wiring check that DOES run
 * from plain node inside `pnpm invariants:check`: it proves the router,
 * its persistence adapter, its evidence route, and its CLI entrypoint
 * still exist and are still wired to this invariant id and to the real
 * `jovie.certification/v1` registry namespace — not a re-execution of the
 * TS routing/evaluation logic itself, which runs under
 * `pnpm design-ci:judge-matrix` and is proven by the .ts test suites.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESIGN_CI_JUDGE_ROUTER_INVARIANT_ID = 'JOV-INV-040';

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const EXPECTATIONS = [
  {
    path: 'apps/web/scripts/design-ci-judge-router.ts',
    includes: [
      'JOV-INV-040',
      'export async function buildDesignCiJudgeMatrix',
      "'unroutable-judge'",
    ],
  },
  {
    path: 'apps/web/lib/agent-os/design-ci-judge-certification.ts',
    includes: [
      'JOV-INV-040',
      "'jovie:certification:v1:design-ci-judge-matrix'",
    ],
  },
  {
    path: 'apps/web/lib/agent-os/design-ci-judge-runtime-store.ts',
    includes: ['DesignCiJudgeCertificationStore', 'postgresRecordBackend'],
  },
  {
    path: 'apps/web/app/api/internal/ovie/design-ci-judge-evidence/route.ts',
    includes: ['verifyCronRequest', 'upsertDesignCiJudgeCells'],
  },
  {
    path: 'apps/web/package.json',
    includes: ['"design-ci:judge-matrix"'],
  },
  {
    path: 'package.json',
    includes: ['"design-ci:judge-matrix"'],
  },
];

function textFor(path, repoRoot, files) {
  if (Object.hasOwn(files, path)) return files[path];
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

export function evaluateDesignCiJudgeRouterContract({
  repoRoot = DEFAULT_REPO_ROOT,
  files = {},
} = {}) {
  const failures = [];
  for (const expectation of EXPECTATIONS) {
    let text;
    try {
      text = textFor(expectation.path, repoRoot, files);
    } catch {
      failures.push(`${expectation.path}: missing`);
      continue;
    }
    for (const pattern of expectation.includes) {
      if (!text.includes(pattern)) {
        failures.push(
          `${expectation.path}: missing required wiring ${pattern}`
        );
      }
    }
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = evaluateDesignCiJudgeRouterContract();
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(
    `${DESIGN_CI_JUDGE_ROUTER_INVARIANT_ID} design-ci judge router contract OK`
  );
}
