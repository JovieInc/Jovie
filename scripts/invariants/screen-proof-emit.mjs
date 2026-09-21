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
 *     --run-url=https://github.com/JovieInc/Jovie/actions/runs/<id> \
 *     --bundle=<dir of rendered stills> \
 *     --measurements=<json: {capturedAt, viewports[], activeFlow, historyProof, visibleActions}> \
 *     --out=<proof json> [--artifact-root=<dir>] \
 *     [--producer-run-id=<positive integer> \
 *      --producer-run-attempt=<positive integer> \
 *      --producer-job-id=<positive integer> \
 *      --environment=local-production-build]
 *
 * Producer provenance is all-or-none. Omitting the group emits a local
 * unverified candidate that the trusted GitHub artifact resolver cannot admit.
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

/**
 * @param {{
 *   screenId: string,
 *   headSha: string,
 *   runUrl: string,
 *   bundle: string,
 *   measurements: {
 *     capturedAt?: unknown,
 *     viewports?: unknown,
 *     activeFlow?: unknown,
 *     historyProof?: unknown,
 *     visibleActions?: unknown,
 *   },
 *   artifactRoot?: string,
 *   producerRunId?: number,
 *   producerRunAttempt?: number,
 *   producerJobId?: number,
 *   environment?: string,
 * }} options
 */
export function emitScreenProof({
  screenId,
  headSha,
  runUrl,
  bundle,
  measurements,
  artifactRoot = REPO_ROOT,
  producerRunId,
  producerRunAttempt,
  producerJobId,
  environment,
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
  if (typeof runUrl !== 'string' || !/^https:\/\/[^\s]+$/i.test(runUrl)) {
    throw new Error('run url must be an https URL');
  }
  const producerProvenance = [
    producerRunId,
    producerRunAttempt,
    producerJobId,
    environment,
  ];
  const hasProducerProvenance = producerProvenance.some(
    value => value !== undefined
  );
  if (
    hasProducerProvenance &&
    (!Number.isSafeInteger(producerRunId) ||
      producerRunId <= 0 ||
      !Number.isSafeInteger(producerRunAttempt) ||
      producerRunAttempt <= 0 ||
      !Number.isSafeInteger(producerJobId) ||
      producerJobId <= 0 ||
      environment !== 'local-production-build')
  ) {
    throw new Error(
      'producer provenance requires positive run, attempt, and job IDs plus local-production-build'
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
    tier: 'rendered-evidence',
    runUrl,
    artifactDigest,
    artifactPath,
    ...(hasProducerProvenance ? { producerRunId } : {}),
    ...(hasProducerProvenance ? { producerRunAttempt } : {}),
    ...(hasProducerProvenance ? { producerJobId } : {}),
    ...(hasProducerProvenance
      ? { environment, sourcePaths: [...screen.sources].sort() }
      : {}),
    capturedAt: measurements?.capturedAt,
    viewports: measurements?.viewports,
    activeFlow: measurements?.activeFlow,
    historyProof: measurements?.historyProof,
    visibleActions: measurements?.visibleActions,
  };
  // Validate shape only. The caller owns these bytes and metrics, so the output
  // remains explicitly unverified until the trusted resolver admits the
  // immutable producer artifact.
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
    'run-url',
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
    runUrl: args['run-url'],
    bundle: args.bundle,
    measurements,
    artifactRoot: args['artifact-root'],
    producerRunId:
      args['producer-run-id'] === undefined
        ? undefined
        : Number(args['producer-run-id']),
    producerRunAttempt:
      args['producer-run-attempt'] === undefined
        ? undefined
        : Number(args['producer-run-attempt']),
    producerJobId:
      args['producer-job-id'] === undefined
        ? undefined
        : Number(args['producer-job-id']),
    environment: args.environment,
  });
  writeFileSync(resolve(args.out), `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(
    `[screen-proof-emit] unverified-candidate ${proof.screenId} ${proof.artifactDigest} -> ${args.out}\n`
  );
}
