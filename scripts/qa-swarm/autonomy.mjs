import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getQaSwarmPaths } from './paths.mjs';
import { getRecipe } from './registry.mjs';

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 */
export function isP0Finding(finding) {
  if (finding.priority === 'P0') {
    return true;
  }

  if (finding.kind === 'flake' && finding.priority === 'P1') {
    return true;
  }

  const summary = `${finding.title} ${finding.summary}`.toLowerCase();
  return (
    summary.includes('500') ||
    summary.includes('crash') ||
    summary.includes('broken auth') ||
    summary.includes('billing') ||
    summary.includes('payment') ||
    summary.includes('data loss')
  );
}

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {boolean} eveEnabled
 */
export function shouldFastTrack(finding, eveEnabled) {
  if (!isP0Finding(finding)) {
    return false;
  }

  // P0 path must not depend on Eve curation.
  return !eveEnabled || finding.priority === 'P0';
}

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {object} context
 * @param {string} context.recipeId
 * @param {string} [context.linearIssueUrl]
 * @param {string} [context.gbrainSlug]
 */
export function writeRemediationManifest(finding, context) {
  const recipe = getRecipe(context.recipeId);
  const paths = getQaSwarmPaths();
  mkdirSync(paths.remediationRoot, { recursive: true });

  const manifestPath = path.join(paths.remediationRoot, `${finding.id}.json`);
  const manifest = {
    kind: 'qa-swarm-remediation',
    recipeId: recipe.id,
    findingId: finding.id,
    priority: finding.priority,
    title: finding.title,
    summary: finding.summary,
    reproduction: finding.reproduction ?? null,
    evidencePaths: finding.evidencePaths,
    linearIssueUrl: context.linearIssueUrl ?? null,
    gbrainSlug: context.gbrainSlug ?? null,
    profile: 'coder',
    verificationCommands: recipe.verificationCommands,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {object} context
 * @param {string} [context.linearIssueUrl]
 * @param {string} [context.gbrainSlug]
 */
export function enqueueForEve(finding, context) {
  const paths = getQaSwarmPaths();
  mkdirSync(paths.contextRoot, { recursive: true });

  const entry = {
    findingId: finding.id,
    recipeId: finding.recipeId,
    priority: finding.priority,
    kind: finding.kind,
    title: finding.title,
    summary: finding.summary,
    linearIssueUrl: context.linearIssueUrl ?? null,
    gbrainSlug: context.gbrainSlug ?? null,
    ts: new Date().toISOString(),
  };

  appendFileSync(paths.eveQueuePath, `${JSON.stringify(entry)}\n`);
  return entry;
}
