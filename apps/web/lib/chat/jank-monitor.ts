/**
 * Chat jank monitor (framework-free).
 *
 * Emits structured events when the chat UI exhibits continuity breaks
 * (disappear/reappear, duplicate, reorder, token rollback, stall, etc).
 *
 * Usage is via `useChatJankMonitor` — this module is React-free so it can
 * be unit-tested in isolation and so a single mount instance can own its
 * own state via `useRef`.
 */

export const JANK_EVENT_NAMES = {
  MESSAGE_DISAPPEARED: 'chat_jank.message_disappeared',
  MESSAGE_REAPPEARED: 'chat_jank.message_reappeared',
  MESSAGE_DUPLICATED: 'chat_jank.message_duplicated',
  MESSAGE_REORDERED: 'chat_jank.message_reordered',
  MESSAGE_ID_CHANGED: 'chat_jank.message_id_changed',
  TOKEN_ROLLBACK: 'chat_jank.token_rollback',
  STREAM_STALL: 'chat_jank.stream_stall',
  NO_VISIBLE_FEEDBACK_AFTER_SEND: 'chat_jank.no_visible_feedback_after_send',
  UNEXPECTED_SCROLL_JUMP: 'chat_jank.unexpected_scroll_jump',
} as const;

export type JankEventName =
  (typeof JANK_EVENT_NAMES)[keyof typeof JANK_EVENT_NAMES];

/** Parts we track — mapped from AI SDK UIMessage parts. */
export type PartSnapshot = {
  readonly kind: 'text' | 'reasoning' | 'tool' | 'step-start' | 'other';
  readonly textLength?: number;
  /**
   * For tool parts, the AI SDK state enum:
   * 'input-streaming' | 'input-available' | 'output-available' |
   * 'output-error' | 'approval-requested' | 'approval-responded' | ...
   * We only treat a subset as "pending" when gating stall detection.
   */
  readonly toolState?: string;
};

export type MessageSnapshot = {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  /** True if the id was assigned by the server (UUID); false for client-local ids. */
  readonly isServerAssigned: boolean;
  readonly parts: readonly PartSnapshot[];
};

export type TextLengthBucket = '<50' | '50-500' | '500-2000' | '>2000';

export type JankPayload = {
  conversationId?: string | null;
  messageId?: string;
  isServerAssigned?: boolean;
  role?: MessageSnapshot['role'];
  sequenceIndex?: number;
  streamRevision?: number;
  textLengthBucket?: TextLengthBucket;
  previousState?: string;
  nextState?: string;
  route?: string;
  timestamp: number;
  buildId?: string;
  [key: string]: unknown;
};

export type JankSummary = {
  conversationId: string | null;
  jankEventCount: number;
  messageDisappearCount: number;
  duplicateCount: number;
  reorderCount: number;
  tokenRollbackCount: number;
  streamStallCount: number;
  unexpectedScrollJumpCount: number;
  noVisibleFeedbackCount: number;
  isJankFree: boolean;
};

export type EmitFn = (event: JankEventName, payload: JankPayload) => void;

export type NowFn = () => number;

export type CreateJankMonitorOptions = {
  emit: EmitFn;
  /** Pluggable clock for tests. Defaults to Date.now. */
  now?: NowFn;
  /** ms: how long a removed id can be absent before reappear no longer counts. */
  reappearWindowMs?: number;
  /** ms: threshold for no_visible_feedback_after_send. */
  feedbackTimeoutMs?: number;
  /** ms: threshold for stream stall. */
  stallTimeoutMs?: number;
  /** ms: input-recency window for scroll-anchor correlation. */
  scrollInputGraceMs?: number;
};

const DEFAULT_REAPPEAR_WINDOW_MS = 5_000;
const DEFAULT_FEEDBACK_TIMEOUT_MS = 150;
const DEFAULT_STALL_TIMEOUT_MS = 2_000;
const DEFAULT_SCROLL_INPUT_GRACE_MS = 150;

