/**
 * Jovie helpfulness eval runner (live model).
 *
 * Builds the production system prompt for a synthetic artist, asks the chat
 * model each case, mirrors the production persist gate, runs the
 * deterministic hard checks, then grades with a judge.
 *
 * All model calls go to Cloudflare Workers AI (startup credits). The AI
 * Gateway is never used: Gateway cash is reserved for production traffic.
 *
 *   CLOUDFLARE_ACCOUNT_ID=... pnpm --filter @jovie/web eval:helpfulness -- \
 *     --judge strong --out .eval-results/jovie-helpfulness/latest.json
 *
 * Flags:
 *   --judge strong | cheap | none | <@cf model>  (default cheap)
 *   --model <@cf model>                         subject (default glm-5.3)
 *   --subset ci                                 7-case subset
 *   --case <id>                                 one case (repeatable)
 *   --out <path>                                JSON report path
 *   --concurrency <n>                           default 3
 *   --publish-gbrain                            append to gbrain metrics/jovie-helpfulness
 *   --allow-gateway-spend                       required to even read a
 *                                               Gateway key; still unused
 *
 * Cost: Workers AI credits only, about 10k input tokens per case.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import {
  buildSystemPromptParts,
  joinSystemPromptParts,
} from '@/lib/chat/system-prompt';
import { resolveChatToolStepLimit } from '@/lib/chat/tool-step-limit';
import {
  ASSISTANT_REPLY_FALLBACK,
  gateAssistantReply,
} from '@/lib/chat/voice-lint';
import { HELPFULNESS_CASES, type HelpfulnessCase } from './cases';
import { buildEvalToolSpecs } from './eval-tools';
import { buildFixture } from './fixtures';
import {
  HELPFULNESS_METRIC_SLUG,
  type HelpfulnessRunRow,
  parseHistory,
  renderMetricPage,
} from './publish';
import {
  buildJudgePrompt,
  type CaseResult,
  type EvalReply,
  type EvalToolCall,
  type JudgeVerdict,
  judgeScore,
  parseJudgeVerdict,
  runHardChecks,
  scoreCase,
  summarize,
} from './scoring';
import { HELPFULNESS_EVAL_VERSION } from './spec';
import {
  type WaiMessage,
  WORKERS_AI_CHEAP_JUDGE,
  WORKERS_AI_STRONG_JUDGE,
  WORKERS_AI_SUBJECT_MODEL,
  type WorkersAiConfig,
  workersAiChat,
} from './workers-ai';

/** Hard cap on cases per run so a loop can never fan out unbounded spend. */
export const MAX_CASES_PER_RUN = 30;

interface Args {
  judge: string;
  subset: string | null;
  cases: string[];
  out: string | null;
  concurrency: number;
  model: string;
  allowGatewaySpend: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    judge: 'cheap',
    subset: null,
    cases: [],
    out: null,
    concurrency: 3,
    model: WORKERS_AI_SUBJECT_MODEL,
    allowGatewaySpend: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--allow-gateway-spend') {
      args.allowGatewaySpend = true;
      continue;
    }
    if (flag === '--judge' && value) args.judge = value;
    else if (flag === '--subset' && value) args.subset = value;
    else if (flag === '--case' && value) args.cases.push(value);
    else if (flag === '--out' && value) args.out = value;
    else if (flag === '--concurrency' && value)
      args.concurrency = Math.max(1, Math.min(5, Number(value) || 1));
    else if (flag === '--model' && value) args.model = value;
    else continue;
    i += 1;
  }
  return args;
}

/**
 * Gateway guard: this runner has no Gateway path. A Gateway key in the
 * environment is refused unless the operator explicitly opted in, so a
 * future edit cannot silently start spending Gateway cash.
 */
export function assertNoGatewaySpend(
  env: NodeJS.ProcessEnv,
  allowGatewaySpend: boolean
): void {
  if (allowGatewaySpend) return;
  const gatewayVars = Object.keys(env).filter(
    key => /GATEWAY.*(KEY|TOKEN)/i.test(key) && Boolean(env[key])
  );
  if (gatewayVars.length > 0) {
    throw new Error(
      `Refusing to run with AI Gateway credentials present (${gatewayVars.join(', ')}). Unset them or pass --allow-gateway-spend.`
    );
  }
}

