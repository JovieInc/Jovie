import 'server-only';
import type { UIMessage } from 'ai';
import {
  type AccessDecision,
  decideOnboardingAccess,
  MAX_INTERVIEW_TURNS_BEFORE_FORCE,
} from '@/lib/chat/tools/onboarding-access-eval';
import type { OnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';
import { renderLine, type ScriptLine, type ScriptStepId } from './script';
import {
  HANDLE_ACCEPT_COPY,
  isHandleConfirmIntent,
  isIncompleteAdvanceMessage,
  type OnboardingGuardedStep,
  WIDGET_COMPLETION_ACTIONS,
} from './widget-events';

type PickLine = (stepId: ScriptStepId) => ScriptLine;

interface HandleConfirmTurn {
  readonly line: ScriptLine;
  readonly text: string;
  readonly toolEvents: readonly {
    readonly toolName: string;
    readonly input: Record<string, unknown>;
    readonly output: Record<string, unknown>;
  }[];
  readonly guardedStep: OnboardingGuardedStep;
}

function proposeNextStepEvent(decision: AccessDecision) {
  return {
    toolName: 'proposeNextStep',
    input: {},
    output: {
      action: 'propose_next_step',
      decision,
      summary: `Next step: ${decision.kind.replaceAll('_', ' ')}.`,
    },
  };
}

function terminalDecision(
  state: OnboardingTurnState,
  decision: AccessDecision
): AccessDecision {
  if (decision.kind !== 'needs_more_info') return decision;
  // Keep → auth must not reopen social/audience. Weak signal becomes waitlist.
  return {
    kind: 'waitlist',
    rationale: decision.rationale || 'keep_without_enrichment',
    score: decision.score,
    proofRequired: decision.proofRequired,
    goldenPathHold: decision.goldenPathHold,
    qualificationDecision: decision.qualificationDecision,
    qualification: decision.qualification,
  };
}

/**
 * After the matched handle is accepted (Keep / free-text claim), skip
 * social + audience and hand off to auth / waitlist. Boardy handle-by-default:
 * filled from match → Keep → auth.
 */
export function keepAuthTurnAfterHandleConfirmed(
  handle: string,
  state: OnboardingTurnState,
  pick: PickLine
): HandleConfirmTurn {
  const raw = decideOnboardingAccess({
    activeRole: state.profileDraft?.activeRole,
    accessControlled: state.accessControlled,
    goldenPathVerdict: state.goldenPathVerdict,
    goldenPathHold: state.goldenPathHold,
    spotifyArtistId: state.spotifyArtistId,
    publicProfileUrl: state.publicProfileUrl,
    spotifyFollowers: state.spotifyFollowers,
    catalogReleases: state.catalogPreview?.total ?? null,
    metrics: state.artistMetrics,
    signals: state.signals,
    // Force a terminal decision — no enrichment interview after Keep.
    turnCount: Math.max(state.turnCount, MAX_INTERVIEW_TURNS_BEFORE_FORCE),
  });
  const decision = terminalDecision(state, raw);

  const events: HandleConfirmTurn['toolEvents'][number][] = [
    {
      toolName: 'checkHandle',
      input: { handle },
      output: {
        action: WIDGET_COMPLETION_ACTIONS.HANDLE_CONFIRMED,
        handle,
        summary: `Handle @${handle} confirmed.`,
      },
    },
    proposeNextStepEvent(decision),
  ];

  if (decision.kind === 'instant_access') {
    events.push({
      toolName: 'proposeCheckout',
      input: {},
      output: {
        action: 'propose_checkout',
        plan: null,
        handoffUrl: '/onboarding/checkout',
        summary: 'Checkout handoff ready.',
      },
    });
    const line = pick(
      decision.proofRequired ? 'golden_path_admitted' : 'instant_access'
    );
    return {
      line,
      text: renderLine(line, { handle }),
      toolEvents: events,
      guardedStep: 'waitlist_or_complete',
    };
  }

  const line = pick('waitlist');
  return {
    line,
    text: renderLine(line, { handle }),
    toolEvents: events,
    guardedStep: 'waitlist_or_complete',
  };
}

function messageText(message: UIMessage): string {
  return (message.parts ?? [])
    .map(part =>
      part.type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''
    )
    .join('');
}

/**
 * Resolve the handle step when Keep has not fired yet.
 * Free-text claim/sign-up/keep locks the shown handle; acks stay put; other
 * free-text nudges toward the CTA.
 */
export function resolveAwaitingHandleConfirm(input: {
  readonly shownHandle: string;
  readonly latest: UIMessage | null;
  readonly latestIsWidgetEvent: boolean;
  readonly typedHandle: string | null;
  readonly state: OnboardingTurnState;
  readonly pick: PickLine;
}): HandleConfirmTurn {
  const { shownHandle, latest, latestIsWidgetEvent, typedHandle, state, pick } =
    input;
  const latestText = latest && !latestIsWidgetEvent ? messageText(latest) : '';

  if (shownHandle && isHandleConfirmIntent(latestText)) {
    return keepAuthTurnAfterHandleConfirmed(shownHandle, state, pick);
  }

  const handle =
    typedHandle && typedHandle !== shownHandle ? typedHandle : shownHandle;
  const line = pick('handle');
  const baseText = renderLine(line, { handle });
  const nudge =
    latestText &&
    !typedHandle &&
    !isIncompleteAdvanceMessage(latestText) &&
    handle === shownHandle
      ? ` Tap ${HANDLE_ACCEPT_COPY} below to lock it in.`
      : '';
  return {
    line,
    text: `${baseText}${nudge}`,
    toolEvents:
      handle === shownHandle
        ? []
        : [
            {
              toolName: 'checkHandle',
              input: { handle },
              output: {
                action: 'check_handle',
                handle,
                summary: `Checking @${handle}.`,
              },
            },
          ],
    guardedStep: 'handle',
  };
}
