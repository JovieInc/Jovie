#!/usr/bin/env tsx
/**
 * Daily Briefing — Hermes-Air
 *
 * Runs at 07:00 local. Pulls yesterday's:
 *  - merged PRs
 *  - new Linear issues filed by hermes-air
 *  - voice-memo ingest count
 *  - cost log (should always be $0)
 *
 * Asks the free-model-router to compose a brief (prefer top-tier free model).
 * Sends as a single Telegram message.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { chat } from '../lib/free-model-router';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendTelegram } from '../lib/telegram-client';

const JOB = 'daily-briefing';

function yesterdayRange(): { since: string; until: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3_600 * 1000);
  yesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(yesterday.getTime() + 24 * 3_600 * 1000);
  return {
    since: yesterday.toISOString(),
    until: endOfYesterday.toISOString(),
  };
}

function mergedPrsYesterday(): ReadonlyArray<{
  title: string;
  number: number;
  url: string;
}> {
  try {
    const json = execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'merged',
        '--limit',
        '40',
        '--json',
        'title,number,url,mergedAt',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    const prs = JSON.parse(json) as ReadonlyArray<{
      title: string;
      number: number;
      url: string;
      mergedAt: string;
    }>;
    const { since, until } = yesterdayRange();
    return prs.filter(p => p.mergedAt >= since && p.mergedAt < until);
  } catch {
    return [];
  }
}

function countLinesSince(path: string, sinceIso: string): number {
  if (!existsSync(path)) return 0;
  try {
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    return lines.filter(line => {
      try {
        const parsed = JSON.parse(line) as { ts?: string };
        return parsed.ts ? parsed.ts >= sinceIso : false;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

function totalPaidSpendYesterday(): number {
  if (!existsSync(HERMES_PATHS.costLog)) return 0;
  const { since, until } = yesterdayRange();
  try {
    return readFileSync(HERMES_PATHS.costLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line) as { ts?: string; cost?: number };
        } catch {
          return null;
        }
      })
      .filter(
        (p): p is { ts: string; cost: number } =>
          p !== null &&
          typeof p.ts === 'string' &&
          typeof p.cost === 'number' &&
          p.ts >= since &&
          p.ts < until
      )
      .reduce((sum, p) => sum + p.cost, 0);
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const { since } = yesterdayRange();
    const merged = mergedPrsYesterday();
    const voiceMemos = countLinesSince(HERMES_PATHS.voiceMemoLog, since);
    const dispatches = countLinesSince(HERMES_PATHS.dispatchLog, since);
    const paidSpend = totalPaidSpendYesterday();

    const context = JSON.stringify(
      {
        mergedPrs: merged.map(p => `#${p.number} ${p.title}`),
        voiceMemosIngested: voiceMemos,
        tasksDispatched: dispatches,
        paidSpendUsd: paidSpend,
      },
      null,
      2
    );

    const result = await chat(
      [
        {
          role: 'system',
          content:
            'You are Hermes, an always-on chief-of-staff for a pre-PMF founder. Write a terse morning briefing (≤200 words, Markdown). Lead with what shipped, then what to focus on today. No emoji except where signaling. Plain language. No filler.',
        },
        {
          role: 'user',
          content: `Yesterday's data (UTC):\n\`\`\`json\n${context}\n\`\`\``,
        },
      ],
      { caller: JOB, need: 'reasoning', maxTokens: 600, temperature: 0.4 }
    );

    await sendTelegram(`*Morning brief*\n\n${result.text.trim()}`);
    logJobEvent({
      job: JOB,
      event: 'sent',
      mergedCount: merged.length,
      voiceMemos,
      dispatches,
      paidSpend,
      modelUsed: result.model,
    });
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
