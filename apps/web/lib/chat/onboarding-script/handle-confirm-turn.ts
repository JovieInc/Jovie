import 'server-only';
import type { UIMessage } from 'ai';
import { renderLine, type ScriptLine, type ScriptStepId } from './script';
import {
  CONFIRM_HANDLE_CTA_LABEL,
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

/** Social card turn after the shown handle is locked (widget or free-text). */
export function socialTurnAfterHandleConfirmed(
  handle: string,
  pick: PickLine
): HandleConfirmTurn {
  const line = pick('attach_social');
  return {
    line,
    text: renderLine(line, {}),
    toolEvents: [
      {
        toolName: 'checkHandle',
        input: { handle },
        output: {
          action: WIDGET_COMPLETION_ACTIONS.HANDLE_CONFIRMED,
          handle,
          summary: `Handle @${handle} confirmed.`,
        },
      },
      {
        toolName: 'proposeSocialLink',
        input: { url: '' },
        output: {
          action: 'propose_social_link',
          url: null,
          summary: 'Attach a public social account.',
        },
      },
    ],
    guardedStep: 'social',
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
 * Resolve the handle step when Confirm Handle has not fired yet.
 * Free-text claim/sign-up locks the shown handle; acks stay put; other
 * free-text nudges toward the CTA.
 */
export function resolveAwaitingHandleConfirm(input: {
  readonly shownHandle: string;
  readonly latest: UIMessage | null;
  readonly latestIsWidgetEvent: boolean;
  readonly typedHandle: string | null;
  readonly pick: PickLine;
}): HandleConfirmTurn {
  const { shownHandle, latest, latestIsWidgetEvent, typedHandle, pick } = input;
  const latestText = latest && !latestIsWidgetEvent ? messageText(latest) : '';

  if (shownHandle && isHandleConfirmIntent(latestText)) {
    return socialTurnAfterHandleConfirmed(shownHandle, pick);
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
      ? ` Tap ${CONFIRM_HANDLE_CTA_LABEL} below to lock it in.`
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
