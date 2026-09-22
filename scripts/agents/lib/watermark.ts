/**
 * Watermark persistence for the ingestion poller (JOV-6508).
 * Small JSON file in ~/.hermes/state (or HERMES_STATE_DIR override) —
 * reruns ingest only new sessions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function stateDir(): string {
  return (
    process.env.HERMES_STATE_DIR ??
    join(process.env.HERMES_HOME ?? join(homedir(), '.hermes'), 'state')
  );
}

function filePath(): string {
  return join(stateDir(), 'coding-agent-ingest-watermark.json');
}

export function loadWatermark(): { lastIngestedAt: string | null } {
  const p = filePath();
  if (!existsSync(p)) return { lastIngestedAt: null };
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { lastIngestedAt: null };
  }
}

export function saveWatermark(iso: string): void {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(filePath(), JSON.stringify({ lastIngestedAt: iso }, null, 2));
}