/** Ids we never count as "messages" for continuity purposes. */
const IGNORED_IDS = new Set(['thinking-placeholder']);

function bucketize(len: number): TextLengthBucket {
  if (len < 50) return '<50';
  if (len < 500) return '50-500';
  if (len < 2000) return '500-2000';
  return '>2000';
}

/** Count of non-trivial progress signals (parts + part text/state) for diffing. */
type PartFingerprint = {
  kind: PartSnapshot['kind'];
  textLength: number;
  toolState: string | undefined;
};

function fingerprint(parts: readonly PartSnapshot[]): PartFingerprint[] {
  return parts.map(p => ({
    kind: p.kind,
    textLength: p.textLength ?? 0,
    toolState: p.toolState,
  }));
}

function partsChanged(
  prev: readonly PartFingerprint[] | undefined,
  next: readonly PartFingerprint[]
): boolean {
  if (!prev) return next.length > 0;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.kind !== b.kind ||
      a.textLength !== b.textLength ||
      a.toolState !== b.toolState
    ) {
      return true;
    }
  }
  return false;
}

type ConvState = {
  /** Seen message ids, in snapshot order. Used for reorder detection. */
  lastIdOrder: string[];
  /** Per-id fingerprint of parts from last snapshot. */
  lastSeen: Map<
    string,
    {
      index: number;
      role: MessageSnapshot['role'];
      isServerAssigned: boolean;
      parts: PartFingerprint[];
    }
  >;
  /**
   * Ids that were missing in the most recent snapshot but were present
   * one snapshot ago. These are "pending disappear" — we emit
   * message_disappeared only if they remain absent for a second
   * consecutive snapshot (StrictMode double-mount defense).
   */
  pendingDisappear: Map<
    string,
    {
      role: MessageSnapshot['role'];
      isServerAssigned: boolean;
      atSnapshot: number;
    }
  >;
  /**
   * Ids that were confirmed-disappeared, with timestamp. If the id
   * re-appears within `reappearWindowMs`, we emit message_reappeared.
   */
  recentlyRemoved: Map<
    string,
    { role: MessageSnapshot['role']; isServerAssigned: boolean; at: number }
  >;
  snapshotIndex: number;
  sequenceIndex: number;
  /** Last time we saw any observable progress during streaming. */
  lastProgressAt: number;
  /** Number of progress ticks since the current stream started. */
  streamRevision: number;
  /** Last status observed. */
  lastStatus: string | null;
  /** Whether the last stall was already emitted (suppress duplicates per stream). */
  stallEmitted: boolean;
  /** Message-count at time of onSend, for feedback detection. */
  onSendPendingAt: number | null;
  onSendBaselineCount: number;
  onSendUserIds: Set<string>;
  feedbackEmittedForSend: boolean;
  /** Aggregated counts for getSummary. */
  counts: Omit<JankSummary, 'conversationId' | 'jankEventCount' | 'isJankFree'>;
};

function newConvState(now: number): ConvState {
  return {
    lastIdOrder: [],
    lastSeen: new Map(),
    pendingDisappear: new Map(),
    recentlyRemoved: new Map(),
    snapshotIndex: 0,
    sequenceIndex: 0,
    lastProgressAt: now,
    streamRevision: 0,
    lastStatus: null,
    stallEmitted: false,
    onSendPendingAt: null,
    onSendBaselineCount: 0,
    onSendUserIds: new Set(),
    feedbackEmittedForSend: false,
    counts: {
      messageDisappearCount: 0,
      duplicateCount: 0,
      reorderCount: 0,
      tokenRollbackCount: 0,
      streamStallCount: 0,
      unexpectedScrollJumpCount: 0,
      noVisibleFeedbackCount: 0,
    },
  };
}

function getRoute(): string | undefined {
  if (globalThis.window === undefined) return undefined;
  return globalThis.window.location?.pathname;
}

function getBuildId(): string | undefined {
  // Next.js inlines NEXT_PUBLIC_* at build time for both server + client.
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  return env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
}

