import { describe, expect, it } from 'vitest';

import headerCases from './conformance/headers.json' with { type: 'json' };
import { providerSpec } from './contract.ts';
import { classifyFailure, parseBudget } from './headers.ts';

// The same cases run in scripts/tests/test_apiclient_conformance.py.
describe('conformance: header parsing', () => {
  for (const c of headerCases.parse) {
    it(c.name, () => {
      expect(
        parseBudget(providerSpec(c.provider), c.headers, c.at, 'fallback')
      ).toEqual(c.expect);
    });
  }
});

describe('conformance: failure classification', () => {
  for (const c of headerCases.classify) {
    it(c.name, () => {
      const input = c as typeof c & {
        body?: unknown;
        text?: string;
        networkError?: boolean;
      };
      expect(
        classifyFailure(providerSpec(c.provider), {
          status: input.status,
          headers: input.headers,
          body: input.body,
          text: input.text ?? '',
          networkError: input.networkError ?? false,
          nowMs: c.at,
        })
      ).toEqual(c.expect);
    });
  }
});
