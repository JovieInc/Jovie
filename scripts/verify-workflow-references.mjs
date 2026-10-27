#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {
  planSourceGuardActions,
  ROOT_ACTIONS,
  SNAPSHOT_RELATIVE,
} from './lib/source-guard-action-snapshot.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');

const WORKFLOW_EXTENSIONS = new Set(['.yml', '.yaml']);
const LOCAL_PATH_PREFIXES = ['./', '.github/', 'apps/', 'scripts/'];
const COMMANDS_WITH_PATH =
  /(?<![-\w])(?:bash|sh|node|python3?|ruby)(?:\s+--[^\s]+)*\s+(['"]?)([^\s'"`;&|)]+)\1/g;
const PNPM_COMMAND_PATTERN = /(?:^|[;&|])\s*pnpm\b[^;&|]*/g;
const YAML_PNPM_COMMAND_PATTERN = /\brun:\s*pnpm\b[^;&|]*/g;
const FILTER_PATTERN = /--filter(?:=|\s+)([^\s;&|]+)/g;
const IOS_SCRIPT_PATH_PATTERN =
  /(?:apps\/ios\/scripts|\.github\/scripts)\/[A-Za-z0-9._/-]+\.(?:mjs|js|ts|sh|cjs|rb)\b/g;

const GH_COMMAND_PATTERN = /(?<![-\w./])gh\s+[a-z]/g;

/**
 * gh's --jq takes exactly one expression and has no --arg/--argjson; the real
 * CLI rejects that form at runtime (#20164, JOV-7698). Scan each
 * backslash-joined command from `gh` to the first unquoted pipe or separator.
 */
export function findGhJqArgMisuse(source) {
  const lines = source.split(/\r?\n/);
  const hits = [];
  for (let start = 0; start < lines.length; start++) {
    let end = start;
    while (end < lines.length - 1 && /\\\s*$/.test(lines[end])) end++;
    const command = lines.slice(start, end + 1).join(' ');
    for (const match of command.matchAll(GH_COMMAND_PATTERN)) {
      let quote = '';
      let span = '';
      for (const char of command.slice(match.index)) {
        if (quote) {
          if (char === quote) quote = '';
        } else if (char === "'" || char === '"') quote = char;
        else if ('|;&)'.includes(char)) break;
        span += char;
      }
      const words = span.split(/\s+/);
      if (
        words.some(word => word === '--jq' || word.startsWith('--jq=')) &&
        words.some(word => /^--arg(?:json)?$/.test(word))
      ) {
        hits.push(start + 1);
        break;
      }
    }
    start = end;
  }
  return hits;
}

function walkFiles(directory, predicate) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (entry.name === 'node_modules' || entry.name === '.git')
    )
      continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(entryPath, predicate));
    else if (predicate(entryPath)) result.push(entryPath);
  }
  return result;
}

function isRepoPath(value) {
  return (
    LOCAL_PATH_PREFIXES.some(prefix => value.startsWith(prefix)) &&
    !value.includes('${') &&
    !value.includes('$')
  );
}

function resolveWorkspaceNames(root) {
  const names = new Set();
  const workspaceRoots = [root, 'apps', 'packages', 'workers'].map(relative =>
    path.join(root, relative)
  );
  for (const workspaceRoot of workspaceRoots) {
    if (!fs.existsSync(workspaceRoot)) continue;
    const packageFiles = walkFiles(
      workspaceRoot,
      file => path.basename(file) === 'package.json'
    );
    for (const packagePath of packageFiles) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        if (typeof packageJson.name === 'string') names.add(packageJson.name);
      } catch {
        // Package JSON validity is owned by the package-manager/lint gates.
      }
    }
  }
  return names;
}

/** Static references to the runtime snapshot must prove their source and producer. */
function generatedActionReferences(root, relativeWorkflow, source) {
  const valid = new Set();
  if (relativeWorkflow !== '.github/workflows/source-validation.yml')
    return valid;
  try {
    const document = load(source);
    const job = document?.jobs?.deterministic;
    const steps = job?.steps;
    if (!Array.isArray(steps)) return valid;
    const producerIndex = steps.findIndex(
      step => step.id === 'source_guard_actions'
    );
    const producer = steps[producerIndex];
    const mergeIndex = steps.findIndex(
      step => step.id === 'source_guard_merge'
    );
    const condition =
      "steps.source_guard_merge.outputs.dependency_changed == 'true'";
    const helper = 'scripts/lib/source-guard-action-snapshot.mjs';
    if (
      !producer ||
      mergeIndex < 0 ||
      mergeIndex >= producerIndex ||
      steps.filter(step => step.id === producer.id).length !== 1 ||
      producer.run?.trim() !== `node ${helper}` ||
      producer.if !== condition ||
      producer['continue-on-error'] ||
      producer['working-directory'] ||
      job.defaults?.run?.['working-directory'] ||
      document.defaults?.run?.['working-directory'] ||
      !fs.existsSync(path.join(root, helper))
    )
      return valid;
    for (const [index, action] of ROOT_ACTIONS.entries()) {
      const consumer = steps[producerIndex + index + 1];
      if (
        consumer?.uses !== `./${SNAPSHOT_RELATIVE}/${action}` ||
        consumer.if !== condition ||
        consumer['continue-on-error']
      )
        return valid;
    }
    // Same validation as the real writer, including nested local metadata and
    // package/link boundaries. Never create a snapshot to make the check pass.
    planSourceGuardActions(root);
    for (const action of ROOT_ACTIONS)
      valid.add(`./${SNAPSHOT_RELATIVE}/${action}`);
    // A second occurrence in another job has no producer proof.
    for (const [id, other] of Object.entries(document.jobs)) {
      if (
        id !== 'deterministic' &&
        other.steps?.some(step => valid.has(step.uses))
      )
        return new Set();
    }
    for (const reference of valid) {
      if (steps.filter(step => step.uses === reference).length !== 1)
        return new Set();
    }
  } catch {
    // Missing/invalid source closure or workflow structure remains unresolved.
    return new Set();
  }
  return valid;
}

