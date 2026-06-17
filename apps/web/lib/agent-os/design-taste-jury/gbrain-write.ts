import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DesignTasteConsensusFinding } from '@/lib/agent-os/design-taste-jury/types';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';

const TASTE_MEMORY_HEADER = `# Design taste memory

Persistent accepted/rejected design directions for Design Lab runs.
Each entry records surface, direction, decision, notes, reviewer, and timestamp.
`;

function getDesignTasteMemoryPath(): string {
  return resolveMonorepoPath('agentos', 'memory', 'design-taste.md');
}

function formatTasteMemoryEntry(params: {
  readonly timestamp: string;
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly direction: string;
  readonly decision: 'accepted' | 'rejected';
  readonly notes: string | null;
  readonly reviewer: string;
  readonly linearIssueId: string;
}): string {
  const notesBlock = params.notes
    ? `\nNotes: ${params.notes.trim()}`
    : '\nNotes: —';

  return [
    `## ${params.timestamp} — ${params.surfaceId} — ${params.decision}`,
    `Surface: ${params.surfaceName}`,
    `Direction: ${params.direction.trim()}`,
    `Decision: ${params.decision}`,
    `Linear: ${params.linearIssueId}`,
    `Reviewer: ${params.reviewer}`,
    notesBlock,
    '',
  ].join('\n');
}

async function appendDesignTasteMemoryEntry(params: {
  readonly timestamp: string;
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly direction: string;
  readonly decision: 'accepted' | 'rejected';
  readonly notes: string | null;
  readonly reviewer: string;
  readonly linearIssueId: string;
}): Promise<void> {
  const tasteMemoryPath = getDesignTasteMemoryPath();
  await fs.mkdir(path.dirname(tasteMemoryPath), { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(tasteMemoryPath, 'utf8');
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error)) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const nextContent =
    existing.trim().length > 0
      ? `${existing.trimEnd()}\n\n${formatTasteMemoryEntry(params)}`
      : `${TASTE_MEMORY_HEADER.trim()}\n\n${formatTasteMemoryEntry(params)}`;

  await fs.writeFile(tasteMemoryPath, nextContent, 'utf8');
}

function buildGbrainPageBody(finding: DesignTasteConsensusFinding): string {
  return [
    `# Design taste jury — ${finding.surfaceId}`,
    '',
    `Queue: ${finding.queueTag}`,
    `Rank: ${finding.rank}`,
    `Consensus score: ${finding.consensusScore}`,
    '',
    `## Finding`,
    finding.title,
    '',
    finding.summary,
    '',
    `## Benchmarks`,
    ...finding.benchmarkRefs.map(reference => `- ${reference}`),
    '',
    finding.compArtifactPath
      ? `## Comp artifact\n${finding.compArtifactPath}`
      : '',
  ]
    .filter(line => line.length > 0)
    .join('\n');
}

async function writeFindingToGbrain(
  finding: DesignTasteConsensusFinding
): Promise<boolean> {
  const slug = `design-taste-jury/${finding.id.replaceAll(':', '-')}`;

  return new Promise(resolve => {
    const child = spawn('gbrain', ['write', slug, '--stdin'], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 15_000);

    child.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      resolve(code === 0);
    });

    child.stdin.write(buildGbrainPageBody(finding));
    child.stdin.end();
  });
}

export async function persistDesignTasteFindings(params: {
  readonly findings: readonly DesignTasteConsensusFinding[];
  readonly reviewer: string;
  readonly linearIssueId: string;
}): Promise<{ tasteMemoryWritten: boolean; gbrainWritten: boolean }> {
  const tasteFindings = params.findings.filter(
    finding => finding.queueTag === 'taste'
  );

  if (tasteFindings.length === 0) {
    return { tasteMemoryWritten: false, gbrainWritten: false };
  }

  let tasteMemoryWritten = false;
  let gbrainWritten = false;

  for (const finding of tasteFindings) {
    await appendDesignTasteMemoryEntry({
      timestamp: new Date().toISOString(),
      surfaceId: finding.surfaceId,
      surfaceName: finding.surfaceId,
      direction: finding.summary,
      decision: 'accepted',
      notes: `Jury rank ${finding.rank}; benchmarks: ${finding.benchmarkRefs.join(', ')}`,
      reviewer: params.reviewer,
      linearIssueId: params.linearIssueId,
    });
    tasteMemoryWritten = true;

    if (await writeFindingToGbrain(finding)) {
      gbrainWritten = true;
    }
  }

  return { tasteMemoryWritten, gbrainWritten };
}
