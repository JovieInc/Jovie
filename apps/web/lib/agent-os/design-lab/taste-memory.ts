import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDesignTasteMemoryPath } from './paths';
import type { TasteMemoryEntry } from './types';

const TASTE_MEMORY_HEADER = `# Design taste memory

Persistent accepted/rejected design directions for Design Lab runs.
Each entry records surface, direction, decision, notes, reviewer, and timestamp.
`;

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

export async function appendDesignTasteMemoryEntry(
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

export async function readDesignTasteMemoryExcerpt(
  maxChars = 1200
): Promise<string> {
  const tasteMemoryPath = getDesignTasteMemoryPath();

  try {
    const content = await fs.readFile(tasteMemoryPath, 'utf8');
    const trimmed = content.trim();
    if (trimmed.length <= maxChars) {
      return trimmed;
    }
    return `${trimmed.slice(trimmed.length - maxChars).trimStart()}`;
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }
    }
    throw error;
  }
}
