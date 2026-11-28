import 'server-only';
import { renderLine, type ScriptLine, type ScriptStepId } from './script';
import {
  ONBOARDING_WIDGET_EVENTS,
  type OnboardingGuardedStep,
  WIDGET_COMPLETION_ACTIONS,
} from './widget-events';

type PickLine = (stepId: ScriptStepId) => ScriptLine;

export interface SpotifySkipTurn {
  readonly line: ScriptLine;
  readonly text: string;
  readonly toolEvents: readonly {
    readonly toolName: string;
    readonly input: Record<string, unknown>;
    readonly output: Record<string, unknown>;
  }[];
  readonly guardedStep: OnboardingGuardedStep;
}

/** True when the visitor skipped Spotify via None of These or a skip tool. */
export function historyShowsSpotifySkip(
  skippedTool: unknown,
  noneOfTheseEvent: unknown
): boolean {
  return Boolean(skippedTool || noneOfTheseEvent);
}

/** Advance past Spotify into the handle card after an explicit skip. */
export function buildSpotifySkipTurn(input: {
  readonly pick: PickLine;
  readonly handle: string;
  readonly queryHint: string;
}): SpotifySkipTurn {
  const { pick, handle, queryHint } = input;
  const line = pick('handle');
  return {
    line,
    text: renderLine(line, { handle }),
    toolEvents: [
      {
        toolName: 'searchSpotifyArtist',
        input: { query: queryHint || null },
        output: {
          action: WIDGET_COMPLETION_ACTIONS.SPOTIFY_SKIPPED,
          query: queryHint || null,
          summary: 'Skipped Spotify match.',
        },
      },
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

export function isNoneOfTheseEvent(
  event: { readonly onboardingEvent?: string } | null
): boolean {
  return (
    event?.onboardingEvent === ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE
  );
}
