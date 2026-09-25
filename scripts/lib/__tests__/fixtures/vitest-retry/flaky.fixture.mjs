import { expect, test } from 'vitest';

let attempts = 0;

test('fails once then passes', () => {
  attempts += 1;
  expect(attempts).toBeGreaterThan(1);
});

test('always passes', () => {
  expect(true).toBe(true);
});
