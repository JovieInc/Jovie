/**
 * Deterministic onboarding transcript quality evals.
 *
 * These are cheap gates for the product rules that should hold before any
 * model-graded evals run: first-turn disclosure, one question per turn,
 * data-grounded Spotify observation, late pricing, and concrete objection
 * handling.
 *
 * Run:
 *   pnpm --filter @jovie/web exec vitest run tests/unit/chat/onboarding-transcript-quality.eval.test.ts
 */

import { describe, expect, it } from 'vitest';
import { ONBOARDING_SYSTEM_PROMPT } from '@/lib/chat/prompts/onboarding';

interface TranscriptTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly afterTool?: 'confirmSpotifyArtist' | 'proposeCheckout';
}

interface TranscriptCheck {
  readonly passed: boolean;
  readonly reasons: string[];
}

const GENERIC_OBJECTION_COPY = [
  'we offer a comprehensive solution',
  'unlock your potential',
  'take your career to the next level',
  'robust platform',
];

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function mentionsPricing(text: string): boolean {
  return /\$|\bpricing\b|\bfree tier\b|\bpro\b|\bmax\b|\bper month\b/i.test(
    text
  );
}

function hasDisclosure(text: string): boolean {
  return /remember|pick up where we left off|save this chat/i.test(text);
}

function hasDataObservation(text: string): boolean {
  return (
    /\d/.test(text) &&
    /\b(followers|popularity|genre|release|spotify)\b/i.test(text)
  );
}

function evaluateTranscript(turns: readonly TranscriptTurn[]): TranscriptCheck {
  const reasons: string[] = [];
  const firstAssistant = turns.find(turn => turn.role === 'assistant');

  if (!firstAssistant || !hasDisclosure(firstAssistant.text)) {
    reasons.push('first assistant turn must include memory disclosure');
  }

  for (const turn of turns) {
    if (turn.role === 'assistant' && countQuestions(turn.text) > 1) {
      reasons.push(`assistant turn has more than one question: ${turn.text}`);
    }
  }

  const spotifyTurn = turns.find(
    turn =>
      turn.role === 'assistant' && turn.afterTool === 'confirmSpotifyArtist'
  );
  if (!spotifyTurn || !hasDataObservation(spotifyTurn.text)) {
    reasons.push('post-Spotify turn must include a concrete data observation');
  }

  const firstPricingTurn = turns.findIndex(
    turn => turn.role === 'assistant' && mentionsPricing(turn.text)
  );
  const checkoutTurn = turns.findIndex(
    turn => turn.role === 'assistant' && turn.afterTool === 'proposeCheckout'
  );
  if (
    firstPricingTurn >= 0 &&
    (checkoutTurn < 0 || firstPricingTurn < checkoutTurn)
  ) {
    reasons.push('pricing appeared before checkout intent');
  }

  const fullText = turns
    .map(turn => turn.text)
    .join('\n')
    .toLowerCase();
  for (const phrase of GENERIC_OBJECTION_COPY) {
    if (fullText.includes(phrase)) {
      reasons.push(`generic objection copy detected: ${phrase}`);
    }
  }

  return { passed: reasons.length === 0, reasons };
}

describe('Onboarding transcript quality eval', () => {
  it('keeps the canonical product rules in the system prompt', () => {
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('You DO THE WORK');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('One question per turn');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('FIRST chat bubble');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('After `confirmSpotifyArtist`');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('Do NOT lead with pricing');
  });

  it('passes a grounded, late-pricing onboarding transcript', () => {
    const result = evaluateTranscript([
      {
        role: 'assistant',
        text: "Hey, I'm Jovie. Heads up, I'll remember this chat so we can pick up where we left off if you sign up. What are you working on?",
      },
      { role: 'user', text: 'I am Test Artist and I have a single coming.' },
      {
        role: 'assistant',
        afterTool: 'confirmSpotifyArtist',
        text: 'Pulled you up. 12.3K Spotify followers and indie pop is the right lane, but the release layer is still manual. What is making you fix this now?',
      },
      {
        role: 'assistant',
        afterTool: 'proposeCheckout',
        text: 'That is the move. Pro is $39/mo, free tier exists if you want to start lighter.',
      },
    ]);

    expect(result).toEqual({ passed: true, reasons: [] });
  });

  it('fails generic early-pricing transcripts', () => {
    const result = evaluateTranscript([
      {
        role: 'assistant',
        text: 'welcome. what are your goals and budget?',
      },
      { role: 'user', text: 'I already use Linktree.' },
      {
        role: 'assistant',
        afterTool: 'confirmSpotifyArtist',
        text: 'we offer a comprehensive solution. Pro is $39/mo. what do you think?',
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'first assistant turn must include memory disclosure',
        'post-Spotify turn must include a concrete data observation',
        'pricing appeared before checkout intent',
        'generic objection copy detected: we offer a comprehensive solution',
      ])
    );
  });
});
