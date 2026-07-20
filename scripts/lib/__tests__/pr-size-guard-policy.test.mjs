import { describe, expect, it } from 'vitest';
import {
  evaluatePrSizePolicy,
  parseIntegrationTrainOmissions,
  parseIntegrationTrainSources,
  verifyIntegrationTrainSourceCoverage,
} from '../pr-size-guard-policy.mjs';

const validBody = `
<!-- integration-train-sources
- https://github.com/JovieInc/Jovie/pull/14018 @ 1111111111111111111111111111111111111111
- https://github.com/JovieInc/Jovie/pull/14034 @ 2222222222222222222222222222222222222222
- https://github.com/JovieInc/Jovie/pull/14139 @ 3333333333333333333333333333333333333333
-->
`;

const evaluate = overrides =>
  evaluatePrSizePolicy({
    labels: ['integration-train'],
    body: validBody,
    lines: 1897,
    files: 41,
    maxLines: 1500,
    maxFiles: 40,
    ...overrides,
  });

describe('bounded integration-train PR size policy', () => {
  it('admits a labeled train with at least two machine-readable component PRs', () => {
    const result = evaluate();

    expect(result).toMatchObject({
      passed: true,
      policy: 'integration-train',
      capLines: 2500,
      capFiles: 60,
      sources: [14018, 14034, 14139],
    });
  });

  it('fails closed when the source marker is missing or has fewer than two PRs', () => {
    expect(evaluate({ body: 'Sources: #14018, #14034' }).passed).toBe(false);
    expect(
      evaluate({
        body: `<!-- integration-train-sources\n- https://github.com/JovieInc/Jovie/pull/14018\n-->`,
      }).passed
    ).toBe(false);
  });

  it('rejects a documented train above either elevated cap', () => {
    expect(evaluate({ lines: 2501 }).passed).toBe(false);
    expect(evaluate({ files: 61 }).passed).toBe(false);
  });

  it('keeps ordinary PRs on the unchanged configured caps', () => {
    const result = evaluate({ labels: [], lines: 1501, files: 40 });

    expect(result).toMatchObject({
      passed: false,
      policy: 'standard',
      capLines: 1500,
      capFiles: 40,
    });
  });

  it('fails closed on invalid size input', () => {
    expect(evaluate({ lines: Number.NaN }).passed).toBe(false);
  });

  it('deduplicates exact Jovie source links and ignores other repositories', () => {
    expect(
      parseIntegrationTrainSources(
        `${validBody}\nhttps://github.com/other/repo/pull/9`
      )
    ).toEqual([14018, 14034, 14139]);
  });

  it('fails closed when a source head is not pinned', () => {
    expect(
      evaluate({
        body: `<!-- integration-train-sources\n- https://github.com/JovieInc/Jovie/pull/14018\n- https://github.com/JovieInc/Jovie/pull/14034\n-->`,
      })
    ).toMatchObject({ passed: false, policy: 'integration-train' });
  });

  it('parses explicit path omissions and rejects unsafe paths', () => {
    expect(
      parseIntegrationTrainOmissions(`<!-- integration-train-omissions
{"14034":["apps/web/tests/a11y.test.ts"]}
-->`)
    ).toEqual({ 14034: ['apps/web/tests/a11y.test.ts'] });
    expect(() =>
      parseIntegrationTrainOmissions(`<!-- integration-train-omissions
{"14034":["../secret"]}
-->`)
    ).toThrow(/safe repository paths/);
  });
});

describe('integration-train source path coverage', () => {
  const body = `<!-- integration-train-sources
- https://github.com/JovieInc/Jovie/pull/14018 @ 1111111111111111111111111111111111111111
- https://github.com/JovieInc/Jovie/pull/14034 @ 2222222222222222222222222222222222222222
-->`;
  const pulls = {
    14018: {
      head: { sha: '1'.repeat(40), repo: { full_name: 'JovieInc/Jovie' } },
    },
    14034: {
      head: { sha: '2'.repeat(40), repo: { full_name: 'JovieInc/Jovie' } },
    },
  };
  const files = {
    14303: ['product.ts', 'product.test.ts', 'other.ts'],
    14018: ['other.ts'],
    14034: ['product.ts', 'product.test.ts'],
  };
  const verify = (overrides = {}) =>
    verifyIntegrationTrainSourceCoverage({
      body,
      trainNumber: 14303,
      loadPull: async number => pulls[number],
      loadFiles: async number => files[number],
      ...overrides,
    });

  it('passes when every pinned source path is represented', async () => {
    await expect(verify()).resolves.toMatchObject([
      { number: 14018, covered: 1, omitted: 0 },
      { number: 14034, covered: 2, omitted: 0 },
    ]);
  });

  it('fails when the integration train lists itself as a source PR', async () => {
    await expect(
      verify({
        body: `<!-- integration-train-sources
- https://github.com/JovieInc/Jovie/pull/14303 @ 3333333333333333333333333333333333333333
- https://github.com/JovieInc/Jovie/pull/14018 @ 1111111111111111111111111111111111111111
-->`,
      })
    ).rejects.toThrow('integration train #14303 cannot list itself');
  });

  it('fails when a declared source product or test path is missing', async () => {
    await expect(
      verify({
        loadFiles: async number =>
          number === 14303 ? ['product.ts', 'other.ts'] : files[number],
      })
    ).rejects.toThrow(
      'source PR #14034 has 1 undeclared missing path(s): product.test.ts'
    );
  });

  it('allows a reviewed JSON omission for an intentionally absent path', async () => {
    const bodyWithOmission = `${body}
<!-- integration-train-omissions
{"14034":["product.test.ts"]}
-->`;
    await expect(
      verify({
        body: bodyWithOmission,
        loadFiles: async number =>
          number === 14303 ? ['product.ts', 'other.ts'] : files[number],
      })
    ).resolves.toMatchObject([
      { number: 14018, covered: 1, omitted: 0 },
      {
        number: 14034,
        covered: 1,
        omitted: 1,
        omissionPaths: ['product.test.ts'],
      },
    ]);
  });

  it('fails closed when source metadata cannot be loaded', async () => {
    await expect(
      verify({
        loadPull: async () => {
          throw new Error('GitHub API unavailable');
        },
      })
    ).rejects.toThrow('GitHub API unavailable');
  });

  it('fails when the pinned source head no longer matches GitHub', async () => {
    await expect(
      verify({
        loadPull: async number => ({
          ...pulls[number],
          head: { ...pulls[number].head, sha: 'f'.repeat(40) },
        }),
      })
    ).rejects.toThrow('source PR #14018 head identity mismatch');
  });
});
