import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { deriveProfileBuilderState } from '@/components/features/onboarding/onboardingChatHelpers';
import { decideFallbackTurn } from '@/lib/chat/onboarding-script/engine';
import { createOnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';
import { deriveClaimedOnboardingStateFromToolEvents } from './claimed-state';
import {
  advanceOnboardingProfileDraft,
  availableOnboardingModules,
  emptyOnboardingProfileDraft,
  ONBOARDING_ROLE_ADAPTERS,
  type OnboardingRole,
  profileDraftUrls,
  readOnboardingProfileDraft,
} from './profile-draft';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      throw new Error('no database');
    },
  },
}));
vi.mock('@/lib/spotify', () => ({ getSpotifyArtist: vi.fn() }));

const conversations: readonly [OnboardingRole, string, string, string][] = [
  [
    'artist',
    'musician',
    'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
    'fan signup',
  ],
  ['author', 'novelist', 'https://books.example/about', 'reader signup'],
  ['creator', 'creator', 'https://www.youtube.com/@sample', 'collaborations'],
  ['expert', 'consultant', 'https://services.example/cases', 'booking'],
  ['founder', 'founder', 'https://company.example/', 'buyer contact'],
];
const user = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

describe('adaptive onboarding recorded conversations', () => {
  it.each(conversations)(
    '%s keeps domain-specific interview evidence through resume and claim',
    async (role, label, url, outcome) => {
      const first = user('identity', `I am a ${label}. ${url}`);
      let draft = advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
        id: first.id,
        text: first.parts[0].type === 'text' ? first.parts[0].text : '',
      });
      expect(draft.roles).toEqual([role]);
      expect(draft.selectedSource?.url).toBe(url);
      draft.selectedSource = {
        url,
        status: 'available',
        title: `${label} work`,
        description: 'Published work',
        fetchedAt: '2026-10-20T19:00:00.000Z',
      };
      const state = createOnboardingTurnState({
        sessionId: 'recording',
        turnCount: 1,
        accessControlled: true,
      });
      state.profileDraft = draft;
      if (role === 'artist') state.spotifyArtistId = '4Uwpa6zW3zzCSQvooQNksm';
      const question = await decideFallbackTurn({ uiMessages: [first], state });
      expect(question.text).toContain(ONBOARDING_ROLE_ADAPTERS[role].question);
      expect(question.toolEvents).toEqual([]);
      if (role !== 'artist')
        expect(question.text).not.toMatch(/spotify|isrc|fan\b/i);

      draft = advanceOnboardingProfileDraft(draft, {
        id: 'goal',
        text: `I want ${outcome}`,
      });
      const event = {
        schemaVersion: 2 as const,
        toolCallId: 'saved-draft',
        toolName: 'recordInterviewSignal',
        uiHint: 'status' as const,
        state: 'succeeded' as const,
        output: { action: 'profile_draft_recorded', profileDraft: draft },
      };
      const assistant = {
        id: 'saved',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            state: 'output-available',
            input: {},
            output: event.output,
          },
        ],
      } as UIMessage;
      const restored = createOnboardingTurnState({
        sessionId: 'signed-in-resume',
        turnCount: 3,
        accessControlled: true,
        messages: [assistant],
      });
      expect(restored.profileDraft).toEqual(draft);
      expect(
        deriveClaimedOnboardingStateFromToolEvents([event]).profileDraft
      ).toEqual(draft);
      expect(
        deriveProfileBuilderState({
          messages: [assistant],
          handleDraft: null,
          selectedArtist: null,
        }).profileDraft
      ).toEqual(draft);
      expect(
        deriveProfileBuilderState({
          messages: [{ ...assistant, parts: [], metadata: event.output }],
          handleDraft: null,
          selectedArtist: null,
        }).profileDraft
      ).toEqual(draft);
      expect(availableOnboardingModules(draft)).toContain('public-profile');
      if (role !== 'artist') {
        expect(availableOnboardingModules(draft)).toEqual(['public-profile']);
        const handle = user('handle', '@mywork');
        const check = await decideFallbackTurn({
          uiMessages: [handle],
          state: restored,
        });
        expect(check.toolEvents.map(e => e.toolName)).toEqual(['checkHandle']);
        const confirmed = {
          id: 'confirmed',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'checkHandle',
              toolCallId: 'confirmed',
              state: 'output-available',
              input: {},
              output: { action: 'handle_confirmed', handle: 'mywork' },
            },
          ],
        } as UIMessage;
        const checked = {
          ...confirmed,
          id: 'checked',
          parts: [
            {
              ...confirmed.parts[0],
              output: { action: 'check_handle', handle: 'mywork' },
            },
          ],
        } as UIMessage;
        const waiting = await decideFallbackTurn({
          uiMessages: [checked, user('ack', 'ok')],
          state: restored,
        });
        expect(waiting.toolEvents).toEqual([]);
        const next = await decideFallbackTurn({
          uiMessages: [checked, confirmed, user('next', 'continue')],
          state: restored,
        });
        expect(next.toolEvents).toMatchObject([
          {
            toolName: 'proposeNextStep',
            output: { decision: { kind: 'waitlist' } },
          },
        ]);
        expect(next.text).not.toMatch(/paid|unlocked|claimed|live/i);
      }
    }
  );

  it('never opens Spotify for an unknown visitor on a later turn', async () => {
    const state = createOnboardingTurnState({
      sessionId: 'unknown',
      turnCount: 4,
    });
    state.profileDraft = emptyOnboardingProfileDraft();
    const turn = await decideFallbackTurn({
      uiMessages: [user('hi', 'hello again')],
      state,
    });
    expect(turn.toolEvents).toEqual([]);
    expect(turn.text).not.toMatch(/spotify|artist/i);
  });

  it('keeps all roles while priority changes and requires a source choice on collision', () => {
    let draft = advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
      id: 'roles',
      text: 'I am a founder and musician',
    });
    expect(draft.activeRole).toBeNull();
    expect(draft.awaiting).toBe('priority');
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'priority',
      text: 'Founder first. https://company.example https://other.example',
    });
    expect(draft.activeRole).toBe('founder');
    expect(draft.selectedSource).toBeNull();
    expect(draft.awaiting).toBe('source');
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'pick',
      text: 'https://other.example',
    });
    expect(draft.selectedSource?.url).toBe('https://other.example/');
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'switch',
      text: 'Focus on musician first',
    });
    expect(draft.roles).toEqual(['artist', 'founder']);
    expect(draft.activeRole).toBe('artist');
  });

  it('remembers each job outcome without applying the music goal to a company', () => {
    let draft = advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
      id: 'music',
      text: 'I am a musician. I want fan signup',
    });
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'founder',
      text: 'I am also a founder',
    });
    expect(draft.activeRole).toBeNull();
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'focus',
      text: 'Founder first',
    });
    expect(draft.outcome).toBeNull();
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'buyer',
      text: 'I want qualified buyer contact',
    });
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'return',
      text: 'Musician first',
    });
    expect(draft.outcome).toBe('fan signup');
    expect(draft.outcomes).toEqual({
      artist: 'fan signup',
      founder: 'qualified buyer contact',
    });
  });

  it('preserves a source-free draft without inventing identity or claiming readiness', async () => {
    let draft = advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
      id: 'role',
      text: 'I am an author',
    });
    draft = advanceOnboardingProfileDraft(draft, { id: 'skip', text: 'skip' });
    draft = advanceOnboardingProfileDraft(draft, {
      id: 'goal',
      text: 'reader signup',
    });
    expect(draft.outcome).toBe('reader signup');
    expect(draft.selectedSource).toBeNull();
    expect(
      advanceOnboardingProfileDraft(draft, {
        id: 'goal',
        text: 'invented change',
      })
    ).toEqual(draft);
    const state = createOnboardingTurnState({
      sessionId: 'no-source',
      turnCount: 3,
    });
    state.profileDraft = draft;
    const turn = await decideFallbackTurn({ uiMessages: [], state });
    expect(turn.toolEvents).toEqual([]);
    expect(turn.text).not.toMatch(/spotify|claimed|unlocked/i);
  });

  it.each([
    ['actor', 'creator'],
    ['podcaster', 'creator'],
    ['speaker', 'expert'],
  ] as const)('adapts adjacent %s work', (text, role) => {
    expect(
      advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
        id: text,
        text,
      }).activeRole
    ).toBe(role);
  });

  it('uses precise source hints and rejects unsafe URLs and invalid artifacts', () => {
    expect(
      profileDraftUrls(
        'https://localhost/ https://127.0.0.1/ https://a:b@site.example/ https://site.example./'
      )
    ).toEqual([]);
    expect(
      advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
        id: 'unknown-site',
        text: 'https://founder.example/',
      }).roles
    ).toEqual([]);
    expect(
      advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
        id: 'channel',
        text: 'https://www.youtube.com/@writer',
      }).roles
    ).toEqual(['creator']);
    expect(
      advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
        id: 'negation',
        text: 'I am not an artist. I am a founder',
      }).roles
    ).toEqual(['founder']);
    expect(
      readOnboardingProfileDraft({
        profileDraft: { version: 99, roles: ['artist'] },
      })
    ).toBeNull();
    expect(readOnboardingProfileDraft(null)).toBeNull();
  });
});
