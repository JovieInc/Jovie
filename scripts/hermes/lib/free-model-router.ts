/**
 * OpenRouter free-model rotator with Ollama fallback.
 *
 * Selects the best currently-free model from OpenRouter (filtered to ':free'
 * variants), falls through to lower-ranked free models on 429 / 5xx, and
 * finally falls back to a local Ollama instance running Qwen 3 4B.
 *
 * Cost contract: never selects a paid model. If OpenRouter ever returns a
 * non-zero cost for a request, the model is ejected and we alert.
 *
 * Lives on the Air; not bundled with the web app.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HERMES_HOME = process.env.HERMES_HOME ?? join(homedir(), '.hermes');
const STATE_DIR = join(HERMES_HOME, 'state');
const RANKINGS_PATH = join(STATE_DIR, 'model-router-rankings.json');
const LOGS_DIR = join(HERMES_HOME, 'logs');
const COST_LOG = join(LOGS_DIR, 'cost.jsonl');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const OLLAMA_MODEL = process.env.HERMES_OLLAMA_MODEL ?? 'qwen3:4b-q4_K_M';

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface ChatOptions {
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Hint for the router: which capability class is needed. */
  readonly need?: 'routing' | 'reasoning' | 'summarize';
  /** Caller identifier for cost log attribution. */
  readonly caller: string;
}

export interface ChatResult {
  readonly text: string;
  readonly model: string;
  readonly source: 'openrouter' | 'ollama';
  readonly latencyMs: number;
}

interface ModelRanking {
  readonly id: string;
  readonly score: number;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly failureCount: number;
  readonly capabilities: ReadonlyArray<'routing' | 'reasoning' | 'summarize'>;
}

interface Rankings {
  readonly updatedAt: string;
  readonly models: ReadonlyArray<ModelRanking>;
}

const SEED_RANKINGS: Rankings = {
  updatedAt: '1970-01-01T00:00:00Z',
  models: [
    {
      id: 'deepseek/deepseek-r1:free',
      score: 90,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      capabilities: ['reasoning', 'routing', 'summarize'],
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      score: 80,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      capabilities: ['reasoning', 'routing', 'summarize'],
    },
    {
      id: 'qwen/qwen-2.5-72b-instruct:free',
      score: 75,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      capabilities: ['reasoning', 'routing', 'summarize'],
    },
    {
      id: 'google/gemini-2.0-flash-exp:free',
      score: 70,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      capabilities: ['routing', 'summarize'],
    },
    {
      id: 'mistralai/mistral-small-3:free',
      score: 60,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      capabilities: ['routing', 'summarize'],
    },
  ],
};

function loadRankings(): Rankings {
  if (!existsSync(RANKINGS_PATH)) {
    return SEED_RANKINGS;
  }
  try {
    return JSON.parse(readFileSync(RANKINGS_PATH, 'utf8')) as Rankings;
  } catch {
    return SEED_RANKINGS;
  }
}

function saveRankings(rankings: Rankings): void {
  writeFileSync(RANKINGS_PATH, JSON.stringify(rankings, null, 2));
}

function logCost(entry: Record<string, unknown>): void {
  try {
    const line = `${JSON.stringify({ ...entry, ts: new Date().toISOString() })}\n`;
    writeFileSync(COST_LOG, line, { flag: 'a' });
  } catch {
    // Best effort; never throw from logging.
  }
}

function recordOutcome(modelId: string, outcome: 'success' | 'failure'): void {
  const rankings = loadRankings();
  const now = new Date().toISOString();
  const next: Rankings = {
    updatedAt: now,
    models: rankings.models.map(m => {
      if (m.id !== modelId) return m;
      if (outcome === 'success') {
        return {
          ...m,
          lastSuccessAt: now,
          failureCount: 0,
          score: Math.min(100, m.score + 1),
        };
      }
      return {
        ...m,
        lastFailureAt: now,
        failureCount: m.failureCount + 1,
        score: Math.max(0, m.score - 5),
      };
    }),
  };
  saveRankings(next);
}

