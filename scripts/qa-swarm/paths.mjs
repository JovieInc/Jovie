import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function getRepoRoot(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  while (true) {
    const hasGit = existsSync(path.join(current, '.git'));
    const hasPackage = existsSync(path.join(current, 'package.json'));

    if (hasGit || hasPackage) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd);
    }
    current = parent;
  }
}

export function getQaSwarmPaths(repoRoot = getRepoRoot()) {
  const contextRoot = path.join(repoRoot, '.context', 'qa-swarm');
  return {
    repoRoot,
    contextRoot,
    findingsRoot: path.join(contextRoot, 'findings'),
    gbrainQueuePath: path.join(contextRoot, 'gbrain-queue.jsonl'),
    eveQueuePath: path.join(contextRoot, 'eve-queue.jsonl'),
    remediationRoot: path.join(contextRoot, 'remediation'),
    runsRoot: path.join(contextRoot, 'runs'),
    commandsRoot: path.join(repoRoot, '.claude', 'commands'),
    skillsRoot: path.join(repoRoot, '.claude', 'skills', 'qa-swarm'),
  };
}

export function resolveQaSwarmRunDirectory(runId, paths = getQaSwarmPaths()) {
  if (typeof runId !== 'string' || !SAFE_RUN_ID.test(runId)) {
    throw new Error(
      `QA swarm run id must be one safe path segment matching ${SAFE_RUN_ID.source}`
    );
  }

  return path.join(paths.runsRoot, runId);
}

export function getScriptDir() {
  return SCRIPT_DIR;
}