export type JankMonitor = {
  observeMessages(
    conversationId: string | null,
    snapshot: readonly MessageSnapshot[],
    status?: string
  ): void;
  onSend(conversationId: string | null, currentMessageCount: number): void;
  tickStall(
    conversationId: string | null,
    ctx: { status: string; hasActivePendingTool: boolean }
  ): void;
  onScrollAnchorBroken(
    conversationId: string | null,
    ctx: { withinUserInputMs: number }
  ): void;
  onScrollAnchorRestored(conversationId: string | null): void;
  getSummary(conversationId: string | null): JankSummary;
  reset(conversationId?: string | null): void;
};

function onScrollAnchorRestored(_conversationId: string | null): void {
  // Currently a no-op — reserved for future symmetry.
}

function keyFor(id: string | null): string {
  return id ?? '__unassigned__';
}

function detectReorder(
  prev: readonly string[],
  next: readonly string[]
): boolean {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const shared: string[] = [];
  for (const id of prev) if (nextSet.has(id)) shared.push(id);
  const sharedInNext: string[] = [];
  for (const id of next) if (prevSet.has(id)) sharedInNext.push(id);
  if (shared.length !== sharedInNext.length) return false;
  for (let i = 0; i < shared.length; i++) {
    if (shared[i] !== sharedInNext[i]) return true;
  }
  return false;
}

