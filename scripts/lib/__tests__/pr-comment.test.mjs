import { expect, it } from 'vitest';
import { parse, prepare } from '../../pr-comment.mjs';

it('parses the PR number and body file', () => {
  expect(parse(['24820', '--body-file', 'x.md'])).toEqual({
    number: '24820',
    bodyFile: 'x.md',
    dryRun: false,
  });
  expect(() => parse(['--body-file', 'x.md'])).toThrow(/usage/);
});

it('scrubs personal data before posting and reports that it did', () => {
  const person = ['jane', 'gmail.com'].join('@');
  const out = prepare(`CI green; contact ${person}\n`);
  expect(out.body).toBe('CI green; contact [REDACTED-PERSONAL]');
  expect(out.scrubbed).toBe(true);
  expect(prepare('All 52 checks passed.').scrubbed).toBe(false);
  expect(() => prepare('   ')).toThrow(/empty/);
});
