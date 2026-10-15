import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { getOnboardingComposerPlaceholder } from './onboardingChatHelpers';

function assistant(
  toolName: string,
  output?: unknown,
  state = 'output-available'
): UIMessage {
  return {
    id: toolName,
    role: 'assistant',
    parts: [
      { type: 'dynamic-tool', toolName, toolCallId: toolName, state, output },
    ],
  } as UIMessage;
}

const context = { handleDraft: 'artist', hasConversationStarted: true };

describe('getOnboardingComposerPlaceholder', () => {
  it('introduces an empty conversation', () => {
    expect(
      getOnboardingComposerPlaceholder({
        handleDraft: null,
        hasConversationStarted: false,
        messages: [],
      })
    ).toBe('Artist, release, or link...');
  });

  it('uses a conversational prompt when no card is active, despite a retained handle draft', () => {
    expect(
      getOnboardingComposerPlaceholder({
        ...context,
        messages: [
          {
            id: 'question',
            role: 'assistant',
            parts: [{ type: 'text', text: 'When is your next release?' }],
          },
        ],
      })
    ).toBe('Reply to Jovie…');
  });

  it.each([
    [
      'picker',
      'searchSpotifyArtist',
      { action: 'open_artist_picker', query: 'Artist' },
      'Pick an artist above or type a different name…',
    ],
    [
      'handle',
      'checkHandle',
      { action: 'check_handle', handle: 'artist' },
      'Confirm handle or type a different one…',
    ],
    [
      'social',
      'proposeSocialLink',
      { action: 'propose_social_link' },
      'Attach a social link above or paste one here…',
    ],
    [
      'instant access',
      'proposeNextStep',
      { action: 'propose_next_step', decision: { kind: 'instant_access' } },
      'Create your account above or ask a question…',
    ],
    [
      'waitlist',
      'proposeNextStep',
      { action: 'propose_next_step', decision: { kind: 'waitlist' } },
      'Save your spot above or ask a question…',
    ],
    [
      'more information',
      'proposeNextStep',
      { action: 'propose_next_step', decision: { kind: 'needs_more_info' } },
      'Reply to Jovie…',
    ],
    [
      'checkout',
      'proposeCheckout',
      {
        action: 'propose_checkout',
        plan: 'pro',
        handoffUrl: '/onboarding/checkout?plan=pro',
      },
      'Continue to checkout above or ask a question…',
    ],
    [
      'confirmed handle',
      'checkHandle',
      { action: 'handle_confirmed', handle: 'artist' },
      'Reply to Jovie…',
    ],
    [
      'attached social',
      'proposeSocialLink',
      { action: 'social_attached', url: 'https://instagram.com/artist' },
      'Reply to Jovie…',
    ],
  ])(
    'follows the %s card instead of a stale handle draft',
    (_state, name, output, expected) => {
      expect(
        getOnboardingComposerPlaceholder({
          ...context,
          messages: [assistant(name, output)],
        })
      ).toBe(expected);
    }
  );

  it('uses the last card in a turn, including a static AI SDK tool part', () => {
    const message = assistant('checkHandle', {
      action: 'check_handle',
      handle: 'artist',
    });
    message.parts.push({
      type: 'tool-proposeCheckout',
      toolCallId: 'checkout',
      state: 'output-available',
      input: {},
      output: {
        action: 'propose_checkout',
        plan: null,
        handoffUrl: '/onboarding/checkout',
      },
    });
    expect(
      getOnboardingComposerPlaceholder({ ...context, messages: [message] })
    ).toBe('Continue to checkout above or ask a question…');
  });

  it('does not revive a card from a previous assistant turn', () => {
    const messages: UIMessage[] = [
      assistant('checkHandle', { action: 'check_handle', handle: 'artist' }),
      {
        id: 'question',
        role: 'assistant',
        parts: [{ type: 'text', text: 'When is your next release?' }],
      },
    ];
    expect(getOnboardingComposerPlaceholder({ ...context, messages })).toBe(
      'Reply to Jovie…'
    );
  });

  it('does not prompt for a picker hidden after artist selection', () => {
    expect(
      getOnboardingComposerPlaceholder({
        ...context,
        selectedArtistId: 'selected',
        messages: [
          assistant('searchSpotifyArtist', { action: 'open_artist_picker' }),
        ],
      })
    ).toBe('Reply to Jovie…');
  });

  it.each(['input-streaming', 'output-error'])(
    'guides a handle in %s state',
    state => {
      expect(
        getOnboardingComposerPlaceholder({
          ...context,
          handleDraft: null,
          messages: [assistant('checkHandle', undefined, state)],
        })
      ).toBe('Type a handle to check…');
    }
  );

  it('does not prompt for a handle collapsed by a completion event', () => {
    const messages: UIMessage[] = [
      assistant('checkHandle', { action: 'check_handle', handle: 'artist' }),
      {
        id: 'confirmed',
        role: 'user',
        parts: [{ type: 'text', text: 'Confirmed' }],
        metadata: { onboardingEvent: 'handle_confirmed', handle: 'artist' },
      },
    ];
    expect(getOnboardingComposerPlaceholder({ ...context, messages })).toBe(
      'Reply to Jovie…'
    );
  });
  it('guides a restored handle card before its draft callback runs', () => {
    expect(
      getOnboardingComposerPlaceholder({
        ...context,
        handleDraft: null,
        messages: [
          assistant('checkHandle', {
            action: 'check_handle',
            handle: 'artist',
          }),
        ],
      })
    ).toBe('Confirm handle or type a different one…');
  });

  it('guides a social card while its tool input streams', () => {
    expect(
      getOnboardingComposerPlaceholder({
        ...context,
        messages: [
          assistant('proposeSocialLink', undefined, 'input-streaming'),
        ],
      })
    ).toBe('Attach a social link above or paste one here…');
  });

  it.each(['proposeNextStep', 'proposeCheckout'])(
    'does not nominate %s before its renderable payload arrives',
    name => {
      expect(
        getOnboardingComposerPlaceholder({
          ...context,
          messages: [assistant(name, undefined, 'input-streaming')],
        })
      ).toBe('Reply to Jovie…');
    }
  );

  it.each(['searchSpotifyArtist', 'checkHandle', 'proposeSocialLink'])(
    'ignores an unrenderable %s output',
    name => {
      expect(
        getOnboardingComposerPlaceholder({
          ...context,
          messages: [assistant(name, { action: 'unexpected' })],
        })
      ).toBe('Reply to Jovie…');
    }
  );
});
