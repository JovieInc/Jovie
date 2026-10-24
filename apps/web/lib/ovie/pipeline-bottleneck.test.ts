// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  mergePipelineBottleneck,
  PIPELINE_BOTTLENECK_MAX_AGE_MS,
  pipelineBottleneckContributionSchema,
  pipelineBottleneckSchema,
} from './pipeline-bottleneck';
import {
  bottleneckFixture,
  contributionFixture,
} from './pipeline-bottleneck.fixtures';

const now = Date.parse('2026-10-24T01:00:00Z');
const recent = new Date(now - 1000).toISOString();
const summer = () => bottleneckFixture({ observedAt: recent });
const loop = () => contributionFixture({ observedAt: recent });

describe('pipeline bottleneck contract and merge', () => {
  it('validates the contract, including active rank1 and actionable needs-you', () => {
    expect(pipelineBottleneckSchema.safeParse(summer()).success).toBe(true);
    expect(
      pipelineBottleneckSchema.safeParse({ ...summer(), rank1: null }).success
    ).toBe(false);
    expect(
      pipelineBottleneckSchema.safeParse({ ...summer(), status: 'clear' })
        .success
    ).toBe(false);
    expect(
      pipelineBottleneckSchema.safeParse({ ...summer(), status: 'needs-you' })
        .success
    ).toBe(false);
    expect(
      pipelineBottleneckSchema.safeParse({
        ...summer(),
        sourceDigest: 'invalid',
      }).success
    ).toBe(false);
    expect(
      pipelineBottleneckContributionSchema.safeParse({
        ...loop(),
        metrics: { cpu: { value: '94', label: 'CPU', unit: '%' } },
      }).success
    ).toBe(false);
    expect(
      pipelineBottleneckContributionSchema.safeParse({
        ...loop(),
        rank1Override: { ...loop().rank1Override, oneLine: 'x'.repeat(141) },
      }).success
    ).toBe(false);
  });

  it.each([
    null,
    {},
    {
      ...summer(),
      observedAt: new Date(
        now - PIPELINE_BOTTLENECK_MAX_AGE_MS - 1
      ).toISOString(),
    },
    { ...summer(), observedAt: new Date(now + 1).toISOString() },
  ])(
    'hides absent, invalid, stale, or future Summer records even with a fresh escalation',
    async input => {
      expect(await mergePipelineBottleneck(input, loop(), now)).toBeNull();
    }
  );

  it('preserves Summer rank1, status, and ownership for metrics-only contributions', async () => {
    const result = await mergePipelineBottleneck(
      summer(),
      { ...loop(), status: undefined },
      now
    );
    expect(result).toMatchObject({
      status: 'agentic',
      rank1: summer().rank1,
      owner: 'Summer',
      dispatchRef: summer().dispatchRef,
      metrics: loop().metrics,
    });
  });

  it.each([
    { cost: undefined },
    { impact: undefined },
    {
      observedAt: new Date(now - PIPELINE_BOTTLENECK_MAX_AGE_MS).toISOString(),
    },
    {
      observedAt: new Date(
        now - PIPELINE_BOTTLENECK_MAX_AGE_MS - 1
      ).toISOString(),
    },
    { observedAt: new Date(now + 1).toISOString() },
  ])(
    'does not promote an incomplete, expired, or future escalation: %j',
    async override => {
      expect(
        await mergePipelineBottleneck(summer(), { ...loop(), ...override }, now)
      ).toMatchObject({ status: 'agentic', rank1: summer().rank1 });
    }
  );

  it('promotes a fresh actionable escalation without attributing it to an unrelated repair', async () => {
    const contribution = {
      ...loop(),
      observedAt: new Date(now - 60_000).toISOString(),
    };
    const result = await mergePipelineBottleneck(summer(), contribution, now);
    expect(result).toMatchObject({
      status: 'needs-you',
      rank1: contribution.rank1Override,
      cost: contribution.cost,
      impact: contribution.impact,
      owner: null,
      dispatchRef: null,
      observedAt: contribution.observedAt,
    });
    expect(result?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result?.sourceDigest).not.toBe(summer().sourceDigest);
  });

  it('can escalate the existing rank1, but cannot create a needs-you record without one', async () => {
    expect(
      await mergePipelineBottleneck(
        summer(),
        { ...loop(), rank1Override: undefined },
        now
      )
    ).toMatchObject({ status: 'needs-you', rank1: summer().rank1 });
    const clear = { ...summer(), status: 'clear', rank1: null };
    expect(
      await mergePipelineBottleneck(
        clear,
        { ...loop(), rank1Override: undefined },
        now
      )
    ).toMatchObject({ status: 'clear', rank1: null });
    expect(await mergePipelineBottleneck(clear, loop(), now)).toMatchObject({
      status: 'needs-you',
      rank1: loop().rank1Override,
    });
  });

  it('ignores corrupt or stale optional contributions and retains fresh Summer clear state at the age boundary', async () => {
    const clear = {
      ...summer(),
      status: 'clear',
      rank1: null,
      observedAt: new Date(now - PIPELINE_BOTTLENECK_MAX_AGE_MS).toISOString(),
    };
    expect(await mergePipelineBottleneck(clear, null, now)).toMatchObject({
      status: 'clear',
      metrics: {},
    });
    expect(
      await mergePipelineBottleneck(
        summer(),
        { ...loop(), metrics: 'invalid' },
        now
      )
    ).toMatchObject({ status: 'agentic', metrics: {} });
    expect(
      await mergePipelineBottleneck(
        summer(),
        {
          ...loop(),
          observedAt: new Date(
            now - PIPELINE_BOTTLENECK_MAX_AGE_MS - 1
          ).toISOString(),
        },
        now
      )
    ).toMatchObject({ status: 'agentic', metrics: {} });
  });

  it('does not mutate inputs and digests the canonical merged body independently of key order', async () => {
    const input = summer();
    const before = JSON.stringify(input);
    const first = await mergePipelineBottleneck(input, loop(), now);
    const second = await mergePipelineBottleneck(
      Object.fromEntries(Object.entries(input).reverse()),
      loop(),
      now
    );
    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    const { sourceDigest, ...body } = first!;
    const canonical = (value: unknown): unknown =>
      value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map(key => [
                key,
                canonical((value as Record<string, unknown>)[key]),
              ])
          )
        : value;
    expect(sourceDigest).toBe(
      createHash('sha256')
        .update(JSON.stringify(canonical(body)))
        .digest('hex')
    );
  });
});
