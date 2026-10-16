import { createHash } from 'node:crypto';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScriptedFallbackResponse } from '@/lib/chat/onboarding-script/respond';
import { STREAM_ERROR_LINE } from '@/lib/chat/onboarding-script/script';
import { type ExecuteChatTurnInput, executeChatTurn } from '@/lib/chat/run';
import { parseTokens } from '@/lib/chat/tokens';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import {
  reviseWritingPilot,
  type WritingPilotInput,
} from '@/lib/chat/writing-pilot';
import { CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import { runProductResponsePilot } from '../../../../scripts/invariants/jev-product-response-pilot.mjs';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('@ai-sdk/gateway', () => ({
  createGateway: () => mocks.select,
  gateway: vi.fn(),
}));
vi.mock('@/lib/observability/langfuse', () => ({
  startChatTurnLangfuseTrace: vi.fn(async () => ({
    endSuccess: vi.fn(),
    endError: vi.fn(),
  })),
}));

const original =
  'This artist has 0 Spotify followers. Review the profile next.';
const revised =
  'Spotify reports 0 followers for this artist. Review the profile next.';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const metadata = {
  gateway: {
    routing: { canonicalSlug: CHAT_MODEL_LIGHT, finalProvider: 'zai' },
  },
};
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function writer(text = original, revision = revised, gate?: Promise<void>) {
  return new MockLanguageModelV3({
    modelId: CHAT_MODEL_LIGHT,
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'writer',
            timestamp: new Date(),
            modelId: CHAT_MODEL_LIGHT,
          });
          controller.enqueue({ type: 'text-start', id: 'text' });
          controller.enqueue({ type: 'text-delta', id: 'text', delta: text });
          controller.enqueue({ type: 'text-end', id: 'text' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
            providerMetadata: metadata,
          });
          controller.close();
        },
      }),
    },
    doGenerate: async () => {
      await gate;
      return {
        content: [{ type: 'text' as const, text: revision }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage,
        response: { modelId: CHAT_MODEL_LIGHT },
        providerMetadata: metadata,
        warnings: [],
      };
    },
  });
}
function input() {
  const controller = new AbortController();
  const writingPilot: WritingPilotInput = {
    confirmation: {
      requestId: 'req',
      conversationId: 'conversation',
      spotifyArtistId: 'artist',
    },
    budget: {
      authorityRef: 'runner-reservation',
      maxOutputTokens: 200,
      deadlineAt: Date.now() + 10000,
    },
    brief: {
      audience: 'The selected artist',
      purpose: 'Acknowledge selection and invite profile review',
      allowedClaims: ['Spotify reports 0 followers for this artist.'],
      evidence: ['server-enrichment:artist; followers=0; checked=2026-10-15'],
      protectedFacts: ['0 is known. Ownership is unverified.'],
      ownershipConstraints: ['Selection does not establish ownership.'],
      language: 'en',
      approvedVoiceExamples: ['Name the next step.'],
    },
  };
  const part = {
    type: 'tool-confirmSpotifyArtist' as const,
    toolCallId: 'server-confirmation',
    state: 'output-available' as const,
    input: { spotifyArtistId: 'artist' },
    output: {
      action: 'spotify_artist_confirmed',
      spotifyArtistId: 'artist',
      artist: { id: 'artist', name: 'Test Artist', followers: 0 },
      summary: 'Artist selected; ownership unverified.',
    },
  };
  const turn: ExecuteChatTurnInput = {
    mode: 'onboarding',
    artistContext: null,
    releases: [],
    resolvedProfileId: null,
    resolvedConversationId: 'conversation',
    userId: null,
    userPlan: 'free',
    planLimits: {
      booleans: { aiCanUseTools: false },
      limits: { aiWeeklyMessageLimit: 10 },
    } as ExecuteChatTurnInput['planLimits'],
    insightsEnabled: false,
    forceLightModel: true,
    requestId: 'req',
    tools: {},
    uiMessages: [
      {
        id: 'private',
        role: 'user',
        parts: [{ type: 'text', text: 'PRIVATE HISTORY: person@example.com' }],
      },
    ],
    signal: controller.signal,
    writingPilot,
  };
  return {
    controller,
    run: {
      runId: 'run-1',
      sourceSha: 'a'.repeat(40),
      scope: 'synthetic product pilot',
      turn,
      confirmation: { requestId: 'req', conversationId: 'conversation', part },
      operatorContext: 'PRIVATE OPERATOR: ghp_notForEvaluation12345',
    },
  };
}
type SavedRun = {
  schema: string;
  fingerprint: string;
  revisionCount: number;
  artifacts: { kind: string; text: string; id: string; sha256: string }[];
  reviews: { receipt: { status: string } | null }[];
  terminal: {
    status: string;
    reason: string;
    artifactId: string | null;
    artifactSha256: string | null;
  } | null;
};
function persistence() {
  const rows = new Map<string, SavedRun>();
  const locks = new Map<string, Promise<unknown>>();
  const save = vi.fn(async (key: string, value: SavedRun) => {
    rows.set(key, structuredClone(value));
  });
  return {
    rows,
    save,
    withRun<T>(
      key: string,
      work: (store: {
        load: () => Promise<SavedRun | null>;
        save: (value: SavedRun) => Promise<void>;
      }) => Promise<T>
    ): Promise<T> {
      const next = (locks.get(key) ?? Promise.resolve()).then(() =>
        work({
          load: async () => structuredClone(rows.get(key) ?? null),
          save: value => save(key, value),
        })
      );
      locks.set(
        key,
        next.catch(() => {})
      );
      return next;
    },
  };
}
type Request = {
  fingerprint: string;
  questions: Record<string, unknown>;
  state: string;
};
async function cleanReview(request: Request) {
  return {
    answers: Object.fromEntries(
      Object.keys(request.questions).map(id => [
        id,
        { type: 'choice', choice: 'clean', confidence: 0.99 },
      ])
    ),
    response: { modelId: 'typesafe-ai/jev' },
    warnings: [],
    usage: { inputTokens: 30, outputTokens: 20 },
  };
}
function ports(evidence = persistence()) {
  const transport = vi.fn(cleanReview);
  return {
    evidence,
    transport,
    executeChatTurn: vi.fn(executeChatTurn),
    reviseWritingPilot: vi.fn(reviseWritingPilot),
    encodeToolEvents,
    parseTokens,
    createUIMessageStream: vi.fn(createUIMessageStream),
    createUIMessageStreamResponse: vi.fn(createUIMessageStreamResponse),
    buildScriptedFallbackResponse: vi.fn(buildScriptedFallbackResponse),
    evaluationOptions: vi.fn(async (request: Request) => ({
      approval: {
        fingerprint: request.fingerprint,
        dataApproved: true,
        fundingApproved: true,
        expiresAt: Date.now() + 10000,
        authorityRef: 'runner-reservation',
        availableUsd: 1,
        maxUsd: 0.01,
        estimatedUpperBoundUsd: 0.001,
      },
      readCurrentFingerprint: () => request.fingerprint,
      transport,
    })),
  };
}
function failFirstReview(p: ReturnType<typeof ports>, axis = 'voice-fit') {
  const clean = cleanReview;
  p.transport.mockImplementationOnce(async request => {
    const result = await clean(request);
    result.answers[`p1.${axis}`] = {
      type: 'choice',
      choice: 'violation',
      confidence: 0.99,
    };
    return result;
  });
}
async function readWire(response: Response | null) {
  expect(response).not.toBeNull();
  const raw = await response!.text();
  const chunks = raw
    .split('\n')
    .filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)));
  return {
    raw,
    chunks,
    text: chunks
      .filter(c => c.type === 'text-delta')
      .map(c => c.delta)
      .join(''),
  };
}
function saved(p: ReturnType<typeof ports>) {
  return [...p.evidence.rows.values()][0]!;
}

