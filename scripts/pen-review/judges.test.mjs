import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJudgeReply, personaPrompt, textInventory } from './judges.mjs';

test('judge reply parsing, persona prompts and inventory', () => {
  assert.deepEqual(
    parseJudgeReply(
      'ok ```{"material": true, "issue": "CTA hidden", "element": "button", "fix": "raise it"}```'
    ),
    { material: true, issue: 'CTA hidden', element: 'button', fix: 'raise it' }
  );
  assert.equal(parseJudgeReply('no json'), null);
  assert.throws(() => personaPrompt('nobody', {}, ''), /unknown persona/);
  const p = personaPrompt(
    'heritage-manager',
    { surface: 'S1', mission: 'm', audience: 'a' },
    '- x'
  );
  assert.match(p, /intended state|deliberately shows one state/);
  assert.match(
    textInventory({
      nodes: [
        { t: 'text', tx: 'B', x: 0, y: 2 },
        { t: 'text', tx: 'A', x: 0, y: 1 },
      ],
    }),
    /^- A\n- B/
  );
});

test('settled product decisions reach every judge prompt; none means no line', async () => {
  const { personaPrompt } = await import('./judges.mjs');
  const brief = {
    surface: 'S5',
    mission: 'm',
    audience: 'a',
    decisions: ['Invites are sent by the artist from their own Gmail.'],
  };
  assert.match(
    personaPrompt('premium-critic', brief, '- x'),
    /Settled product decisions.*own Gmail/
  );
  assert.doesNotMatch(
    personaPrompt('premium-critic', { surface: 'S5', mission: 'm' }, '- x'),
    /Settled product decisions/
  );
});