function pickCandidates(need: ChatOptions['need']): ReadonlyArray<string> {
  const rankings = loadRankings();
  const filtered = need
    ? rankings.models.filter(m => m.capabilities.includes(need))
    : rankings.models;
  return [...filtered]
    .sort((a, b) => b.score - a.score)
    .filter(m => m.failureCount < 5)
    .map(m => m.id);
}

async function callOpenRouter(
  modelId: string,
  messages: ReadonlyArray<ChatMessage>,
  options: ChatOptions
): Promise<ChatResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY missing');
  }
  const start = Date.now();
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://jov.ie',
      'X-Title': 'Jovie Hermes (Air)',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter ${response.status} for ${modelId}: ${await response.text().catch(() => '')}`
    );
  }

  const data = (await response.json()) as {
    choices?: ReadonlyArray<{ message?: { content?: string } }>;
    usage?: { total_cost?: number };
  };

  const cost = data.usage?.total_cost ?? 0;
  if (cost > 0) {
    logCost({
      model: modelId,
      cost,
      caller: options.caller,
      source: 'openrouter',
    });
    throw new Error(
      `PAID_MODEL_DETECTED model=${modelId} cost=${cost}; ejecting`
    );
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  return {
    text,
    model: modelId,
    source: 'openrouter',
    latencyMs: Date.now() - start,
  };
}

async function callOllama(
  messages: ReadonlyArray<ChatMessage>,
  options: ChatOptions
): Promise<ChatResult> {
  const start = Date.now();
  const response = await fetch(`${OLLAMA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.3,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama ${response.status}: ${await response.text().catch(() => '')}`
    );
  }

  const data = (await response.json()) as {
    choices?: ReadonlyArray<{ message?: { content?: string } }>;
  };

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model: OLLAMA_MODEL,
    source: 'ollama',
    latencyMs: Date.now() - start,
  };
}

export async function chat(
  messages: ReadonlyArray<ChatMessage>,
  options: ChatOptions
): Promise<ChatResult> {
  const candidates = pickCandidates(options.need);

  for (const modelId of candidates) {
    try {
      const result = await callOpenRouter(modelId, messages, options);
      recordOutcome(modelId, 'success');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('429') || msg.includes('rate');
      const isPaid = msg.includes('PAID_MODEL_DETECTED');
      recordOutcome(modelId, 'failure');
      if (isPaid) {
        // Mark as a hard ejection; never retry this model until explicit reset.
        const rankings = loadRankings();
        saveRankings({
          updatedAt: new Date().toISOString(),
          models: rankings.models.map(m =>
            m.id === modelId ? { ...m, failureCount: 999, score: 0 } : m
          ),
        });
      }
      logCost({
        event: 'router_fallthrough',
        model: modelId,
        reason: isRateLimit ? 'rate_limit' : isPaid ? 'paid_detected' : 'error',
        caller: options.caller,
      });
      // Continue to next candidate.
    }
  }

  // All OpenRouter free models exhausted; fall back to Ollama.
  try {
    const result = await callOllama(messages, options);
    logCost({
      event: 'ollama_fallback',
      caller: options.caller,
      latencyMs: result.latencyMs,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logCost({ event: 'all_unavailable', caller: options.caller, error: msg });
    throw new Error(`All free model paths unavailable: ${msg}`);
  }
}

/** Probe a single model with a tiny prompt; used by free-model-health.ts. */
export async function probeModel(modelId: string): Promise<{
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}> {
  const start = Date.now();
  try {
    await callOpenRouter(
      modelId,
      [{ role: 'user', content: 'reply with the single word OK' }],
      { maxTokens: 5, caller: 'free-model-health', need: 'routing' }
    );
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function listRankings(): Rankings {
  return loadRankings();
}
