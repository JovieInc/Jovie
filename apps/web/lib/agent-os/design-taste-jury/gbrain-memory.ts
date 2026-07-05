import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getDesignTasteMemoryPath,
  resolveDesignTasteJuryRunDirectory,
} from './paths';
import type {
  DesignTasteJuryConsensus,
  DesignTasteJuryDisposition,
} from './types';

const TASTE_MEMORY_HEADER = `# Design taste memory

Persistent accepted/rejected design directions for Design Lab runs.
Each entry records surface, direction, decision, notes, reviewer, and timestamp.
`;

export interface DesignTasteGbrainWriteResult {
  readonly localMemoryWritten: boolean;
  readonly runArtifactPath: string;
}

interface TasteMemoryEntry {
  readonly timestamp: string;
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly direction: string;
  readonly decision: 'accepted' | 'rejected';
  readonly notes: string;
  readonly reviewer: string;
  readonly linearIssueId: string;
}

function formatTasteMemoryEntry(entry: TasteMemoryEntry): string {
  const notesBlock = entry.notes
    ? `\nNotes: ${entry.notes.trim()}`
    : '\nNotes: —';

  return [
    `## ${entry.timestamp} — ${entry.surfaceId} — ${entry.decision}`,
    `Surface: ${entry.surfaceName}`,
    `Direction: ${entry.direction.trim()}`,
    `Decision: ${entry.decision}`,
    `Linear: ${entry.linearIssueId}`,
    `Reviewer: ${entry.reviewer}`,
    notesBlock,
    '',
  ].join('\n');
}

async function appendLocalDesignTasteMemoryEntry(
  entry: TasteMemoryEntry
): Promise<void> {
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
      ? `${existing.trimEnd()}\n\n${formatTasteMemoryEntry(entry)}`
      : `${TASTE_MEMORY_HEADER.trim()}\n\n${formatTasteMemoryEntry(entry)}`;

  await fs.writeFile(tasteMemoryPath, nextContent, 'utf8');
}

function mapDispositionToDecision(
  disposition: DesignTasteJuryDisposition
): 'accepted' | 'rejected' {
  return disposition === 'taste' ? 'rejected' : 'accepted';
}

export async function writeDesignTasteGbrainMemory(params: {
  readonly runId: string;
  readonly consensus: DesignTasteJuryConsensus;
  readonly reviewer?: string;
}): Promise<DesignTasteGbrainWriteResult> {
  const reviewer = params.reviewer ?? 'design-taste-jury';
  const runDirectory = resolveDesignTasteJuryRunDirectory(params.runId);
  await fs.mkdir(runDirectory, { recursive: true });

  const tasteEntries = params.consensus.findings
    .filter(finding => finding.disposition === 'taste')
    .map(finding => ({
      timestamp: params.consensus.computedAt,
      surfaceId: params.consensus.surfaceId,
      surfaceName: params.consensus.surfaceId,
      direction: finding.summary,
      decision: mapDispositionToDecision(finding.disposition),
      notes: `Jury consensus rank ${finding.consensusRank} (${finding.voteCount} jurors).`,
      reviewer,
      linearIssueId: params.runId,
    }));

  for (const entry of tasteEntries) {
    await appendLocalDesignTasteMemoryEntry(entry);
  }

  const artifactPath = path.join(runDirectory, 'gbrain-taste-writes.json');
  await fs.writeFile(
    artifactPath,
    `${JSON.stringify(
      {
        runId: params.runId,
        surfaceId: params.consensus.surfaceId,
        writtenAt: new Date().toISOString(),
        entries: tasteEntries,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return {
    localMemoryWritten: tasteEntries.length > 0,
    runArtifactPath: artifactPath,
  };
}