beforeEach(() => {
  mocks.select.mockReset();
  mocks.select.mockReturnValue(writer());
});

describe('runner-only buffered product response', () => {
  it('withholds the complete original until review AND terminal persistence finish', async () => {
    const { run } = input();
    const p = ports();
    const reviewGate = deferred();
    const persistGate = deferred();
    const clean = cleanReview;
    p.transport.mockImplementation(async request => {
      await reviewGate.promise;
      return clean(request);
    });
    const save = p.evidence.save.getMockImplementation()!;
    p.evidence.save.mockImplementation(async (key, state) => {
      if (state.terminal) await persistGate.promise;
      return save(key, state);
    });
    let settled = false;
    const pending = runProductResponsePilot(run, p).then(value => {
      settled = true;
      return value;
    });
    await vi.waitFor(() => expect(p.transport).toHaveBeenCalledTimes(1));
    expect(saved(p).artifacts[0]?.text).toBe(original);
    expect(settled).toBe(false);
    expect(p.createUIMessageStreamResponse).not.toHaveBeenCalled();
    reviewGate.resolve();
    await vi.waitFor(() =>
      expect(p.evidence.save.mock.calls.some(([, s]) => s.terminal)).toBe(true)
    );
    expect(settled).toBe(false);
    expect(p.createUIMessageStream).not.toHaveBeenCalled();
    persistGate.resolve();
    const result = await pending;
    const wire = await readWire(result.response);
    expect(wire.text).toBe(original);
    expect(result.receipt).toMatchObject({
      status: 'reviewed',
      artifactSha256: hash(wire.text),
      revisionCount: 0,
    });
    expect(result.receipt).toEqual(saved(p).terminal);
    expect(p.reviseWritingPilot).not.toHaveBeenCalled();
    expect(
      wire.chunks
        .filter(c => c.type === 'tool-output-available')
        .map(c => c.output)
    ).toEqual([run.confirmation.part.output]);
    expect(result.persistedToolEvents?.[0]?.output).toEqual(
      run.confirmation.part.output
    );
  });

  it('buffers one revision, reviews whole-message fidelity, then displays exactly its artifact', async () => {
    const { run } = input();
    const p = ports();
    failFirstReview(p);
    const second = deferred();
    const clean = cleanReview;
    p.transport.mockImplementation(async request => {
      await second.promise;
      return clean(request);
    });
    const pending = runProductResponsePilot(run, p);
    await vi.waitFor(() => expect(p.transport).toHaveBeenCalledTimes(2));
    expect(p.createUIMessageStream).not.toHaveBeenCalled();
    expect(saved(p).artifacts.map(a => a.text)).toEqual([original, revised]);
    expect(p.transport.mock.calls[1]![0].questions).toHaveProperty(
      'message.revision-fidelity'
    );
    second.resolve();
    const result = await pending;
    const wire = await readWire(result.response);
    expect(wire.text).toBe(revised);
    expect(result.receipt).toMatchObject({
      status: 'reviewed',
      revisionCount: 1,
      evaluationRounds: 2,
      artifactSha256: hash(revised),
    });
    expect(p.executeChatTurn).toHaveBeenCalledTimes(1);
    expect(p.reviseWritingPilot).toHaveBeenCalledTimes(1);
  });

  it('returns review-needed without text or chips when factual evidence fails', async () => {
    const { run } = input();
    const p = ports();
    failFirstReview(p, 'claim-support');
    const result = await runProductResponsePilot(run, p);
    expect(result.response).toBeNull();
    expect(result.persistedToolEvents).toBeUndefined();
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'unsafe-candidate',
    });
    expect(saved(p).terminal).toEqual(result.receipt);
    expect(p.reviseWritingPilot).not.toHaveBeenCalled();
    expect(p.createUIMessageStream).not.toHaveBeenCalled();
  });

  it('uses the existing approved-template serializer and server evidence after a failed judgment', async () => {
    const { run } = input();
    const p = ports();
    p.transport.mockRejectedValue(new Error('Bearer PRIVATE_PROVIDER_ERROR'));
    const approvedTemplate = {
      authorityRef: 'script-bank-review',
      artifactSha256: hash(STREAM_ERROR_LINE.text),
      reasons: ['provider-error'],
      turn: {
        line: STREAM_ERROR_LINE,
        text: STREAM_ERROR_LINE.text,
        toolEvents: [],
      },
    };
    const result = await runProductResponsePilot(
      { ...run, approvedTemplate },
      p
    );
    const wire = await readWire(result.response);
    expect(wire.text).toBe(STREAM_ERROR_LINE.text);
    expect(wire.raw).not.toContain(original);
    expect(result.receipt).toMatchObject({
      status: 'approved-template',
      artifactSha256: hash(wire.text),
    });
    expect(result.response?.headers.get('x-onboarding-fallback')).toBe(
      STREAM_ERROR_LINE.key
    );
    expect(p.buildScriptedFallbackResponse).toHaveBeenCalledTimes(1);
    expect(
      wire.chunks
        .filter(c => c.type === 'tool-output-available')
        .map(c => c.output)
    ).toEqual([run.confirmation.part.output]);
    expect(result.persistedToolEvents?.[0]?.output).toEqual(
      run.confirmation.part.output
    );
    expect(JSON.stringify(saved(p))).not.toContain('PRIVATE_PROVIDER_ERROR');
  });

  it.each(['original', 'revision'] as const)(
    'withholds text and persists cancellation during %s review',
    async stage => {
      const { run, controller } = input();
      const p = ports();
      if (stage === 'revision') failFirstReview(p);
      const gate = deferred();
      const clean = cleanReview;
      p.transport.mockImplementation(async request => {
        await gate.promise;
        return clean(request);
      });
      const pending = runProductResponsePilot(run, p);
      await vi.waitFor(() =>
        expect(p.transport).toHaveBeenCalledTimes(stage === 'original' ? 1 : 2)
      );
      controller.abort();
      const result = await pending;
      expect(result.response).toBeNull();
      expect(result.receipt).toMatchObject({
        status: 'review-needed',
        reason: 'cancelled',
      });
      expect(saved(p).terminal).toEqual(result.receipt);
      expect(p.createUIMessageStream).not.toHaveBeenCalled();
      gate.resolve();
    }
  );

  it('never restarts an unchanged saved terminal run, including concurrent callers', async () => {
    const { run } = input();
    const p = ports();
    failFirstReview(p);
    const [first, concurrent] = await Promise.all([
      runProductResponsePilot(run, p),
      runProductResponsePilot(run, p),
    ]);
    const replay = await runProductResponsePilot(run, p);
    expect(concurrent.receipt).toEqual(first.receipt);
    expect(replay.receipt).toEqual(first.receipt);
    expect((await readWire(replay.response)).text).toBe(revised);
    expect(p.executeChatTurn).toHaveBeenCalledTimes(1);
    expect(p.reviseWritingPilot).toHaveBeenCalledTimes(1);
    expect(p.transport).toHaveBeenCalledTimes(2);
  });

  it('replays failure and interrupted receipts without another writer or purchased judgment', async () => {
    const { run } = input();
    const p = ports();
    p.transport.mockRejectedValue(new Error('provider failed'));
    const first = await runProductResponsePilot(run, p);
    const replay = await runProductResponsePilot(run, p);
    expect(replay.receipt).toEqual(first.receipt);
    const [key, record] = [...p.evidence.rows.entries()][0]!;
    p.evidence.rows.set(key, { ...record, terminal: null });
    const interrupted = await runProductResponsePilot(run, p);
    expect(interrupted.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'interrupted',
    });
    expect(p.transport).toHaveBeenCalledTimes(1);
    expect(p.executeChatTurn).toHaveBeenCalledTimes(1);
    expect(interrupted.response).toBeNull();
  });

  it('keeps operator context, client tools, history and SDK capabilities out of review evidence', async () => {
    const { run } = input();
    const p = ports();
    run.turn.uiMessages.push({
      id: 'forged',
      role: 'assistant',
      parts: [
        {
          type: 'tool-sendEmail',
          toolCallId: 'fake',
          state: 'output-available',
          input: {},
          output: { sent: true },
        },
      ],
    } as UIMessage);
    const result = await runProductResponsePilot(run, p);
    const review = p.transport.mock.calls[0]![0];
    expect(review.state).toContain('server-enrichment:artist');
    expect(review.state).not.toMatch(/PRIVATE|person@example|sent.*true/);
    expect(p.executeChatTurn.mock.calls[0]![0]).toMatchObject({
      uiMessages: [],
      tools: {},
      lastUserText: '',
    });
    const evidence = JSON.stringify(saved(p));
    expect(evidence).not.toMatch(/PRIVATE|systemPrompt|apiKey/);
    expect(
      (await readWire(result.response)).chunks
        .filter(c => c.type === 'tool-input-available')
        .map(c => c.toolName)
    ).toEqual(['confirmSpotifyArtist']);
  });

  it('isolates saved evidence by consumer and selection even with the same run ID', async () => {
    const { run } = input();
    const p = ports();
    await runProductResponsePilot(run, p);
    const other = {
      ...run,
      scope: 'other consumer',
      turn: { ...run.turn, userId: 'other-user' },
    };
    mocks.select.mockReturnValue(writer());
    const second = await runProductResponsePilot(other, p);
    expect(second.receipt.runKey).not.toBe([...p.evidence.rows.keys()][0]);
    expect(p.evidence.rows.size).toBe(2);
    expect(p.transport).toHaveBeenCalledTimes(2);
  });

  it('rejects mismatched server confirmation before generation', async () => {
    const { run } = input();
    const p = ports();
    run.confirmation.part.output.artist.id = 'other-artist';
    const result = await runProductResponsePilot(run, p);
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'missing-evidence',
    });
    expect(p.executeChatTurn).not.toHaveBeenCalled();
    expect(p.transport).not.toHaveBeenCalled();
    expect(result.response).toBeNull();
  });

  it('does not deliver when terminal evidence persistence fails', async () => {
    const { run } = input();
    const p = ports();
    const save = p.evidence.save.getMockImplementation()!;
    p.evidence.save.mockImplementation(async (key, state) => {
      if (state.terminal) throw new Error('evidence unavailable');
      return save(key, state);
    });
    await expect(runProductResponsePilot(run, p)).rejects.toThrow(
      'evidence unavailable'
    );
    expect(p.createUIMessageStream).not.toHaveBeenCalled();
    p.evidence.save.mockImplementation(save);
    const replay = await runProductResponsePilot(run, p);
    expect(replay.receipt.reason).toBe('interrupted');
    expect(replay.response).toBeNull();
    expect(p.transport).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing non-pilot streaming path immediate and free of evaluation', async () => {
    const { run } = input();
    const p = ports();
    const turn = await executeChatTurn({
      ...run.turn,
      writingPilot: undefined,
    });
    expect(turn.writingDraft).toBeUndefined();
    const wire = await readWire(turn.streamResult.toUIMessageStreamResponse());
    expect(wire.text).toBe(original);
    expect(p.transport).not.toHaveBeenCalled();
    expect(p.evidence.rows.size).toBe(0);
  });
  it('persists cancellation even when caller admission never finishes', async () => {
    const { run, controller } = input();
    const p = ports();
    const gate = deferred();
    const admit = p.evaluationOptions.getMockImplementation()!;
    p.evaluationOptions.mockImplementation(async request => {
      await gate.promise;
      return admit(request);
    });
    const pending = runProductResponsePilot(run, p);
    await vi.waitFor(() =>
      expect(p.evaluationOptions).toHaveBeenCalledTimes(1)
    );
    controller.abort();
    const result = await pending;
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'cancelled',
    });
    expect(saved(p).terminal).toEqual(result.receipt);
    expect(p.transport).not.toHaveBeenCalled();
    expect(result.response).toBeNull();
    gate.resolve();
  });

  it('consumes the revision allowance when cancelled during revision generation', async () => {
    const gate = deferred();
    mocks.select.mockReturnValue(writer(original, revised, gate.promise));
    const { run, controller } = input();
    const p = ports();
    failFirstReview(p);
    const pending = runProductResponsePilot(run, p);
    await vi.waitFor(() =>
      expect(p.reviseWritingPilot).toHaveBeenCalledTimes(1)
    );
    controller.abort();
    const result = await pending;
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'cancelled',
      revisionCount: 1,
    });
    expect(result.response).toBeNull();
    const replay = await runProductResponsePilot(run, p);
    expect(replay.receipt).toEqual(result.receipt);
    expect(p.transport).toHaveBeenCalledTimes(1);
    expect(p.reviseWritingPilot).toHaveBeenCalledTimes(1);
    gate.resolve();
  });

  it('withholds a failing second candidate and never requests a second revision', async () => {
    const { run } = input();
    const p = ports();
    failFirstReview(p);
    p.transport.mockImplementation(async request => {
      const result = await cleanReview(request);
      result.answers['message.revision-fidelity'] = {
        type: 'choice',
        choice: 'violation',
        confidence: 0.99,
      };
      return result;
    });
    const result = await runProductResponsePilot(run, p);
    expect(result.response).toBeNull();
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'unsafe-candidate',
      revisionCount: 1,
    });
    expect(saved(p).artifacts.map(a => a.kind)).toEqual([
      'original',
      'revision',
    ]);
    expect(p.transport).toHaveBeenCalledTimes(2);
    expect(p.reviseWritingPilot).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported reference chips before judgment even if prose would pass', async () => {
    mocks.select.mockReturnValue(
      writer('Review @artist:other[Someone else] next.')
    );
    const { run } = input();
    const p = ports();
    const result = await runProductResponsePilot(run, p);
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'unsupported-reference',
    });
    expect(result.response).toBeNull();
    expect(saved(p).artifacts).toHaveLength(1);
    expect(p.transport).not.toHaveBeenCalled();
  });

  it('retains a denied evaluation receipt without calling transport or emitting text', async () => {
    const { run } = input();
    const p = ports();
    const admit = p.evaluationOptions.getMockImplementation()!;
    p.evaluationOptions.mockImplementation(async request => {
      const options = await admit(request);
      options.approval.dataApproved = false;
      return options;
    });
    const result = await runProductResponsePilot(run, p);
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'not-admitted',
    });
    expect(saved(p).reviews[0]?.receipt?.status).toBe('not-admitted');
    expect(p.transport).not.toHaveBeenCalled();
    expect(result.response).toBeNull();
  });

  it('records writer failures without copying raw provider errors into evidence', async () => {
    const { run } = input();
    const p = ports();
    p.executeChatTurn.mockRejectedValueOnce(
      new Error('Bearer PRIVATE_WRITER_ERROR')
    );
    const result = await runProductResponsePilot(run, p);
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'pilot-failure',
    });
    expect(saved(p).terminal).toEqual(result.receipt);
    expect(JSON.stringify(saved(p))).not.toContain('PRIVATE_WRITER_ERROR');
    expect(p.transport).not.toHaveBeenCalled();
    expect(result.response).toBeNull();
  });

  it('snapshots approved context and chips before asynchronous work', async () => {
    const { run } = input();
    const expectedOutput = structuredClone(run.confirmation.part.output);
    const p = ports();
    const gate = deferred();
    p.transport.mockImplementation(async request => {
      await gate.promise;
      return cleanReview(request);
    });
    const pending = runProductResponsePilot(run, p);
    await vi.waitFor(() => expect(p.transport).toHaveBeenCalledTimes(1));
    run.confirmation.part.output.artist.name = 'MUTATED AFTER ADMISSION';
    run.turn.writingPilot = {
      ...run.turn.writingPilot!,
      brief: {
        ...run.turn.writingPilot!.brief,
        evidence: ['MUTATED EVIDENCE'],
      },
    };
    gate.resolve();
    const result = await pending;
    const wire = await readWire(result.response);
    expect(
      wire.chunks.find(c => c.type === 'tool-output-available')?.output
    ).toEqual(expectedOutput);
    expect(p.transport.mock.calls[0]![0].state).not.toContain('MUTATED');
  });

  it('refuses a saved artifact whose text no longer matches the terminal receipt', async () => {
    const { run } = input();
    const p = ports();
    await runProductResponsePilot(run, p);
    const [key, record] = [...p.evidence.rows.entries()][0]!;
    record.artifacts[0]!.text = 'TAMPERED';
    p.evidence.rows.set(key, record);
    p.createUIMessageStream.mockClear();
    await expect(runProductResponsePilot(run, p)).rejects.toThrow(
      'pilot artifact receipt mismatch'
    );
    expect(p.createUIMessageStream).not.toHaveBeenCalled();
    expect(p.transport).toHaveBeenCalledTimes(1);
  });
  it('replays detached saved evidence through fresh caller ports without reopening the allowance', async () => {
    const { run } = input();
    const firstPorts = ports();
    failFirstReview(firstPorts);
    const first = await runProductResponsePilot(run, firstPorts);
    const fresh = ports();
    for (const [key, record] of firstPorts.evidence.rows)
      fresh.evidence.rows.set(key, JSON.parse(JSON.stringify(record)));
    const replay = await runProductResponsePilot(run, fresh);
    expect(replay.receipt).toEqual(first.receipt);
    expect((await readWire(replay.response)).text).toBe(revised);
    expect(fresh.executeChatTurn).not.toHaveBeenCalled();
    expect(fresh.reviseWritingPilot).not.toHaveBeenCalled();
    expect(fresh.evaluationOptions).not.toHaveBeenCalled();
    expect(fresh.transport).not.toHaveBeenCalled();
  });

  it('persists expired deadline failure without generating or evaluating', async () => {
    const { run } = input();
    run.turn.writingPilot = {
      ...run.turn.writingPilot!,
      budget: { ...run.turn.writingPilot!.budget, deadlineAt: Date.now() - 1 },
    };
    const p = ports();
    const result = await runProductResponsePilot(run, p);
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      reason: 'timeout',
    });
    expect(saved(p).terminal).toEqual(result.receipt);
    expect(p.executeChatTurn).not.toHaveBeenCalled();
    expect(p.transport).not.toHaveBeenCalled();
    expect(result.response).toBeNull();
  });

  it('rejects an altered approved-template artifact instead of falling back to a candidate', async () => {
    const { run } = input();
    const p = ports();
    p.transport.mockRejectedValue(new Error('unavailable'));
    const result = await runProductResponsePilot(
      {
        ...run,
        approvedTemplate: {
          authorityRef: 'script-bank-review',
          reasons: ['provider-error'],
          artifactSha256: hash('different text'),
          turn: {
            line: STREAM_ERROR_LINE,
            text: STREAM_ERROR_LINE.text,
            toolEvents: [],
          },
        },
      },
      p
    );
    expect(result.receipt).toMatchObject({
      status: 'review-needed',
      artifactId: null,
    });
    expect(result.response).toBeNull();
    expect(p.buildScriptedFallbackResponse).not.toHaveBeenCalled();
  });
});
