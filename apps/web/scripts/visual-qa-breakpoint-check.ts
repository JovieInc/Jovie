#!/usr/bin/env node

import { loadVisualQaBreakpointReport } from '@/lib/agent-os/visual-qa/breakpoint-report';

function parseRunId(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run-id') {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error('Missing value for --run-id');
      }
      return value;
    }

    if (arg.startsWith('--run-id=')) {
      const value = arg.slice('--run-id='.length).trim();
      if (!value) {
        throw new Error('Missing value for --run-id');
      }
      return value;
    }
  }

  const envRunId = process.env.VISUAL_QA_RUN_ID?.trim();
  if (envRunId) {
    return envRunId;
  }

  throw new Error(
    'Visual QA breakpoint check summary requires --run-id or VISUAL_QA_RUN_ID.'
  );
}

async function main(): Promise<void> {
  const runId = parseRunId(process.argv.slice(2));
  const report = await loadVisualQaBreakpointReport(runId);

  if (!report) {
    throw new Error(`No breakpoint report found for run id "${runId}".`);
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