/** wrangler OAuth tokens live about an hour; refresh well before that. */
const WRANGLER_TOKEN_TTL_MS = 20 * 60_000;

function resolveWorkersAiConfig(): WorkersAiConfig {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required.');
  const fixed = process.env.CLOUDFLARE_API_TOKEN ?? '';
  if (fixed) return { accountId, token: () => fixed };
  let cached = '';
  let fetchedAt = 0;
  const token = () => {
    if (!cached || Date.now() - fetchedAt > WRANGLER_TOKEN_TTL_MS) {
      cached =
        execFileSync('npx', ['-y', 'wrangler@4', 'auth', 'token'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .trim()
          .split('\n')
          .at(-1)
          ?.trim() ?? '';
      fetchedAt = Date.now();
    }
    if (!cached) {
      throw new Error(
        'CLOUDFLARE_API_TOKEN is required (or run `wrangler login` on this host).'
      );
    }
    return cached;
  };
  token();
  return { accountId, token };
}

const PRO_ACCOUNT = {
  email: null,
  plan: 'pro',
  displayPlan: 'Pro',
  isPro: true,
  billingVerification: 'verified' as const,
  planMismatch: null,
  usage: { weeklyLimit: 500, used: 12, remaining: 488, resetAt: null },
  entitlements: {
    aiCanUseTools: true,
    canAccessMerchCreation: true,
    canGenerateAlbumArt: true,
    canAccessAdvancedAnalytics: true,
  },
  flags: { merchMvp: true },
  billing: { hasStripeCustomer: true, hasStripeSubscription: true },
};

type Chat = ReturnType<typeof workersAiChat>;

function parseArgsJson(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return { raw };
  }
}

async function askJovie(
  chat: Chat,
  testCase: HelpfulnessCase,
  now: Date,
  model: string
): Promise<{
  reply: EvalReply;
  usage: { input: number; output: number };
  ms: number;
}> {
  const fixture = buildFixture(testCase.fixture, now);
  const knowledge = selectKnowledgeContext(
    [
      testCase.ask,
      ...(testCase.history ?? [])
        .filter(t => t.role === 'user')
        .map(t => t.text),
    ].join(' ')
  );
  const parts = buildSystemPromptParts(fixture.artist, [...fixture.releases], {
    aiCanUseTools: true,
    aiWeeklyMessageLimit: 500,
    insightsEnabled: true,
    knowledgeContext: knowledge || undefined,
    accountContext: PRO_ACCOUNT,
  });
  const specs = buildEvalToolSpecs(fixture);
  const tools = specs.map(spec => ({
    type: 'function' as const,
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  }));
  const messages: WaiMessage[] = [
    { role: 'system', content: joinSystemPromptParts(parts) },
    ...(testCase.history ?? []).map(turn => ({
      role: turn.role,
      content: turn.text,
    })),
    { role: 'user', content: testCase.ask },
  ];

  const toolCalls: EvalToolCall[] = [];
  const usage = { input: 0, output: 0 };
  const started = Date.now();
  let text = '';
  // Same step budget as the production paid plan.
  for (let step = 0; step < resolveChatToolStepLimit(true); step += 1) {
    const result = await chat({ model, messages, tools });
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    const calls = result.message.tool_calls ?? [];
    text = result.message.content ?? '';
    if (calls.length === 0) break;
    messages.push({
      role: 'assistant',
      content: result.message.content ?? null,
      tool_calls: calls,
    });
    for (const call of calls) {
      const spec = specs.find(s => s.name === call.function.name);
      const input = parseArgsJson(call.function.arguments);
      const output = spec
        ? spec.execute(input)
        : { error: `unknown tool ${call.function.name}` };
      toolCalls.push({ name: call.function.name, input, output });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }

  // Mirror the production persist gate (app/api/chat/route.ts onFinish).
  const gated = gateAssistantReply(text);
  const persistedAsFallback =
    text.trim().length > 0 && gated.text === ASSISTANT_REPLY_FALLBACK;
  return {
    reply: {
      text: persistedAsFallback ? text : gated.text,
      toolCalls,
      persistedAsFallback,
    },
    usage,
    ms: Date.now() - started,
  };
}

function judgeModel(spec: string): string | null {
  if (spec === 'none') return null;
  if (spec === 'cheap') return WORKERS_AI_CHEAP_JUDGE;
  if (spec === 'strong') return WORKERS_AI_STRONG_JUDGE;
  if (spec.startsWith('@cf/')) return spec;
  throw new Error(
    `Unknown judge ${spec}. Use strong, cheap, none or a Workers AI @cf/ model.`
  );
}

async function judge(
  chat: Chat,
  model: string | null,
  prompt: string
): Promise<JudgeVerdict | null> {
  if (!model) return null;
  const result = await chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    // Reasoning judges spend most of the budget thinking before the JSON.
    maxTokens: 16_000,
  });
  const verdict = parseJudgeVerdict(result.message.content ?? '');
  if (!verdict) {
    throw new Error(
      `unparseable verdict: ${(result.message.content ?? '<empty>').slice(0, 200)}`
    );
  }
  return verdict;
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export function selectCases(args: {
  subset: string | null;
  cases: readonly string[];
}): readonly HelpfulnessCase[] {
  let cases = HELPFULNESS_CASES;
  if (args.subset === 'ci') cases = cases.filter(c => c.ciSubset);
  if (args.cases.length > 0)
    cases = cases.filter(c => args.cases.includes(c.id));
  if (cases.length > MAX_CASES_PER_RUN) {
    throw new Error(
      `${cases.length} cases exceeds the ${MAX_CASES_PER_RUN}-case cap per run.`
    );
  }
  return cases;
}

interface CalibrationExample {
  readonly id: string;
  readonly ranAt: string;
  readonly reply: EvalReply;
  readonly reference: JudgeVerdict['scores'];
}

/**
 * Grade the hand-checked calibration set with each candidate judge and print
 * the mean absolute error (0-100 points) against the reference grades.
 */
async function calibrate(chat: Chat, judges: readonly string[]): Promise<void> {
  const file = JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../tests/eval/helpfulness/calibration.json'
      ),
      'utf8'
    )
  ) as { examples: CalibrationExample[] };
  for (const model of judges) {
    const rows = await mapLimit(file.examples, 1, async example => {
      const testCase = HELPFULNESS_CASES.find(c => c.id === example.id);
      if (!testCase) throw new Error(`unknown calibration case ${example.id}`);
      const now = new Date(example.ranAt);
      const verdict = await judge(
        chat,
        model,
        buildJudgePrompt({
          testCase,
          fixture: buildFixture(testCase.fixture, now),
          today: now.toISOString().slice(0, 10),
          reply: example.reply,
        })
      ).catch(error => {
        process.stderr.write(
          `calibrate ${model} ${example.id}: ${String(error).slice(0, 300)}\n`
        );
        return null;
      });
      const want = judgeScore(example.reference);
      const got = verdict ? judgeScore(verdict.scores) : null;
      return { id: example.id, want, got };
    });
    const scored = rows.filter(r => r.got !== null);
    const mae =
      scored.reduce((sum, r) => sum + Math.abs((r.got ?? 0) - r.want), 0) /
      Math.max(1, scored.length);
    process.stdout.write(
      `${model}: MAE ${mae.toFixed(1)} over ${scored.length}/${rows.length} ${rows
        .map(r => `${r.id}=${r.got ?? 'x'}/${r.want}`)
        .join(' ')}\n`
    );
  }
}

