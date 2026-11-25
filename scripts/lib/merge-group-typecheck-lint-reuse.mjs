/**
 * Same-tree reuse for merge_group typecheck/lint lanes (JOV-12618 remainder).
 *
 * Tim / JOV-13081: keep typecheck and lint in the queue unless a same-tree
 * check proves reuse is valid. Tree equality implies the reusable lane
 * definitions in-tree match the proof commit's definitions.
 *
 * Fail open: any missing input or lookup error returns reuse=false.
 *
 * api-budget: github-actions-token 60/hr - one Source Validation workflow-runs
 * proof lookup per same-tree merge_group reuse decision (skip when trees differ)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export { parseSkipLaneIds } from './ci-fast-skip-lanes.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

/** Lanes that are tree-keyed (not base-sensitive ratchets/guards). */
export const REUSABLE_TYPECHECK_LINT_LANE_IDS = Object.freeze([
  'typecheck',
  'web-tests-typecheck',
  'web-stories-typecheck',
  'biome',
  'shadcn-lint-contracts',
  'scripts-typecheck',
]);

/**
 * Base-sensitive / combined-head / proof-inequivalent work that must keep
 * running in merge_group even when typecheck/lint reuse fires. Documented in
 * MERGE_QUEUE.md.
 *
 * `eslint-server-boundaries` is not tree-reuse-safe: its lane runs
 * `--no-inline-config` on the boundaries profile, while Source Validation's
 * `lint:eslint:changed` honors inline disable comments. Skipping it on an SV
 * green proof would let boundary suppressions reach main.
 */
export const MERGE_GROUP_BASE_SENSITIVE_CI_FAST_LANES = Object.freeze([
  'eslint-server-boundaries',
  'guardrails',
  'design-system-source-ratchet',
  'design-exception-registry',
  'design-governance-enforcement',
  'pen-token-parity',
  'ios-fast',
  'billing-coverage',
  'copy-gate',
  'source-guards',
  'node-runtime-contracts',
  'structural',
  'merge-group-guards',
  'design-conformance',
  'profile-admission',
]);

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeSha(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return SHA_PATTERN.test(text) ? text : null;
}

/**
 * Stable fingerprint of the reusable lane id set. When trees match, both
 * commits carry the same in-tree lane table; this still fails closed if a
 * caller passes a mismatched expected hash.
 * @param {readonly string[]} [laneIds]
 */
export function reusableLaneDefinitionHash(
  laneIds = REUSABLE_TYPECHECK_LINT_LANE_IDS
) {
  return createHash('sha256')
    .update([...laneIds].join('\n'), 'utf8')
    .digest('hex');
}

/**
 * @param {{
 *   mergeTreeSha?: string | null,
 *   sourceTreeSha?: string | null,
 *   sourceHeadSha?: string | null,
 *   sourceProofOk?: boolean,
 *   laneDefinitionHash?: string | null,
 *   expectedLaneDefinitionHash?: string | null,
 * }} input
 * @returns {{
 *   reuse: boolean,
 *   reason: string,
 *   skipLaneIds: readonly string[],
 * }}
 */
export function decideTypecheckLintReuse(input) {
  const mergeTreeSha = normalizeSha(input.mergeTreeSha);
  const sourceTreeSha = normalizeSha(input.sourceTreeSha);
  const sourceHeadSha = normalizeSha(input.sourceHeadSha);
  const expected =
    typeof input.expectedLaneDefinitionHash === 'string' &&
    input.expectedLaneDefinitionHash.length > 0
      ? input.expectedLaneDefinitionHash
      : reusableLaneDefinitionHash();
  const actual =
    typeof input.laneDefinitionHash === 'string' &&
    input.laneDefinitionHash.length > 0
      ? input.laneDefinitionHash
      : expected;

  if (!mergeTreeSha || !sourceTreeSha) {
    return {
      reuse: false,
      reason: 'missing tree sha',
      skipLaneIds: [],
    };
  }
  if (mergeTreeSha !== sourceTreeSha) {
    return {
      reuse: false,
      reason: 'merge tree differs from source PR head tree',
      skipLaneIds: [],
    };
  }
  if (actual !== expected) {
    return {
      reuse: false,
      reason: 'reusable lane definition hash mismatch',
      skipLaneIds: [],
    };
  }
  if (!sourceHeadSha) {
    return {
      reuse: false,
      reason: 'missing source head sha',
      skipLaneIds: [],
    };
  }
  if (input.sourceProofOk !== true) {
    return {
      reuse: false,
      reason: 'source PR head lacks a green typecheck/lint proof',
      skipLaneIds: [],
    };
  }
  return {
    reuse: true,
    reason: `same tree ${mergeTreeSha} with green proof on ${sourceHeadSha}`,
    skipLaneIds: REUSABLE_TYPECHECK_LINT_LANE_IDS,
  };
}

/**
 * @param {string} cwd
 * @param {string} rev
 */
export function gitTreeSha(cwd, rev) {
  const sha = normalizeSha(rev);
  if (!sha) throw new Error(`exact commit SHA required, got ${String(rev)}`);
  const out = execFileSync('git', ['rev-parse', `${sha}^{tree}`], {
    cwd,
    encoding: 'utf8',
  }).trim();
  const tree = normalizeSha(out);
  if (!tree) throw new Error(`git rev-parse ${sha}^{tree} returned ${out}`);
  return tree;
}

