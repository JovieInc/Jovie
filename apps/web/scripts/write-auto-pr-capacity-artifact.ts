#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseAgentRunArtifact } from '../lib/agent-os/artifact';
import { buildAutoPrCapacityBlockedArtifact } from '../lib/agent-os/auto-pr-capacity';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseNonNegativeInteger(name: string): number {
  const value = Number(requireEnv(name));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

try {
  const outputFile = resolve(
    process.argv[2] ?? 'agent-run-artifacts/auto-pr-capacity-blocked.json'
  );
  const artifact = parseAgentRunArtifact(
    buildAutoPrCapacityBlockedArtifact({
      branchName: requireEnv('BRANCH_NAME'),
      runId: requireEnv('GITHUB_RUN_ID'),
      repository: requireEnv('GITHUB_REPOSITORY'),
      openAgentPrs: parseNonNegativeInteger('OPEN_AGENT_PRS'),
      maxOpenAgentPrs: parseNonNegativeInteger('MAX_OPEN_AGENT_PRS'),
      waitedSeconds: parseNonNegativeInteger('WAITED_SECONDS'),
    })
  );

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote AgentRunArtifact: ${outputFile}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
