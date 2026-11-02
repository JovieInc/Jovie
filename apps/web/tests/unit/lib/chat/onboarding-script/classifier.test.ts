import { describe, expect, it, vi } from 'vitest';
import {
  CONFIDENCE_THRESHOLD,
  classifyOnboardingText,
  type DecisionModel,
  type IntentClassification,
  refineWithDecisionModel,
} from '@/lib/chat/onboarding-script/classifier';

describe('classifyOnboardingText', () => {
  it.each([
    ['Tame Impala', 'role', 'artist_name'],
    ['  Phoebe   Bridgers ', 'artist_search', 'artist_name'],
    ["I'm Hozier", 'role', 'artist_name'],
    ['my artist name is Local Natives', 'role', 'artist_name'],
    ['hi', 'role', 'greeting'],
    ['ok', 'handle', 'ack'],
    [
      'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
      'role',
      'spotify_url',
    ],
    ['instagram.com/tameimpala', 'social', 'social_url'],
    ['@tameimpala', 'handle', 'handle_value'],
    ['what is jovie?', 'role', 'faq_what'],
    ['how much does it cost', 'role', 'faq_price'],
    ['how long does this take', 'role', 'faq_time'],
    ['who sees my page', 'handle', 'faq_ownership'],
    ['about 2k monthly listeners', 'contact', 'audience'],
    ['skip', 'social', 'skip'],
  ] as const)('reads %j at %s as %s with confidence', (text, step, intent) => {
    const result = classifyOnboardingText(text, step);
    expect(result.intent).toBe(intent);
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(result.source).toBe('rules');
  });

  it('extracts the artist name slot', () => {
    expect(classifyOnboardingText("I'm Hozier", 'role').slot).toBe('Hozier');
    expect(classifyOnboardingText('Tame Impala', 'role').slot).toBe(
      'Tame Impala'
    );
  });

  it.each([
    'I have been making music for a long time and want to figure out how to get my catalog organized somewhere',
    'can you help me with something unrelated?',
    'asdf qwer zxcv uiop hjkl bnm qaz wsx',
    '',
  ])('falls below the threshold for %j at an artist step', text => {
    const result = classifyOnboardingText(text, 'role');
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('falls below the threshold for a long unmatched reply at a later step', () => {
    const result = classifyOnboardingText(
      'one more thing that I keep wondering about is how all of the different integrations work together',
      'social'
    );
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});

describe('refineWithDecisionModel', () => {
  const gray: IntentClassification = {
    intent: 'unclear',
    confidence: 0.45,
    slot: null,
    source: 'rules',
  };
  const confident: IntentClassification = {
    intent: 'artist_name',
    confidence: 0.9,
    slot: 'Fka Twigs',
    source: 'rules',
  };

  it('keeps the rules result when no model is configured', async () => {
    expect(await refineWithDecisionModel(gray, 'x', 'role', null)).toBe(gray);
  });

  it('does not call the model for a confident read', async () => {
    const model = vi.fn<DecisionModel>();
    expect(await refineWithDecisionModel(confident, 'x', 'role', model)).toBe(
      confident
    );
    expect(model).not.toHaveBeenCalled();
  });

  it('does not call the model for a message with no signal at all', async () => {
    const model = vi.fn<DecisionModel>();
    const empty = { ...gray, confidence: 0 };
    await refineWithDecisionModel(empty, '', 'role', model);
    expect(model).not.toHaveBeenCalled();
  });

  it('takes a confident model answer in the gray zone', async () => {
    const model: DecisionModel = async () => ({
      intent: 'artist_name',
      confidence: 0.88,
      slot: 'Fka Twigs',
      source: 'rules',
    });
    const result = await refineWithDecisionModel(
      gray,
      'fka twigs',
      'role',
      model
    );
    expect(result.intent).toBe('artist_name');
    expect(result.source).toBe('decision_model');
  });

  it('ignores a low-confidence model answer', async () => {
    const model: DecisionModel = async () => ({
      intent: 'artist_name',
      confidence: 0.5,
      slot: 'x',
      source: 'rules',
    });
    expect(await refineWithDecisionModel(gray, 'x', 'role', model)).toBe(gray);
  });

  it('gives up at the budget and never waits on a slow model', async () => {
    const model: DecisionModel = () => new Promise(() => undefined);
    const started = performance.now();
    const result = await refineWithDecisionModel(gray, 'x', 'role', model, 30);
    expect(result).toBe(gray);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('swallows model errors', async () => {
    const model: DecisionModel = async () => {
      throw new Error('gateway down');
    };
    expect(await refineWithDecisionModel(gray, 'x', 'role', model)).toBe(gray);
  });
});

describe('latency budget', () => {
  it('classifies at p95 well under 1ms per message', () => {
    const samples = [
      'Tame Impala',
      "I'm Hozier",
      'what is jovie?',
      'how much does it cost',
      'ok',
      'about 2k monthly listeners',
      'a long rambling message '.repeat(20),
    ];
    const durations: number[] = [];
    for (let i = 0; i < 2000; i += 1) {
      const text = samples[i % samples.length] as string;
      const started = performance.now();
      classifyOnboardingText(text, 'role');
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] as number;
    expect(p95).toBeLessThan(1);
  });
});

describe('audience step safety', () => {
  it('does not guess at free text that could move the access decision', () => {
    const result = classifyOnboardingText('a couple thousand maybe', 'contact');
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});