/** Workflow file used for Source Validation proof lookup (matches SV itself). */
export const SOURCE_VALIDATION_WORKFLOW_PATH = 'source-validation.yml';

/**
 * True when Source Validation already concluded success on the exact source
 * head (PR Ready aggregate). Fail open on transport errors.
 *
 * Query the workflow-scoped runs endpoint (not repo-wide `/actions/runs`) so
 * concurrent PR workflows cannot push the SV proof out of a small page window
 * (Sentry 20814924). Pattern matches source-validation.yml proof reuse.
 * @param {{
 *   repository: string,
 *   sourceHeadSha: string,
 *   token: string,
 *   fetchImpl?: typeof fetch,
 * }} args
 */
export async function sourceHeadHasGreenValidationProof({
  repository,
  sourceHeadSha,
  token,
  fetchImpl = fetch,
}) {
  const head = normalizeSha(sourceHeadSha);
  if (!head || !repository || !token) return false;
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) return false;

  const query = new URLSearchParams({
    event: 'pull_request',
    head_sha: head,
    status: 'completed',
    per_page: '100',
  });
  const path = `repos/${owner}/${repo}/actions/workflows/${SOURCE_VALIDATION_WORKFLOW_PATH}/runs?${query}`;
  try {
    const { createGitHubClient } = await import(
      '../../packages/api-client/github.ts'
    );
    const response = await createGitHubClient({
      token,
      fetch: fetchImpl,
    }).rest('GET', path, undefined, {
      priority: 'default',
      maxWaitMs: 0,
      timeoutMs: 15000,
    });
    if (response.status < 200 || response.status >= 300) return false;
    const body =
      /** @type {{ workflow_runs?: Array<Record<string, unknown>> }} */ (
        response.json()
      );
    return (body.workflow_runs ?? []).some(
      run => run.head_sha === head && run.conclusion === 'success'
    );
  } catch {
    return false;
  }
}

function writeGithubOutput(env, lines) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

/**
 * Hosted entry: compare merge HEAD tree to the source PR head tree and look up
 * a green Source Validation proof. Emits reuse + skip_lane_ids.
 * @param {Record<string, string | undefined>} [env]
 */
export async function runTypecheckLintReuseFromEnv(env = process.env) {
  const cwd = env.GITHUB_WORKSPACE || process.cwd();
  const mergeHead = normalizeSha(env.GITHUB_SHA);
  const sourceHead = normalizeSha(env.SOURCE_HEAD_SHA);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';
  const repository = env.GITHUB_REPOSITORY || '';
  const expectedHash = reusableLaneDefinitionHash();

  /** @type {{ reuse: boolean, reason: string, skipLaneIds: readonly string[] }} */
  let decision = {
    reuse: false,
    reason: 'not evaluated',
    skipLaneIds: [],
  };

  try {
    if (env.GITHUB_EVENT_NAME !== 'merge_group') {
      decision = {
        reuse: false,
        reason: 'not a merge_group event',
        skipLaneIds: [],
      };
    } else if (!mergeHead || !sourceHead) {
      decision = {
        reuse: false,
        reason: 'missing merge or source head sha',
        skipLaneIds: [],
      };
    } else {
      // Ensure the source tip is present for the tree parse (git traffic).
      try {
        execFileSync('git', ['cat-file', '-e', `${sourceHead}^{commit}`], {
          cwd,
          stdio: 'ignore',
        });
      } catch {
        execFileSync(
          'git',
          ['fetch', '--no-tags', '--filter=blob:none', 'origin', sourceHead],
          { cwd, stdio: 'ignore' }
        );
      }
      const mergeTreeSha = gitTreeSha(cwd, mergeHead);
      const sourceTreeSha = gitTreeSha(cwd, sourceHead);
      // Most groups diverge (JOV-13081: 7/10). Skip the REST proof lookup
      // unless the trees already match so green groups stay cheap.
      let sourceProofOk = false;
      if (mergeTreeSha === sourceTreeSha) {
        try {
          sourceProofOk = await sourceHeadHasGreenValidationProof({
            repository,
            sourceHeadSha: sourceHead,
            token,
          });
        } catch {
          sourceProofOk = false;
        }
      }
      decision = decideTypecheckLintReuse({
        mergeTreeSha,
        sourceTreeSha,
        sourceHeadSha: sourceHead,
        sourceProofOk,
        laneDefinitionHash: expectedHash,
        expectedLaneDefinitionHash: expectedHash,
      });
    }
  } catch (error) {
    decision = {
      reuse: false,
      reason: `lookup failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      skipLaneIds: [],
    };
  }

  const skipCsv = decision.skipLaneIds.join(',');
  writeGithubOutput(env, [
    `reuse=${decision.reuse ? 'true' : 'false'}`,
    `reason=${decision.reason}`,
    `skip_lane_ids=${skipCsv}`,
  ]);
  console.log(
    `::notice::typecheck/lint reuse=${decision.reuse} (${decision.reason})`
  );
  return decision;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runTypecheckLintReuseFromEnv().catch(error => {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
