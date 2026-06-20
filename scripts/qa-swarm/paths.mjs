import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function getRepoRoot(cwd = process.cwd()) {
  return path.resolve(cwd);
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

export function getScriptDir() {
  return SCRIPT_DIR;
}