export function createJankMonitor(opts: CreateJankMonitorOptions): JankMonitor {
  const emit = opts.emit;
  const now = opts.now ?? (() => Date.now());
  const reappearWindowMs = opts.reappearWindowMs ?? DEFAULT_REAPPEAR_WINDOW_MS;
  const feedbackTimeoutMs =
    opts.feedbackTimeoutMs ?? DEFAULT_FEEDBACK_TIMEOUT_MS;
  const stallTimeoutMs = opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  const scrollInputGraceMs =
    opts.scrollInputGraceMs ?? DEFAULT_SCROLL_INPUT_GRACE_MS;

  const byConv = new Map<string, ConvState>();

  function state(id: string | null): ConvState {
    const k = keyFor(id);
    let s = byConv.get(k);
    if (!s) {
      s = newConvState(now());
      byConv.set(k, s);
    }
    return s;
  }

  function basePayload(conversationId: string | null): JankPayload {
    return {
      conversationId,
      timestamp: now(),
      route: getRoute(),
      buildId: getBuildId(),
    };
  }

  function fire(
    conversationId: string | null,
    event: JankEventName,
    extra: Partial<JankPayload>
  ) {
    const s = state(conversationId);
    const payload: JankPayload = {
      ...basePayload(conversationId),
      sequenceIndex: s.sequenceIndex,
      streamRevision: s.streamRevision,
      ...extra,
    };
    emit(event, payload);
  }

  function observeMessages(
    conversationId: string | null,
    snapshot: readonly MessageSnapshot[],
    status?: string
  ): void {
    const s = state(conversationId);
    s.snapshotIndex += 1;
    const nowTs = now();
    const effective = snapshot.filter(m => !IGNORED_IDS.has(m.id));

    // ── Duplicates ─────────────────────────────────────────────
    const seenInSnapshot = new Set<string>();
    for (const m of effective) {
      if (seenInSnapshot.has(m.id)) {
        s.counts.duplicateCount += 1;
        fire(conversationId, JANK_EVENT_NAMES.MESSAGE_DUPLICATED, {
          messageId: m.id,
          role: m.role,
          isServerAssigned: m.isServerAssigned,
        });
      }
      seenInSnapshot.add(m.id);
    }

    // ── Reorder ────────────────────────────────────────────────
    const nextIdOrder = effective.map(m => m.id);
    if (s.lastIdOrder.length > 0 && detectReorder(s.lastIdOrder, nextIdOrder)) {
      s.counts.reorderCount += 1;
      fire(conversationId, JANK_EVENT_NAMES.MESSAGE_REORDERED, {
        previousState: s.lastIdOrder.join(','),
        nextState: nextIdOrder.join(','),
      });
    }

    // ── Disappear / reappear ───────────────────────────────────
    const currentIds = new Set(nextIdOrder);
    // Confirm any previously-pending disappears that are STILL missing.
    for (const [id, meta] of s.pendingDisappear) {
      if (!currentIds.has(id)) {
        // Confirm — emit disappear.
        s.counts.messageDisappearCount += 1;
        fire(conversationId, JANK_EVENT_NAMES.MESSAGE_DISAPPEARED, {
          messageId: id,
          role: meta.role,
          isServerAssigned: meta.isServerAssigned,
        });
        s.recentlyRemoved.set(id, {
          role: meta.role,
          isServerAssigned: meta.isServerAssigned,
          at: nowTs,
        });
      }
    }
    s.pendingDisappear.clear();

    // Newly missing ids → pending-disappear.
    for (const [id, prev] of s.lastSeen) {
      if (!currentIds.has(id)) {
        s.pendingDisappear.set(id, {
          role: prev.role,
          isServerAssigned: prev.isServerAssigned,
          atSnapshot: s.snapshotIndex,
        });
      }
    }

    // Reappear detection.
    for (const m of effective) {
      const wasRecentlyRemoved = s.recentlyRemoved.get(m.id);
      if (
        wasRecentlyRemoved &&
        nowTs - wasRecentlyRemoved.at <= reappearWindowMs
      ) {
        fire(conversationId, JANK_EVENT_NAMES.MESSAGE_REAPPEARED, {
          messageId: m.id,
          role: m.role,
          isServerAssigned: m.isServerAssigned,
        });
        s.recentlyRemoved.delete(m.id);
      }
    }
    // GC old recently-removed entries.
    for (const [id, meta] of s.recentlyRemoved) {
      if (nowTs - meta.at > reappearWindowMs) s.recentlyRemoved.delete(id);
    }

    // ── Token rollback (per (id, partIndex)) ───────────────────
    // Progress bookkeeping (any part delta = progress).
    let anyProgress = false;
    for (const m of effective) {
      const prev = s.lastSeen.get(m.id);
      const nextFp = fingerprint(m.parts);
      if (partsChanged(prev?.parts, nextFp)) anyProgress = true;

      if (prev && status === 'streaming') {
        const len = Math.min(prev.parts.length, nextFp.length);
        for (let i = 0; i < len; i++) {
          const before = prev.parts[i];
          const after = nextFp[i];
          const sameKind = before.kind === after.kind;
          const isText = after.kind === 'text' || after.kind === 'reasoning';
          if (sameKind && isText && after.textLength < before.textLength) {
            s.counts.tokenRollbackCount += 1;
            fire(conversationId, JANK_EVENT_NAMES.TOKEN_ROLLBACK, {
              messageId: m.id,
              role: m.role,
              isServerAssigned: m.isServerAssigned,
              previousState: String(before.textLength),
              nextState: String(after.textLength),
              textLengthBucket: bucketize(after.textLength),
            });
          }
        }
      }
    }

    // ── Update lastSeen ────────────────────────────────────────
    s.lastSeen.clear();
    effective.forEach((m, idx) => {
      s.lastSeen.set(m.id, {
        index: idx,
        role: m.role,
        isServerAssigned: m.isServerAssigned,
        parts: fingerprint(m.parts),
      });
    });
    s.lastIdOrder = nextIdOrder;
    s.sequenceIndex = effective.length;

    // ── Stream revision / progress ─────────────────────────────
    if (status !== s.lastStatus) {
      if (status === 'streaming' || status === 'submitted') {
        // New stream: reset per-stream counters.
        s.streamRevision = 0;
        s.stallEmitted = false;
        s.lastProgressAt = nowTs;
      }
      s.lastStatus = status ?? null;
    }
    if (anyProgress) {
      s.lastProgressAt = nowTs;
      s.streamRevision += 1;
      s.stallEmitted = false;
    }

    // ── Feedback after send ────────────────────────────────────
    if (
      s.onSendPendingAt !== null &&
      !s.feedbackEmittedForSend &&
      nowTs - s.onSendPendingAt >= feedbackTimeoutMs
    ) {
      // Look for a NEW user bubble or assistant placeholder vs baseline.
      const newUserIds = effective
        .filter(m => m.role === 'user' && !s.onSendUserIds.has(m.id))
        .map(m => m.id);
      const hasNewUserBubble = newUserIds.length > 0;
      const hasAssistantPlaceholder = snapshot.some(
        m => m.id === 'thinking-placeholder'
      );
      if (!hasNewUserBubble && !hasAssistantPlaceholder) {
        s.counts.noVisibleFeedbackCount += 1;
        fire(conversationId, JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND, {
          previousState: String(s.onSendBaselineCount),
          nextState: String(effective.length),
        });
      }
      s.feedbackEmittedForSend = true;
      s.onSendPendingAt = null;
    } else if (s.onSendPendingAt !== null) {
      // Check for satisfied feedback.
      const newUserBubble = effective.some(
        m => m.role === 'user' && !s.onSendUserIds.has(m.id)
      );
      const hasPlaceholder = snapshot.some(
        m => m.id === 'thinking-placeholder'
      );
      if (newUserBubble || hasPlaceholder) {
        s.onSendPendingAt = null;
        s.feedbackEmittedForSend = true;
      }
    }
  }

  function onSend(
    conversationId: string | null,
    currentMessageCount: number
  ): void {
    const s = state(conversationId);
    s.onSendPendingAt = now();
    s.feedbackEmittedForSend = false;
    s.onSendBaselineCount = currentMessageCount;
    s.onSendUserIds = new Set(
      [...s.lastSeen.entries()]
        .filter(([, v]) => v.role === 'user')
        .map(([id]) => id)
    );
  }

  function tickStall(
    conversationId: string | null,
    ctx: { status: string; hasActivePendingTool: boolean }
  ): void {
    const s = state(conversationId);
    if (ctx.status !== 'streaming') {
      s.stallEmitted = false;
      return;
    }
    if (ctx.hasActivePendingTool) return;
    if (s.stallEmitted) return;
    const since = now() - s.lastProgressAt;
    if (since < stallTimeoutMs) return;
    s.counts.streamStallCount += 1;
    s.stallEmitted = true;
    fire(conversationId, JANK_EVENT_NAMES.STREAM_STALL, {
      previousState: String(s.lastProgressAt),
      nextState: String(now()),
    });
  }

  function onScrollAnchorBroken(
    conversationId: string | null,
    ctx: { withinUserInputMs: number }
  ): void {
    if (ctx.withinUserInputMs <= scrollInputGraceMs) return;
    const s = state(conversationId);
    s.counts.unexpectedScrollJumpCount += 1;
    fire(conversationId, JANK_EVENT_NAMES.UNEXPECTED_SCROLL_JUMP, {
      previousState: 'stuck',
      nextState: 'unstuck',
    });
  }

  function getSummary(conversationId: string | null): JankSummary {
    const s = state(conversationId);
    const counts = s.counts;
    const jankEventCount =
      counts.messageDisappearCount +
      counts.duplicateCount +
      counts.reorderCount +
      counts.tokenRollbackCount +
      counts.streamStallCount +
      counts.unexpectedScrollJumpCount +
      counts.noVisibleFeedbackCount;
    return {
      conversationId,
      jankEventCount,
      ...counts,
      isJankFree: jankEventCount === 0,
    };
  }

  function reset(conversationId?: string | null): void {
    if (conversationId === undefined) {
      byConv.clear();
      return;
    }
    byConv.delete(keyFor(conversationId));
  }

  return {
    observeMessages,
    onSend,
    tickStall,
    onScrollAnchorBroken,
    onScrollAnchorRestored,
    getSummary,
    reset,
  };
}
