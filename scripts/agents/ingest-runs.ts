#!/usr/bin/env tsx
/**
 * Coding-agent run ingestion (JOV-6508).
 *
 * Polls external coding-agent providers for sessions completed since the
 * last watermark and upserts receipts into `coding_agent_runs`
 * (ON CONFLICT (source, source_run_id) DO UPDATE). Read-only on providers.
 *
 * Sources:
 *   hyperagent — MCP list_threads/get_thread at hyperagent.com (token file
 *                ~/.config/hyperagent/mcp-oauth.json, or HYPERAGENT_MCP_TOKEN)
 *   devin      — Devin API v1, gated on DEVIN_API_KEY (skips when absent)
 *   cursor/grokbot/manual — reserved enum values; no importer yet
 *
 * Usage: doppler run -p jovie-web -c dev -- pnpm tsx scripts/agents/ingest-runs.ts [--backfill-days 30]
 */

import { createHash } from 'node:crypto';

import {
  type CodingAgentRunUpsert,
  getSql,
  upsertCodingAgentRun,
} from './lib/coding-agent-runs-db';
import {
  DEVIN_SESSION_URL,
  DevinClient,
  devinSessionFinished,
} from './lib/devin-api';
import { loadHermesEnv } from './lib/hermes-env';
import {
  HYPERAGENT_THREAD_URL,
  HyperagentClient,
  hyperagentModelForAgentName,
} from './lib/hyperagent-mcp';
import { loadWatermark, saveWatermark } from './lib/watermark';

const JOB = 'coding-agent-ingest';
const MAX_THREADS_PER_RUN = Number(process.env.HYPERAGENT_MAX_THREADS ?? 200);

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const PR_URL_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;

function lastPrUrl(texts: string[]): string | null {
  let found: string | null = null;
  for (const t of texts) {
    for (const m of t.matchAll(PR_URL_RE)) found = m[0];
  }
  return found;
}

function countTools(
  contentBlocksJson: string | undefined,
  acc: Record<string, number>
): void {
  if (!contentBlocksJson) return;
  try {
    const blocks = JSON.parse(contentBlocksJson) as {
      type?: string;
      name?: string;
      tool_use_id?: string;
    }[];
    for (const b of blocks) {
      if (b.type === 'tool_use' && b.name) {
        acc[b.name] = (acc[b.name] ?? 0) + 1;
      }
    }
  } catch {
    // malformed block json — skip, never fail ingestion on telemetry shape
  }
}

async function ingestHyperagent(
  upsert: (r: CodingAgentRunUpsert) => Promise<void>,
  since: Date | null
): Promise<{ scanned: number; ingested: number }> {
  const client = await HyperagentClient.create();
  if (!client) {
    console.log(`[${JOB}] hyperagent: no MCP token, skipping`);
    return { scanned: 0, ingested: 0 };
  }

  const agents = new Map((await client.listAgents()).map(a => [a.id, a.name]));
  let scanned = 0;
  let ingested = 0;

  for await (const t of client.listThreads()) {
    if (scanned >= MAX_THREADS_PER_RUN) break;
    // Keyset is newest-first; stop once past the watermark window.
    if (since && new Date(t.updatedAt) < since) break;
    scanned++;

    const detail = await client.getThread(t.id, 50).catch(() => null);
    if (!detail || detail.isRunning || detail.awaitingApproval) continue;

    const toolsUsed: Record<string, number> = {};
    const texts: string[] = [];
    let promptText: string | null = null;
    for (const m of detail.messages) {
      countTools(m.contentBlocks, toolsUsed);
      if (typeof m.content === 'string') texts.push(m.content);
      if (typeof m.contentBlocks === 'string') texts.push(m.contentBlocks);
      if (!promptText && m.role === 'user' && typeof m.content === 'string') {
        promptText = m.content;
      }
    }

    const agentName = t.namedAgentId
      ? (agents.get(t.namedAgentId) ?? null)
      : null;
    const modelName = hyperagentModelForAgentName(agentName);

    await upsert({
      source: 'hyperagent',
      sourceRunId: t.id,
      sessionUrl: HYPERAGENT_THREAD_URL(t.id),
      agentId: t.namedAgentId,
      agentName,
      modelName,
      costUsd: null,
      costSource: 'estimated',
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
      toolsUsed,
      promptDigest: promptText ? sha256Hex(promptText) : null,
      prUrl: lastPrUrl(texts),
      linearIssueId: null,
      notes: modelName
        ? null
        : 'hyperagent MCP does not report model or billing; model inferred from agent name when possible',
      startedAt: t.createdAt,
      completedAt: t.updatedAt,
    });
    ingested++;
  }
  return { scanned, ingested };
}

async function ingestDevin(
  upsert: (r: CodingAgentRunUpsert) => Promise<void>,
  since: Date | null
): Promise<{ scanned: number; ingested: number }> {
  const client = DevinClient.create();
  if (!client) {
    console.log(`[${JOB}] devin: DEVIN_API_KEY not set, skipping`);
    return { scanned: 0, ingested: 0 };
  }

  const sessions = await client.listSessions();
  let scanned = 0;
  let ingested = 0;

  for (const s of sessions) {
    const updated = s.updated_at ?? s.created_at;
    if (since && updated && new Date(updated) < since) continue;
    if (!devinSessionFinished(s)) continue;
    scanned++;

    const detail = await client.getSession(s.session_id).catch(() => s);
    const model =
      (detail.model as string | undefined) ??
      (detail.structured_output?.model as string | undefined) ??
      null;
    const acu = detail.acu_consumed ?? null;

    await upsert({
      source: 'devin',
      sourceRunId: s.session_id,
      sessionUrl: DEVIN_SESSION_URL(s.session_id),
      agentId: null,
      agentName: 'devin',
      modelName: model,
      costUsd: null,
      costSource: 'estimated',
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
      toolsUsed: {},
      promptDigest: detail.title ? sha256Hex(detail.title) : null,
      prUrl: detail.pull_request?.url ?? null,
      linearIssueId: null,
      notes:
        [
          model
            ? null
            : 'devin API does not report model; fleet is pinned to SWE-2 by org config',
          acu != null ? `acu_consumed=${acu} (usd not reported by API)` : null,
        ]
          .filter(Boolean)
          .join('; ') || null,
      startedAt: detail.created_at ?? null,
      completedAt: detail.updated_at ?? null,
    });
    ingested++;
  }
  return { scanned, ingested };
}

async function main(): Promise<void> {
  loadHermesEnv();
  const backfillDays =
    Number(process.env.INGEST_BACKFILL_DAYS) ||
    Number(
      process.argv.find(a => a.startsWith('--backfill-days='))?.split('=')[1]
    ) ||
    30;
  const { lastIngestedAt } = loadWatermark();
  const since = lastIngestedAt
    ? new Date(lastIngestedAt)
    : new Date(Date.now() - backfillDays * 86_400_000);

  const sql = getSql();
  const upsert = async (r: CodingAgentRunUpsert) => {
    await upsertCodingAgentRun(sql, r);
  };

  const hg = await ingestHyperagent(upsert, since);
  const dv = await ingestDevin(upsert, since);

  saveWatermark(new Date().toISOString());
  console.log(
    `[${JOB}] done: hyperagent ${hg.ingested}/${hg.scanned} ingested, ` +
      `devin ${dv.ingested}/${dv.scanned} ingested`
  );
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});
