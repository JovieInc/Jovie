import { describe, expect, it } from 'vitest';
import {
  ASK_JOVIE_SUGGESTIONS,
  classifyAskJovieIntent,
} from '@/lib/ask-jovie/intent';

describe('classifyAskJovieIntent', () => {
  it('classifies capability questions as feature requests', () => {
    expect(classifyAskJovieIntent('Can Jovie do SMS campaigns?')).toBe(
      'feature-request'
    );
    expect(classifyAskJovieIntent('I wish you supported merch')).toBe(
      'feature-request'
    );
  });

  it('classifies problems as support', () => {
    expect(classifyAskJovieIntent('My link page is broken')).toBe('support');
    expect(classifyAskJovieIntent("I can't log in")).toBe('support');
  });

  it('classifies how-to questions as education', () => {
    expect(classifyAskJovieIntent('How do I add a release?')).toBe('education');
    expect(classifyAskJovieIntent('Show me how to use Jovie')).toBe(
      'education'
    );
  });

  it('classifies action requests as task intent', () => {
    expect(classifyAskJovieIntent('Create a new smart link')).toBe('task');
    expect(classifyAskJovieIntent('Schedule my release post')).toBe('task');
  });

  it('falls back to feedback for uncategorized messages', () => {
    expect(classifyAskJovieIntent('Nice work')).toBe('feedback');
    expect(classifyAskJovieIntent('')).toBe('feedback');
  });
});

describe('ASK_JOVIE_SUGGESTIONS', () => {
  it('covers help, walkthrough, feedback, and feature request', () => {
    const intents = ASK_JOVIE_SUGGESTIONS.map(s => s.intent);
    expect(intents).toContain('education');
    expect(intents).toContain('support');
    expect(intents).toContain('feedback');
    expect(intents).toContain('feature-request');
  });
});
