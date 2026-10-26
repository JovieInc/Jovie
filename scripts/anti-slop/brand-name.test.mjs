import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareToBaseline,
  distance,
  scanText,
  stripCommitScopes,
} from './brand-name.mjs';

const kinds = (text, file = 'a.md') =>
  scanText(text, { file }).map(h => `${h.kind}:${h.text}`);

test('deliberate red: every misspelling is flagged', () => {
  for (const bad of ['Jovy', 'Jovee', 'Jovei', 'Jovvie', 'Jovies', 'J0vie']) {
    assert.deepEqual(
      kinds(`Welcome to ${bad} today.`),
      [`misspelling:${bad}`],
      bad
    );
  }
});

test('deliberate red: the wrong domain and wrong casing are flagged', () => {
  assert.deepEqual(kinds('Visit jovie.com now'), ['domain:jovie.com']);
  assert.deepEqual(kinds('Visit jovie.io now'), ['domain:jovie.io']);
  assert.deepEqual(kinds('Sign up for jovie today'), ['casing:jovie']);
  assert.deepEqual(kinds('Sign up for JOVIE today'), ['casing:JOVIE']);
  assert.deepEqual(kinds('Sign up for JoVie today'), ['casing:JoVie']);
});

test('near-misses at edit distance 1-2 on J-words are flagged', () => {
  assert.equal(distance('jovy', 'jovie'), 2);
  assert.deepEqual(kinds('Meet Jovle here', 'x.tsx'), ['near-miss:Jovle']);
  assert.deepEqual(kinds('Meet Jvie here', 'x.tsx'), []); // not a Jo-v shape
});

test('correct usage and look-alikes pass', () => {
  assert.deepEqual(kinds("Jovie's profile at jov.ie, from Jovie."), []);
  assert.deepEqual(
    kinds('A jovial Jove, Joyce and Jolie. Join the list. Jamie, Jose.'),
    []
  );
  assert.deepEqual(
    kinds(
      'const x = jovie; import { JovieO } from "@jovie/ui"; JOVIE_API_KEY=1 jovie-web',
      'x.ts'
    ),
    []
  );
  assert.deepEqual(
    kinds(
      'See https://www.jovie.com/ and [x](https://jovie.io/a)',
      'x.md'
    ).filter(k => !k.startsWith('domain')),
    []
  );
  assert.deepEqual(kinds('Use `jovie` in the shell.'), []);
  assert.deepEqual(kinds('```\njovie login\n```\n'), []);
  assert.deepEqual(kinds('Mail ci@test.jovie.com or app.jovie.com'), []);
  assert.deepEqual(
    kinds(
      'Jovie at jov.ie is unrelated to the childcare franchise at jovie.com.'
    ),
    []
  );
});

test('Jovi is allowed only where it names the agent', () => {
  assert.deepEqual(kinds('Summer Jovi is the internal agent.'), []);
  assert.deepEqual(kinds('Ask the Jovi coach for a plan.'), []);
  assert.deepEqual(kinds('Jovi Technology Inc is the company.'), []);
  assert.deepEqual(kinds('Welcome to Jovi, the best link in bio.'), [
    'jovi-outside-agent-context:Jovi',
  ]);
});

test('casing is only checked in prose files, not code identifiers', () => {
  assert.deepEqual(kinds('const jovie = 1;', 'a.ts'), []);
  assert.deepEqual(kinds('hello jovie', 'a.html'), ['casing:jovie']);
});

test('baseline ratchet: new hits fail, baselined hits pass', () => {
  const hits = scanText('Jovy and Jovy', { file: 'a.md' });
  assert.deepEqual(compareToBaseline(hits, { 'a.md\tmisspelling': 2 }), []);
  assert.equal(compareToBaseline(hits, { 'a.md\tmisspelling': 1 }).length, 1);
  assert.equal(compareToBaseline(hits, {}).length, 1);
});

test('commit scopes are identifiers; PR and commit text is still checked', () => {
  assert.equal(stripCommitScopes('chore(jovie): fix Jovy'), 'chore: fix Jovy');
  assert.deepEqual(
    kinds(stripCommitScopes('feat(jovie): welcome to Jovy'), 'm.md'),
    ['misspelling:Jovy']
  );
});

test('the repo itself has no brand hits and needs no baseline', () => {
  assert.deepEqual(scanText('Jovie at jov.ie', { file: 'a.md' }), []);
});
