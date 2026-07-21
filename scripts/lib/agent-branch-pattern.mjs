#!/usr/bin/env node
/**
 * Single source of truth for open-agent-PR capacity counting.
 *
 * Used by:
 * - .github/workflows/github-ai-dispatcher.yml
 * - .github/workflows/github-ai-orchestrator.yml
 * - .github/workflows/auto-pr-on-push.yml
 * - .github/workflows/agent-tick.yml (dispatch job)
 *
 * Call sites must feed paginated open-PR JSON (`gh api --paginate … | jq -s`)
 * so every gate counts the same PR universe.
 *
 * Acceptance (GitHub #10463): dispatcher and orchestrator must count identical
 * PR sets. Prefixes and the owner/jov-ID[_-suffix] form stay aligned here.
 *
 * Matches:
 * - codex/*, claude/*, codegen-bot/*, linear/*
 * - <user>/jov-<digits> with optional - or _ description
 *   (e.g. tim/jov-123-fix, tim/jov-123_fix, tim/jov-123)
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Prefix-owned agent automation branches. */
export const AGENT_OPEN_PR_PREFIX_RE = /^(codex|codegen-bot|linear|claude)\//;

/**
 * Personal / Linear-style branches: owner/jov-123, owner/jov-123-fix,
 * owner/jov-123_fix. Case-insensitive on the jov segment.
 */
export const AGENT_OPEN_PR_JOV_RE = /^[^/]+\/jov-[0-9]+([_-].+)?$/i;

/**
 * jq test expression (applied to a branch-name string). Kept for documentation
 * and for any shell/jq call site that cannot import this module. Must stay
 * behaviorally identical to {@link isOpenAgentPrBranch}.
 */
export const AGENT_OPEN_PR_BRANCH_JQ_TEST =
  '(test("^(codex|codegen-bot|linear|claude)/") or test("^[^/]+/jov-[0-9]+([_-].+)?$"; "i")) and (startswith("gtmq_") | not)';

/**
 * @param {unknown} ref
 * @returns {boolean}
 */
export function isOpenAgentPrBranch(ref) {
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (ref.startsWith('gtmq_')) return false;
  return AGENT_OPEN_PR_PREFIX_RE.test(ref) || AGENT_OPEN_PR_JOV_RE.test(ref);
}

/**
 * @param {unknown} pr
 * @returns {string}
 */
export function extractHeadRef(pr) {
  if (!pr || typeof pr !== 'object') return '';
  const record = /** @type {Record<string, unknown>} */ (pr);
  if (typeof record.headRefName === 'string') return record.headRefName;
  const head = record.head;
  if (head && typeof head === 'object') {
    const headRecord = /** @type {Record<string, unknown>} */ (head);
    if (typeof headRecord.ref === 'string') return headRecord.ref;
  }
  if (typeof record.head === 'string') return record.head;
  if (typeof record.ref === 'string') return record.ref;
  return '';
}

/**
 * Flatten common `gh api --paginate | jq -s` shapes into a PR object list.
 * @param {unknown} input
 * @returns {unknown[]}
 */
export function normalizePrList(input) {
  if (!Array.isArray(input)) return [];
  // Paginated REST: [[{...}, ...], [{...}, ...]] after jq -s
  if (input.length > 0 && Array.isArray(input[0])) {
    return input.flat();
  }
  return input;
}

/**
 * @param {unknown} input JSON array (or nested page arrays) of PR objects
 * @returns {number}
 */
export function countOpenAgentPrs(input) {
  return normalizePrList(input).filter(pr =>
    isOpenAgentPrBranch(extractHeadRef(pr))
  ).length;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(argv) {
  const cmd = argv[2] ?? '--count';

  if (cmd === '--jq-test') {
    process.stdout.write(`${AGENT_OPEN_PR_BRANCH_JQ_TEST}\n`);
    return 0;
  }

  if (cmd === '--match') {
    const ref = argv[3] ?? '';
    process.stdout.write(isOpenAgentPrBranch(ref) ? 'true\n' : 'false\n');
    return isOpenAgentPrBranch(ref) ? 0 : 1;
  }

  if (cmd === '--count') {
    const raw = readStdin().trim();
    if (!raw) {
      process.stdout.write('0\n');
      return 0;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`agent-branch-pattern: invalid JSON on stdin: ${message}`);
      return 2;
    }
    process.stdout.write(`${countOpenAgentPrs(parsed)}\n`);
    return 0;
  }

  console.error(
    'Usage: agent-branch-pattern.mjs --count | --jq-test | --match <ref>'
  );
  return 2;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = main(process.argv);
}
