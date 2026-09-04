#!/usr/bin/env node
/**
 * Emit a screen-browser-proof/v1 from an external render run (JOV-INV-018).
 *
 * The render runner (Playwright capture harness or the post-deploy renderer)
 * produces a candidate artifact bundle plus measured per-viewport evidence.
 * This emitter does not certify the candidate: only the controlled producer
 * resolver can bind it to an immutable Actions artifact and browser run.
 *
 * Usage:
 *   node scripts/invariants/screen-proof-emit.mjs \
 *     --screen=web.homepage \
 *     --head-sha=<40hex> \
 *     --source-base-sha=<40hex> \
 *     --run-id=<positive integer> --run-attempt=<positive integer> --job-id=<positive integer> \
 *     --environment=local-production-build \
 *     --source-paths=<comma-separated registered source paths> \
 *     --state-scope=<registered route state scope> \
 *     --bundle=<dir of rendered stills> \
 *     --measurements=<json: {capturedAt, viewports[], activeFlow, historyProof, visibleActions}> \
 *     --out=<proof json> [--artifact-root=<dir>]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateScreenProof,
  hashArtifactBytes,
  REPO_ROOT,
  SCREEN_BROWSER_PROOF_SCHEMA,
  SCREEN_REGISTRY,
} from './screen-certification.mjs';

function parseArgs(argv) {
  const values = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const eq = arg.indexOf('=');
    if (eq === -1) throw new Error(`Missing value for ${arg}`);
    values[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return values;
}

export function emitScreenProof({
  screenId,
  headSha,
  sourceBaseSha,
  environment,
  sourcePaths,
  producerRunId,
  producerRunAttempt,
  producerJobId,
  stateScope,
  bundle,
  measurements,
  artifactRoot = REPO_ROOT,
}) {
  const screen = SCREEN_REGISTRY.find(
    entry => entry.id === screenId && !entry.excluded
  );
  if (!screen) {
    throw new Error(`screen ${screenId} is not a gated registry entry`);
  }
  if (typeof headSha !== 'string' || !/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error('head sha must be an exact 40-hex commit');
  }
  if (
    typeof sourceBaseSha !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(sourceBaseSha) ||
    sourceBaseSha.toLowerCase() === headSha.toLowerCase()
  ) {
    throw new Error('source base sha must differ from the exact head sha');
  }
  const ids = [producerRunId, producerRunAttempt, producerJobId];
  if (!ids.every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error(
      'producer run, attempt, and job IDs must be positive integers'
    );
  }
  if (environment !== 'local-production-build') {
    throw new Error('candidate environment must be local-production-build');
  }
  if (
    !Array.isArray(sourcePaths) ||
    sourcePaths.length === 0 ||
    sourcePaths.some(
      path =>
        typeof path !== 'string' ||
        !screen.sources.some(
          source =>
            path === source || (source.endsWith('/') && path.startsWith(source))
        )
    )
  ) {
    throw new Error(
      'candidate source paths must be nonempty registered sources'
    );
  }
  const expectedScope =
    screenId === 'web.homepage'
      ? 'homepage-cookie-state-observed'
      : 'bounded-public-route-transient-ui-suppressed';
  if (stateScope !== expectedScope) {
    throw new Error(
      'candidate state scope does not match the registered route'
    );
  }
  const root = resolve(artifactRoot);
  const bundleAbs = resolve(root, bundle);
  if (bundleAbs !== root && !bundleAbs.startsWith(`${root}/`)) {
    throw new Error(`render bundle escapes the artifact root: ${bundle}`);
  }
  const artifactPath = relative(root, bundleAbs).replace(/\\/g, '/');
  const artifactDigest = hashArtifactBytes(bundleAbs);
  if (artifactDigest === null) {
    throw new Error(
      `render bundle contains no readable artifact bytes: ${bundle}`
    );
  }
  const proof = {
    schema: SCREEN_BROWSER_PROOF_SCHEMA,
    producer: 'external-render-runner',
    status: 'unverified-candidate',
    certificationStatus: 'not-certified',
    screenId,
    headSha: headSha.toLowerCase(),
    sourceBaseSha: sourceBaseSha.toLowerCase(),
    environment,
    sourcePaths: [...new Set(sourcePaths)].sort(),
    tier: 'rendered-evidence',
    runUrl: `https://github.com/JovieInc/Jovie/actions/runs/${producerRunId}/attempts/${producerRunAttempt}`,
    producerRunId,
    producerRunAttempt,
    producerJobId,
    stateScope,
    artifactDigest,
    artifactPath,
    capturedAt: measurements?.capturedAt,
    viewports: measurements?.viewports,
    activeFlow: measurements?.activeFlow,
    historyProof: measurements?.historyProof,
    visibleActions: measurements?.visibleActions,
  };
  if (
    !Array.isArray(proof.viewports) ||
    proof.viewports.some(
      viewport =>
        viewport?.contrast?.passed !== true ||
        typeof viewport.contrast.method !== 'string' ||
        !viewport.contrast.method ||
        !Number.isSafeInteger(viewport.contrast.samples) ||
        viewport.contrast.samples < 1
    )
  ) {
    throw new Error(
      'candidate contrast must be independently measured per viewport'
    );
  }
  // Validate shape only. The caller owns these bytes and metrics, so the output
  // remains explicitly unverified until a producer-owned adapter exists.
  const findings = evaluateScreenProof(proof, { screen, headSha }).filter(
    finding =>
      finding !==
      'trusted external browser producer integration is unavailable; supplied proof cannot certify'
  );
  if (findings.length > 0) {
    throw new Error(
      `refusing to emit an invalid screen-proof candidate: ${findings.join('; ')}`
    );
  }
  return proof;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  for (const required of [
    'screen',
    'head-sha',
    'source-base-sha',
    'environment',
    'source-paths',
    'run-id',
    'run-attempt',
    'job-id',
    'state-scope',
    'bundle',
    'measurements',
    'out',
  ]) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const measurements = JSON.parse(
    readFileSync(resolve(args.measurements), 'utf8')
  );
  const proof = emitScreenProof({
    screenId: args.screen,
    headSha: args['head-sha'],
    sourceBaseSha: args['source-base-sha'],
    environment: args.environment,
    sourcePaths: args['source-paths'].split(','),
    producerRunId: Number(args['run-id']),
    producerRunAttempt: Number(args['run-attempt']),
    producerJobId: Number(args['job-id']),
    stateScope: args['state-scope'],
    bundle: args.bundle,
    measurements,
    artifactRoot: args['artifact-root'],
  });
  writeFileSync(resolve(args.out), `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(
    `[screen-proof-emit] unverified-candidate ${proof.screenId} ${proof.artifactDigest} -> ${args.out}\n`
  );
}
