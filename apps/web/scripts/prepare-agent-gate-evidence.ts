#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { safeParseAgentRunArtifact } from '../lib/agent-os/artifact';
import { formatAgentRunArtifactComment } from '../lib/agent-os/gate-evidence';

const artifactFile = process.argv[2];
if (!artifactFile) {
  console.error(
    'Usage: prepare-agent-gate-evidence.ts <artifact.json>\nValidates JSON and prints comment-ready markdown to stdout.'
  );
  process.exit(2);
}

let input: unknown;
try {
  input = JSON.parse(readFileSync(artifactFile, 'utf8')) as unknown;
} catch (error) {
  console.error(
    `Malformed artifact JSON: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

const parsed = safeParseAgentRunArtifact(input);
if (!parsed.success) {
  console.error('Schema-invalid agent-run artifact:');
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join('.');
    console.error(`- ${path ? `${path}: ` : ''}${issue.message}`);
  }
  process.exit(1);
}

process.stdout.write(`${formatAgentRunArtifactComment(parsed.data)}\n`);
