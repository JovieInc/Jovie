import { describe, expect, it } from 'vitest';
import {
  evaluatePrSizePolicy,
  parseIntegrationTrainSources,
} from '../pr-size-guard-policy.mjs';

const validBody = `
<!-- integration-train-sources
- https://github.com/JovieInc/Jovie/pull/14018
- https://github.com/JovieInc/Jovie/pull/14034
- https://github.com/JovieInc/Jovie/pull/14139
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
        `${validBody}\n${validBody}\nhttps://github.com/other/repo/pull/9`
      )
    ).toEqual([14018, 14034, 14139]);
  });
});
