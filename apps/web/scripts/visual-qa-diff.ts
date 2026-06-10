import process from 'node:process';
import { APP_ROUTES } from '@/constants/routes';
import { parseAgentRunArtifact } from '@/lib/agent-os/artifact';
import { attachVisualQaDiffsToAgentRunArtifact } from '@/lib/agent-os/visual-qa/attach-artifact';
import { computeVisualQaDiffArtifacts } from '@/lib/agent-os/visual-qa/diff-artifacts';

interface CliOptions {
  readonly runId: string;
  readonly attachArtifact: boolean;
  readonly artifactBaseUrl: string | null;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    runId: process.env.VISUAL_QA_RUN_ID ?? '',
    attachArtifact: false,
    artifactBaseUrl: process.env.VISUAL_QA_ARTIFACT_BASE_URL ?? null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--run-id=')) {
      options.runId = arg.slice('--run-id='.length);
    } else if (arg === '--attach-artifact') {
      options.attachArtifact = true;
    } else if (arg.startsWith('--artifact-base-url=')) {
      options.artifactBaseUrl = arg.slice('--artifact-base-url='.length);
    }
  }

  if (!options.runId.trim()) {
    throw new Error(
      'Missing Visual QA run id. Pass --run-id=<id> or VISUAL_QA_RUN_ID.'
    );
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const diffSummary = await computeVisualQaDiffArtifacts(options.runId);

  const output: Record<string, unknown> = {
    diffSummary,
  };

  if (options.attachArtifact) {
    const artifact = attachVisualQaDiffsToAgentRunArtifact(
      parseAgentRunArtifact({
        id: `visual-qa-diff-${options.runId}`,
        source: 'vercel-workflow',
        sourceRunId: options.runId,
        kind: 'design_review',
        status: diffSummary.passed ? 'done' : 'failed',
        title: `Visual QA pixel diff — ${options.runId}`,
        summary: diffSummary.passed
          ? 'No significant visual drift detected.'
          : 'Visual drift detected in one or more surfaces.',
        modelRoute: 'deterministic',
        allowedActions: ['read', 'summarize'],
        forbiddenActions: [
          'write_code',
          'merge',
          'deploy',
          'mutate_linear',
          'send_outbound',
        ],
        humanApprovalRequired: false,
        humanGate: {
          required: false,
          status: 'not_required',
          reason: null,
          reviewer: null,
          reviewedAt: null,
        },
        linearIssueId: 'JOV-1944',
        linearIssueUrl:
          'https://linear.app/jovie/issue/JOV-1944/compute-pixel-diffs-and-generate-diff-artifacts',
        pullRequestUrl: null,
        adminSurface: APP_ROUTES.ADMIN_OPS,
        verificationGates: [
          {
            name: 'gstack.qa.exhaustive',
            required: true,
            status: 'missing',
            evidenceUrl: null,
            summary: 'Visual QA diff gate pending.',
            checkedAt: null,
          },
        ],
        costEstimate: {
          usd: 0,
          route: 'deterministic',
          inputTokens: null,
          outputTokens: null,
          notes: 'Deterministic pixel diff computation.',
        },
        blockedReason: diffSummary.passed ? null : 'Visual drift detected.',
        createdAt: diffSummary.computedAt,
        updatedAt: diffSummary.computedAt,
        metadata: {},
      }),
      diffSummary,
      {
        artifactBaseUrl: options.artifactBaseUrl ?? undefined,
      }
    );

    output.artifact = artifact;
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (!diffSummary.passed) {
    process.exitCode = 1;
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
