import { describe, expect, it } from 'vitest';
import {
  expectationFor,
  parseVerdict,
  reviewScreenshot,
  sumUsage,
  visionChecksFor,
} from '../prod-dogfood-vision.mjs';

const bytes = Buffer.from('png');
const gateway = replies => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const text = replies.shift();
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: 1000, completion_tokens: 50 },
      }),
    };
  };
  return { fetchImpl, calls };
};

describe('parseVerdict', () => {
  it('tolerates fences and drops empty findings', () => {
    const v = parseVerdict(
      '```json\n{"verdict":"defect","findings":[{"category":"layout","severity":"P2","summary":"Overlap","where":"top"},{"summary":""}]}\n```'
    );
    expect(v).toEqual({
      verdict: 'defect',
      findings: [
        {
          category: 'layout',
          severity: 'P2',
          summary: 'Overlap',
          where: 'top',
        },
      ],
    });
  });
  it('rejects non-verdicts', () => {
    expect(parseVerdict('looks fine')).toBeNull();
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull();
  });
});

describe('reviewScreenshot', () => {
  const input = {
    bytes,
    expectation: expectationFor('profile'),
    viewport: 'phone',
    apiKey: 'k',
  };
  it('keeps only findings the second pass confirms', async () => {
    const { fetchImpl, calls } = gateway([
      '{"verdict":"defect","findings":[{"category":"clipped-text","summary":"Title cut off","where":"hero"},{"category":"layout","summary":"Misaligned","where":"footer"}]}',
      '{"confirmed":true}',
      '{"confirmed":false}',
    ]);
    const r = await reviewScreenshot({ ...input, fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.findings.map(f => f.category)).toEqual(['clipped-text']);
    expect(calls).toHaveLength(3);
    expect(calls[0].messages[0].content[1].image_url.url).toMatch(
      /^data:image\/png;base64,/
    );
    expect(sumUsage([r]).calls).toBe(3);
  });
  it('is unverified, not green, when the review cannot run', async () => {
    const r = await reviewScreenshot({ ...input, apiKey: '' });
    expect(r.ok).toBe(false);
    const [c] = visionChecksFor({
      shot: {
        url: 'u',
        viewport: 'phone',
        mission: 'm',
        page: 'profile',
        file: 'f.png',
      },
      review: r,
    });
    expect(c.status).toBe('unverified');
  });
  it('turns a confirmed finding into one failed check per category', async () => {
    const { fetchImpl } = gateway([
      '{"verdict":"defect","findings":[{"category":"missing-image","summary":"Cover is blank","where":"top"}]}',
      '{"confirmed":true}',
    ]);
    const r = await reviewScreenshot({ ...input, fetchImpl });
    const [c] = visionChecksFor({
      shot: {
        url: 'https://jov.ie/tim',
        viewport: 'phone',
        mission: 'dogfood:rendered-public-ui',
        page: 'profile',
        file: 'f.png',
        expectation: 'x',
      },
      review: r,
    });
    expect(c).toMatchObject({
      status: 'failed',
      id: 'vision-review',
      target: 'https://jov.ie/tim#phone#missing-image',
      severity: 'P2',
    });
  });
});
