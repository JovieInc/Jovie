#!/usr/bin/env node
/**
 * Sender provenance for PR Size Guard label overrides.
 *
 * `big-pr` / `codemod` / `integration-train` post a passing required check.
 * Only honor that override when the labeler is a trusted human collaborator
 * or an allowlisted automation actor. Fork authors, triage-only users, and
 * unknown bots cannot self-exempt.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TRUSTED_SIZE_GUARD_LABEL_BOTS = Object.freeze([
  'jovie-bot[bot]',
  'claude[bot]',
]);

export const TRUSTED_COLLABORATOR_PERMISSIONS = Object.freeze([
  'admin',
  'maintain',
  'write',
]);

const TRUSTED_BOTS = new Set(
  TRUSTED_SIZE_GUARD_LABEL_BOTS.map(login => login.toLowerCase())
);
const TRUSTED_PERMISSIONS = new Set(TRUSTED_COLLABORATOR_PERMISSIONS);

/**
 * @param {{
 *   actor?: string;
 *   permission?: string;
 * }} input
 */
export function evaluateSizeGuardLabelProvenance(input) {
  const actor = String(input.actor ?? '').trim();
  if (!actor) {
    return { allowed: false, reason: 'missing-actor' };
  }

  if (TRUSTED_BOTS.has(actor.toLowerCase())) {
    return { allowed: true, reason: 'trusted-bot' };
  }

  const permission = String(input.permission ?? '')
    .trim()
    .toLowerCase();
  if (TRUSTED_PERMISSIONS.has(permission)) {
    return { allowed: true, reason: 'trusted-collaborator' };
  }

  return { allowed: false, reason: 'untrusted-actor' };
}

function writeGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

function readCollaboratorPermission(repository, actor) {
  try {
    return execFileSync(
      'gh',
      [
        'api',
        `repos/${repository}/collaborators/${encodeURIComponent(actor)}/permission`,
        '--jq',
        '.permission',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    return '';
  }
}

function main() {
  const actor = process.env.ACTOR ?? '';
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const trustedBot = TRUSTED_BOTS.has(actor.trim().toLowerCase());
  const permission = trustedBot
    ? ''
    : readCollaboratorPermission(repository, actor.trim());
  const decision = evaluateSizeGuardLabelProvenance({ actor, permission });

  writeGithubOutput('allowed', String(decision.allowed));
  writeGithubOutput('reason', decision.reason);

  const summary = `size-guard label provenance: actor=${actor || '(empty)'} reason=${decision.reason} allowed=${decision.allowed}`;
  if (decision.allowed) {
    console.log(summary);
    return;
  }

  console.warn(`::warning::${summary}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    writeGithubOutput('allowed', 'false');
    writeGithubOutput('reason', 'provenance-error');
    process.exitCode = 1;
  }
}
