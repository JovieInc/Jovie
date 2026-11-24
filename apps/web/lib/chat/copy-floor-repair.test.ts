import type { TextStreamPart, ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { lintVoice } from '@/lib/chat/voice-lint';
import {
  copyFloorRepairTransform,
  repairCopyFloorText,
} from './copy-floor-repair';

// Real GLM reply shape from the helpfulness eval baseline (2026-10-28).
const MODEL_REPLY = `With Friday two days out, skip anything that needs lead time — editorial pitch windows are closed. Focus on first-week numbers:

- **Canvas video on Night Swim** — the 8-second loop plays during streams.
- **Two teaser posts this week** — 15-second clip, no link yet.
- Pitch 2–4 weeks ahead next time -- it matters.`;

async function runTransform(deltas: readonly string[]): Promise<string> {
  const transform = copyFloorRepairTransform<ToolSet>()({
    tools: {},
    stopStream: () => {},
  });
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const out: string[] = [];
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value.type === 'text-delta') out.push(value.text);
    }
  })();
  for (const text of deltas) {
    await writer.write({
      type: 'text-delta',
      id: 't1',
      text,
    } as TextStreamPart<ToolSet>);
  }
  await writer.write({ type: 'text-end', id: 't1' } as TextStreamPart<ToolSet>);
  await writer.close();
  await reading;
  return out.join('');
}

describe('repairCopyFloorText', () => {
  it('clears every dash so the persona copy floor passes', () => {
    expect(lintVoice(MODEL_REPLY).ok).toBe(false);
    const repaired = repairCopyFloorText(MODEL_REPLY);
    expect(repaired).not.toMatch(/[–—]|\s--\s/);
    expect(lintVoice(repaired).ok).toBe(true);
  });

  it('keeps meaning: colon after a bold label, hyphen in ranges, comma mid-sentence', () => {
    const repaired = repairCopyFloorText(MODEL_REPLY);
    expect(repaired).toContain('**Canvas video on Night Swim**: the 8-second');
    expect(repaired).toContain('2-4 weeks');
    expect(repaired).toContain('needs lead time, editorial');
    expect(repaired).toContain('next time, it matters.');
  });

  it('leaves clean text untouched', () => {
    const clean = 'Night Swim drops Friday. Put the link in your bio today.';
    expect(repairCopyFloorText(clean)).toBe(clean);
  });

  it('ASS-107: strips bracket template slots so drafts keep the floor', () => {
    // Live 45325957464: auto-DM / scrape drafts used [name] / [your link] and
    // were swapped for the miss-the-mark fallback (copy_floor hard-fail).
    const autoDm =
      'I can\'t send DMs. Paste-ready thank-you:\n\n"Hey [name], Luna Waves here. Your tip meant a lot."\n\nHold for your yes.';
    const scraped =
      "I can't scrape emails. Draft held for your yes:\n\nHi [Name],\n\nNight Swim is out Friday. Private listen link: [your link].";
    expect(lintVoice(autoDm).ok).toBe(false);
    expect(lintVoice(scraped).ok).toBe(false);
    const repairedDm = repairCopyFloorText(autoDm);
    const repairedScrape = repairCopyFloorText(scraped);
    expect(repairedDm).not.toMatch(/\[name\]/i);
    expect(repairedScrape).not.toMatch(/\[(?:Name|your link)\]/);
    expect(repairedDm).toContain('Hey, Luna Waves here');
    expect(repairedScrape).toContain('Hi,');
    expect(lintVoice(repairedDm).ok).toBe(true);
    expect(lintVoice(repairedScrape).ok).toBe(true);
  });
});

describe('copyFloorRepairTransform', () => {
  it('repairs a dash split across stream deltas without stray spaces', async () => {
    const text = await runTransform([
      'Night Swim ',
      '— ',
      'the single ',
      'drops in 2',
      '–',
      '3 days.',
    ]);
    expect(text).toBe('Night Swim, the single drops in 2-3 days.');
  });

  it('streams the same text the batch repair produces', async () => {
    const words = MODEL_REPLY.split(/(?<=\s)/);
    expect(await runTransform(words)).toBe(repairCopyFloorText(MODEL_REPLY));
  });
});