/** Append this run to the gbrain metric page Summer reads weekly. */
function publishToGbrain(row: HelpfulnessRunRow): void {
  let existing = '';
  try {
    existing = execFileSync('gbrain', ['get', HELPFULNESS_METRIC_SLUG], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    existing = '';
  }
  const page = renderMetricPage([...parseHistory(existing), row]);
  execFileSync('gbrain', ['put', HELPFULNESS_METRIC_SLUG], {
    input: page,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  process.stdout.write(`published: gbrain ${HELPFULNESS_METRIC_SLUG}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertNoGatewaySpend(process.env, args.allowGatewaySpend);
  if (process.argv.includes('--calibrate')) {
    await calibrate(
      workersAiChat(resolveWorkersAiConfig()),
      args.judge === 'cheap' || args.judge === 'strong' || args.judge === 'none'
        ? [WORKERS_AI_STRONG_JUDGE, WORKERS_AI_CHEAP_JUDGE]
        : args.judge.split(',')
    );
    return;
  }
  if (!args.model.startsWith('@cf/')) {
    throw new Error('Subject model must be a Workers AI @cf/ model.');
  }
  const judgeId = judgeModel(args.judge);
  const chat = workersAiChat(resolveWorkersAiConfig());
  const now = new Date();
  const today = `${now.toISOString().slice(0, 10)} (${now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, UTC)`;
  const cases = selectCases(args);

  const rows = await mapLimit(cases, args.concurrency, async testCase => {
    try {
      const turn = await askJovie(chat, testCase, now, args.model);
      const hardChecks = runHardChecks(testCase, turn.reply);
      const fixture = buildFixture(testCase.fixture, now);
      const verdict = await judge(
        chat,
        judgeId,
        buildJudgePrompt({ testCase, fixture, today, reply: turn.reply })
      ).catch(error => {
        process.stderr.write(
          `judge failed for ${testCase.id}: ${String(error)}\n`
        );
        return null;
      });
      const result = scoreCase(testCase.id, hardChecks, verdict);
      process.stderr.write(
        `${result.passed ? 'PASS' : 'FAIL'} ${String(result.score).padStart(3)} ${testCase.id}\n`
      );
      return {
        result,
        ask: testCase.ask,
        reply: turn.reply,
        usage: turn.usage,
        ms: turn.ms,
      };
    } catch (error) {
      process.stderr.write(`ERROR ${testCase.id}: ${String(error)}\n`);
      const result: CaseResult = scoreCase(
        testCase.id,
        [{ id: 'turn_error', ok: false, detail: String(error).slice(0, 200) }],
        null
      );
      return {
        result,
        ask: testCase.ask,
        reply: { text: '', toolCalls: [] },
        usage: { input: 0, output: 0 },
        ms: 0,
      };
    }
  });

  const summary = summarize(rows.map(r => r.result));
  const latencies = rows
    .map(r => r.ms)
    .filter(ms => ms > 0)
    .sort((a, b) => a - b);
  const pct = (p: number) =>
    latencies.length
      ? latencies[
          Math.min(latencies.length - 1, Math.floor(p * latencies.length))
        ]
      : 0;
  const report = {
    schema: 'jovie.helpfulness-eval/v1',
    version: HELPFULNESS_EVAL_VERSION,
    ranAt: now.toISOString(),
    provider: 'workers-ai',
    model: args.model,
    judge: judgeId ?? 'none',
    subset: args.subset ?? 'all',
    summary: {
      ...summary,
      latencyMs: { p50: pct(0.5), p95: pct(0.95) },
      tokens: {
        input: rows.reduce((s, r) => s + r.usage.input, 0),
        output: rows.reduce((s, r) => s + r.usage.output, 0),
      },
    },
    cases: rows,
  };

  process.stdout.write(
    `\nJovie helpfulness ${HELPFULNESS_EVAL_VERSION} (${args.model}, judge ${judgeId ?? 'none'}): score ${summary.score}/100, pass ${Math.round(summary.passRate * 100)}%, hard checks ${Math.round(summary.hardPassRate * 100)}%, n=${summary.cases}\n`
  );
  if (process.argv.includes('--publish-gbrain')) {
    publishToGbrain({
      ranAt: report.ranAt,
      version: report.version,
      model: report.model,
      judge: report.judge,
      subset: report.subset,
      score: summary.score,
      passRate: summary.passRate,
      hardPassRate: summary.hardPassRate,
      behaviorMeans: summary.behaviorMeans as Record<string, number>,
      latencyP50Ms: report.summary.latencyMs.p50,
      latencyP95Ms: report.summary.latencyMs.p95,
      cases: summary.cases,
      worst: [...rows]
        .sort((a, b) => a.result.score - b.result.score)
        .slice(0, 5)
        .map(r => ({
          id: r.result.id,
          score: r.result.score,
          // A failed hard check caps the score, so name it before the
          // judge's note.
          why: [
            r.result.hardChecks
              .filter(c => !c.ok)
              .map(c => `${c.id}${c.detail ? ` (${c.detail})` : ''}`)
              .join('; '),
            r.result.judge?.why ?? '',
          ]
            .filter(Boolean)
            .join(' | '),
        })),
    });
  }
  if (args.out) {
    const outPath = resolve(process.cwd(), args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`report: ${outPath}\n`);
  }
}

if (process.argv[1]?.endsWith('helpfulness/run.ts')) {
  main().catch(error => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
}
