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

const evaluation = evaluateAgentRunGateEvidence(
  readFileSync(evidenceFile, 'utf8')
);

console.log(buildGateEvidenceSummary(evaluation));

if (!evaluation.passed) {
  process.exit(1);
}
