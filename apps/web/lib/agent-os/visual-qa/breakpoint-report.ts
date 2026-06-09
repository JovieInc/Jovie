import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  isVisualQaBreakpointReport,
  summarizeVisualQaBreakpointReport,
  type VisualQaBreakpointCheckResult,
  type VisualQaBreakpointReport,
} from '@/lib/agent-os/visual-qa/breakpoint-check';
import {
  resolveVisualQaBreakpointReportPath,
  resolveVisualQaRunDirectory,
} from '@/lib/agent-os/visual-qa/paths';

interface RecordVisualQaBreakpointSurfaceInput {
  readonly surfaceId: string;
  readonly title: string;
  readonly breakpoints: readonly VisualQaBreakpointCheckResult[];
}

interface RecordVisualQaBreakpointReportInput {
  readonly runId: string;
  readonly surfaces: readonly RecordVisualQaBreakpointSurfaceInput[];
  readonly gitSha?: string | null;
}

async function readBreakpointReport(
  runId: string
): Promise<VisualQaBreakpointReport | null> {
  const reportPath = resolveVisualQaBreakpointReportPath(runId);

  try {
    const raw = await readFile(reportPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isVisualQaBreakpointReport(parsed) || parsed.runId !== runId) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function recordVisualQaBreakpointReport(
  input: RecordVisualQaBreakpointReportInput
): Promise<VisualQaBreakpointReport> {
  const checkedAt = new Date().toISOString();
  const runDirectory = resolveVisualQaRunDirectory(input.runId);
  await mkdir(runDirectory, { recursive: true });

  const existingReport = await readBreakpointReport(input.runId);
  const report = summarizeVisualQaBreakpointReport({
    runId: input.runId,
    checkedAt,
    gitSha: input.gitSha ?? existingReport?.gitSha ?? null,
    surfaces: input.surfaces.map(surface => ({
      surfaceId: surface.surfaceId,
      title: surface.title,
      passed: surface.breakpoints.every(result => result.passed),
      breakpoints: surface.breakpoints,
    })),
  });

  await writeFile(
    resolveVisualQaBreakpointReportPath(input.runId),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  return report;
}

export async function loadVisualQaBreakpointReport(
  runId: string
): Promise<VisualQaBreakpointReport | null> {
  return readBreakpointReport(runId);
}
