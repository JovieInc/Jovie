#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WORKFLOW_EXTENSIONS = new Set(['.yml', '.yaml']);
const LOCAL_PATH_PREFIXES = ['./', '.github/', 'apps/', 'scripts/'];
const COMMANDS_WITH_PATH =
  /(?<![-\w])(?:bash|sh|node|python3?|ruby)(?:\s+--[^\s]+)*\s+(['"]?)([^\s'"`;&|)]+)\1/g;
const FILTER_PATTERN = /--filter(?:=|\s+)([^\s]+)/g;
const IOS_SCRIPT_PATH_PATTERN =
  /(?:apps\/ios\/scripts|\.github\/scripts)\/[A-Za-z0-9._/-]+\.(?:mjs|js|ts|sh|cjs|rb)\b/g;

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

    for (const [index, line] of lines.entries()) {
      const localAction = line.match(/\buses:\s*(['"]?)(\.\/[^\s#'"}]+)\1/);
      if (localAction) {
        const actionPath = localAction[2];
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

      for (const match of line.matchAll(FILTER_PATTERN)) {
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