export function validateWorkflowReferences(root = process.cwd()) {
  const workflowRoot = path.join(root, '.github', 'workflows');
  const errors = [];
  const workflowFiles = fs.existsSync(workflowRoot)
    ? walkFiles(workflowRoot, file =>
        WORKFLOW_EXTENSIONS.has(path.extname(file))
      )
    : [];
  const workspaceNames = resolveWorkspaceNames(root);

  for (const workflowFile of workflowFiles) {
    const relativeWorkflow = path.relative(root, workflowFile);
    const source = fs.readFileSync(workflowFile, 'utf8');
    const lines = source.split(/\r?\n/);
    const generatedActions = generatedActionReferences(
      root,
      relativeWorkflow,
      source
    );

    for (const line of findGhJqArgMisuse(source)) {
      errors.push(
        `${relativeWorkflow}:${line}: gh --jq cannot take --arg/--argjson; filter server-side or pipe to jq`
      );
    }

    for (const [index, line] of lines.entries()) {
      const localAction = line.match(/\buses:\s*(['"]?)(\.\/[^\s#'"}]+)\1/);
      if (localAction) {
        const actionPath = localAction[2];
        if (actionPath.startsWith(`./${SNAPSHOT_RELATIVE}/`)) {
          if (!generatedActions.has(actionPath)) {
            errors.push(
              `${relativeWorkflow}:${index + 1}: generated action has no valid source and producer: ${actionPath}`
            );
          }
          continue;
        }
        if (actionPath.startsWith('./.github/workflows/')) {
          if (!fs.existsSync(path.join(root, actionPath))) {
            errors.push(
              `${relativeWorkflow}:${index + 1}: local workflow does not resolve: ${actionPath}`
            );
          }
          continue;
        }
        const actionFile = path.join(root, actionPath, 'action.yml');
        const actionYaml = path.join(root, actionPath, 'action.yaml');
        const dockerfile = path.join(root, actionPath, 'Dockerfile');
        if (
          !fs.existsSync(actionFile) &&
          !fs.existsSync(actionYaml) &&
          !fs.existsSync(dockerfile)
        ) {
          errors.push(
            `${relativeWorkflow}:${index + 1}: local action does not resolve: ${actionPath}`
          );
        }
      }

      for (const match of line.matchAll(COMMANDS_WITH_PATH)) {
        const referencedPath = match[2].replace(/[),]+$/, '');
        if (!isRepoPath(referencedPath)) continue;
        if (!fs.existsSync(path.join(root, referencedPath))) {
          errors.push(
            `${relativeWorkflow}:${index + 1}: command path does not resolve: ${referencedPath}`
          );
        }
      }

      for (const referencedPath of line.matchAll(IOS_SCRIPT_PATH_PATTERN)) {
        const scriptPath = referencedPath[0];
        if (!fs.existsSync(path.join(root, scriptPath))) {
          errors.push(
            `${relativeWorkflow}:${index + 1}: command path does not resolve: ${scriptPath}`
          );
        }
      }

      const pnpmCommands = [
        ...line.matchAll(PNPM_COMMAND_PATTERN),
        ...line.matchAll(YAML_PNPM_COMMAND_PATTERN),
      ];
      for (const command of pnpmCommands) {
        for (const match of command[0].matchAll(FILTER_PATTERN)) {
          const filter = match[1].replace(/[),`]+$/, '');
          if (
            filter.startsWith('!') ||
            filter.includes('*') ||
            filter.includes('${')
          )
            continue;
          if (!workspaceNames.has(filter)) {
            errors.push(
              `${relativeWorkflow}:${index + 1}: pnpm workspace filter does not resolve: ${filter}`
            );
          }
        }
      }
    }
  }

  return [...new Set(errors)].sort();
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root =
    rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1]);
  const errors = validateWorkflowReferences(root);
  if (errors.length > 0) {
    console.error(
      `Workflow reference validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`
    );
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Workflow reference validation passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
