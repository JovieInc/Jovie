#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import {
  buildGateEvidenceSummary,
  evaluateAgentRunGateEvidence,
} from '../lib/agent-os/gate-evidence';

const evidenceFile = process.argv[2];

if (!evidenceFile) {
  console.error('Usage: check-agent-gate-evidence.ts <markdown-file>');
  process.exit(1);
}

let evidenceMarkdown: string;
try {
  evidenceMarkdown = readFileSync(evidenceFile, 'utf8');
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    `Could not read gate evidence file "${evidenceFile}": ${reason}`
  );
  process.exit(1);
}

const sourceRunId = process.env.AGENT_RUN_SOURCE_RUN_ID?.trim() || undefined;
const evaluation = evaluateAgentRunGateEvidence(
  evidenceMarkdown,
  undefined,
  sourceRunId ? { sourceRunId } : undefined
);

console.log(buildGateEvidenceSummary(evaluation));

if (!evaluation.passed) {
  process.exit(1);
}
