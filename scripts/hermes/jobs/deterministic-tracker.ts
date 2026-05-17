#!/usr/bin/env tsx
/**
 * Deterministic Tracker — Hermes-Air
 *
 * Self-improvement engine. Reads dispatch.jsonl, clusters intent shapes,
 * and files Linear issues proposing deterministic replacements for any
 * cluster that fires ≥5 times in the last 30 days.
 *
 * v1 clustering: bucket by (target, first 4 normalized tokens of text).
 * Good enough to surface the obvious "we keep asking the LLM to do X"
 * patterns. Can be replaced with embedding-based clustering later.
 */

import { existsSync, readFileSync } from 'node:fs';

import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { buildFollowUpBody, fileIssue } from '../lib/linear-client';

const JOB = 'deterministic-tracker';
const THRESHOLD = 5;
const WINDOW_DAYS = 30;

interface DispatchEntry {
  readonly target?: string;
  readonly text?: string;
  readonly ts?: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
}

function loadDispatches(): ReadonlyArray<DispatchEntry> {
  if (!existsSync(HERMES_PATHS.dispatchLog)) return [];
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 3_600 * 1000;
  return readFileSync(HERMES_PATHS.dispatchLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as DispatchEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is DispatchEntry => {
      if (!entry) return false;
      if (!entry.ts) return true;
      return new Date(entry.ts).getTime() >= cutoff;
    });
}

function cluster(entries: ReadonlyArray<DispatchEntry>): ReadonlyArray<{
  key: string;
  count: number;
  samples: ReadonlyArray<string>;
}> {
  const map = new Map<string, { count: number; samples: string[] }>();
  for (const entry of entries) {
    if (!entry.text) continue;
    const key = `${entry.target ?? 'chief'}|${normalize(entry.text)}`;
    const bucket = map.get(key) ?? { count: 0, samples: [] };
    bucket.count += 1;
    if (bucket.samples.length < 3) bucket.samples.push(entry.text);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([key, bucket]) => ({
      key,
      count: bucket.count,
      samples: bucket.samples,
    }))
    .filter(c => c.count >= THRESHOLD)
    .sort((a, b) => b.count - a.count);
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const entries = loadDispatches();
    const clusters = cluster(entries);
    logJobEvent({
      job: JOB,
      event: 'analyzed',
      entryCount: entries.length,
      clusterCount: clusters.length,
    });

    for (const c of clusters) {
      const filed = await fileIssue({
        title: `Deterministic candidate: "${c.key}" (${c.count}× / ${WINDOW_DAYS}d)`,
        description: buildFollowUpBody({
          source: 'deterministic-tracker',
          followUp: `Hermes-air has dispatched the intent shape "${c.key}" ${c.count} times in the last ${WINDOW_DAYS} days. Consider replacing the LLM path with a deterministic script. Samples:\n\n${c.samples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
          whyItMatters:
            'Replacing a repeated LLM call with a deterministic script reduces cost variance, removes a self-healing dependency, and improves predictability.',
          classification: 'Candidate',
          acceptanceCriteria:
            'Pickup agent must first judge whether the pattern is stable enough to be scripted, or whether the LLM path is correct because the inputs genuinely vary.',
        }),
        source: `deterministic-tracker:${c.key}`,
      });
      logJobEvent({
        job: JOB,
        event: filed.success ? 'candidate_filed' : 'file_failed',
        key: c.key,
        count: c.count,
        identifier: filed.identifier,
        error: filed.error,
      });
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
