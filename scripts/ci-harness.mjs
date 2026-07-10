#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildCiHarnessArtifact,
  classifyCiRisk,
  generateDocsFiles,
  listMergeGateJobs,
  listRiskRuleContracts,
  loadCiHarnessManifest,
  parseJobResultsFromEnv,
  validateCiHarnessManifest,
} from './lib/ci-harness.mjs';

function argValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function hasArg(args, name) {
  return args.includes(name);
}

function writeGithubOutput(path, values) {
  if (!path) return;
  const lines = [];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(path, `${lines.join('\n')}\n`, { flag: 'a' });
}

function readFilesArg(args) {
  const filesPath = argValue(args, '--files');
  if (!filesPath) return [];
  return readFileSync(filesPath, 'utf8').split(/\r?\n/).filter(Boolean);
}

function printValidation(manifest) {
  const validation = validateCiHarnessManifest(manifest);
  if (validation.ok) {
    console.log('CI harness manifest is valid.');
    return;
  }
  console.error('CI harness manifest is invalid:');
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

function runGenerateDocs(manifest, args) {
  const write = hasArg(args, '--write');
  const check = hasArg(args, '--check');
  const results = generateDocsFiles(manifest, { write });
  const changed = results.filter(result => result.changed);

  if (check && changed.length > 0) {
    console.error('CI harness generated docs are stale:');
    for (const result of changed) {
      console.error(`- ${result.path}`);
    }
    console.error('Run `pnpm ci:harness:docs` and commit the generated docs.');
    process.exitCode = 1;
    return;
  }

  for (const result of results) {
    console.log(`${result.changed ? 'updated' : 'current'} ${result.path}`);
  }
}

function runClassifyRisk(manifest, args) {
  const files = readFilesArg(args);
  const classification = classifyCiRisk(files, manifest, {
    diffBase: argValue(args, '--diff-base', process.env.CI_RISK_DIFF_BASE),
  });
  const outputPath = argValue(
    args,
    '--github-output',
    process.env.GITHUB_OUTPUT
  );

  writeGithubOutput(outputPath, {
    risk_level: classification.riskLevel,
    requires_smoke: String(classification.requiresSmoke),
    requires_preview: String(classification.requiresPreview),
    blocks_unattended_auto_merge: String(
      classification.blocksUnattendedAutoMerge
    ),
    recommended_labels: classification.recommendedLabels.join(','),
    matched_rule_ids: classification.matchedRules
      .map(rule => rule.id)
      .join(','),
  });

  console.log(JSON.stringify(classification, null, 2));
}

function runEmitArtifact(manifest, args) {
  const riskPath = argValue(args, '--risk');
  const risk = riskPath ? JSON.parse(readFileSync(riskPath, 'utf8')) : null;
  // Optional intra-job lane results (JOV-3464 ci-fast collapse).
  // Accepts either a flat lanes array file or `{ lanes: [...] }` from ci-fast-lanes.mjs.
  const lanesPath = argValue(args, '--lanes');
  let laneResults;
  if (lanesPath) {
    const raw = JSON.parse(readFileSync(lanesPath, 'utf8'));
    laneResults = Array.isArray(raw) ? raw : (raw.lanes ?? raw);
  }
  const artifact = buildCiHarnessArtifact({
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    repository: process.env.GITHUB_REPOSITORY,
    prNumber: process.env.PR_NUMBER,
    sha: process.env.PR_HEAD_SHA || process.env.GITHUB_SHA,
    previewUrl: process.env.PR_PREVIEW_URL,
    jobResults: parseJobResultsFromEnv(process.env, manifest),
    risk,
    manifest,
    laneResults,
  });

  const outputPath = argValue(args, '--out');
  if (outputPath) {
    const absoluteOutput = resolve(outputPath);
    mkdirSync(dirname(absoluteOutput), { recursive: true });
    writeFileSync(absoluteOutput, `${JSON.stringify(artifact, null, 2)}\n`);
  } else {
    console.log(JSON.stringify(artifact, null, 2));
  }
}

function runPrintContract(manifest) {
  const contract = {
    schemaVersion: manifest.schemaVersion,
    mergeGates: listMergeGateJobs(manifest),
    riskRules: listRiskRuleContracts(manifest),
  };
  console.log(JSON.stringify(contract, null, 2));
}

function main() {
  const [, , command, ...args] = process.argv;
  const manifest = loadCiHarnessManifest(
    argValue(args, '--manifest', undefined)
  );

  switch (command) {
    case 'validate':
      printValidation(manifest);
      break;
    case 'generate-docs':
      runGenerateDocs(manifest, args);
      break;
    case 'classify-risk':
      runClassifyRisk(manifest, args);
      break;
    case 'emit-artifact':
      runEmitArtifact(manifest, args);
      break;
    case 'print-contract':
      runPrintContract(manifest);
      break;
    default:
      console.error(
        'Usage: node scripts/ci-harness.mjs <validate|generate-docs|classify-risk|emit-artifact|print-contract>'
      );
      process.exitCode = 1;
  }
}

main();
