import { describe, expect, it } from 'vitest';
import { lintCopy } from './lint';
import type { CopyRegister } from './rules';

const blocks = (text: string, register: CopyRegister = 'jovie-marketing') =>
  lintCopy(text, { register }).blocking.map(finding => finding.rule);

describe('universal floor blocks in every register', () => {
  const registers: CopyRegister[] = [
    'jovie-marketing',
    'founder-tim',
    'customer-voice',
  ];
  it.each([
    ['directed-abuse', "Honestly you're an idiot if you skip this."],
    ['directed-abuse', 'Fuck you, pay me.'],
    ['threat-or-self-harm', "Leave a bad review and you'll regret it."],
    ['guaranteed-results', 'Guaranteed 10k streams in your first week.'],
    ['income-claim', 'Artists make $5,000 a month with this.'],
    ['risk-free', 'Try it risk-free.'],
    ['fake-scarcity', 'Only 3 spots left for founding artists.'],
    ['unsubstantiated-superlative', 'The #1 link in bio for musicians.'],
    ['artificial-engagement', 'Buy real streams and grow faster.'],
    ['secret-material', 'Use key sk-live_abcdefghijklmnop1234 to connect.'],
    ['model-residue', 'Certainly! Here is your bio.'],
    ['model-residue', 'I hope this email finds you well.'],
    ['template-residue', 'Hey [insert name], your release is live.'],
    ['contempt-for-people', 'Most fans are sheep anyway.'],
    ['em-dash', 'Your music — everywhere.'],
  ])('%s: %s', (rule, text) => {
    for (const register of registers)
      expect(blocks(text, register)).toContain(rule);
  });

  it('floor rules cannot be waived', () => {
    const result = lintCopy('Guaranteed streams.', {
      register: 'jovie-marketing',
      allow: ['guaranteed-results'],
    });
    expect(result.ok).toBe(false);
  });
});

describe('slop tells', () => {
  it.each([
    [
      'negative-parallelism',
      "It's not a link in bio. It's your whole release plan.",
    ],
    ['negative-parallelism', 'Not just a profile, but a home for your fans.'],
    ['banned-phrase', "Here's the thing: fans forget."],
    ['banned-phrase', 'Excited to announce our new feature.'],
    ['corporate-verb', 'Leverage a seamless, robust workflow.'],
    ['style-as-outcome', 'A modern, elegant, seamless experience.'],
    ['cheerleading', 'You are crushing it, superstar.'],
    ['emoji', 'New release out now 🎵'],
    ['shouting', 'This is HUGE for your release.'],
    ['multi-exclamation', 'Out now!!'],
  ])('%s: %s', (rule, text) => {
    expect(blocks(text)).toContain(rule);
  });

  it('matches curly apostrophes too', () => {
    expect(blocks('It’s not a tool. It’s a team.')).toContain(
      'negative-parallelism'
    );
  });
});

describe('registers scope house style, not the floor', () => {
  it('founder voice may swear for emphasis but never at a person', () => {
    expect(blocks('This release plan is fucking good.', 'founder-tim')).toEqual(
      []
    );
    expect(blocks('Fuck off with that plan.', 'founder-tim')).toContain(
      'directed-abuse'
    );
  });

  it('customer voice keeps their emoji and slang', () => {
    expect(
      blocks('new single out friday 🔥 go stream it', 'customer-voice')
    ).toEqual([]);
  });

  it('hedging blocks Jovie persona and only warns on marketing', () => {
    expect(blocks('Maybe try a link page.', 'jovie-persona')).toContain(
      'hedging'
    );
    expect(blocks('Maybe try a link page.', 'jovie-marketing')).not.toContain(
      'hedging'
    );
  });
});

describe('brand frame protects Tim and Jovie', () => {
  it.each([
    'Been there. It gets better.',
    'I know how that feels, man.',
    "We're still catching up to the big players.",
    'Fingers crossed this launch works.',
    'So grateful someone took a chance on us.',
  ])('%s', text => {
    expect(blocks(text, 'founder-tim')).toContain('brand-frame');
  });

  it('allows the reframe', () => {
    expect(
      blocks(
        'The interesting part is what the second release taught you.',
        'founder-tim'
      )
    ).toEqual([]);
  });

  it('does not police a customer telling their own story', () => {
    expect(blocks('been there, still grinding', 'customer-voice')).toEqual([]);
  });
});

describe('passing controls: concrete language survives', () => {
  it.each([
    'See which link turned a listener into a subscriber.',
    'Update your profile once and keep every shared link current.',
    'Let fans opt in so you can reach them again.',
    'Your release week starts two weeks before the song is out.',
    'Jovie builds release pages from your ISRC.',
    "It's free. It's yours.",
    'color: #1a1a1a; border: 1px solid #1f2937;',
    'Release-week FOMO is real.',
    'One adaptive premium profile for every fan.',
  ])('%s', text => {
    expect(blocks(text)).toEqual([]);
  });
});
