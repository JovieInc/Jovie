import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDefectPrompt,
  DEFECT_CATEGORIES,
  DEFECT_CHECKLIST,
  isBlockingFinding,
  parseDefectFindings,
} from '@/lib/agent-os/visual-defects/checklist';
import {
  type DefectVisionTransport,
  ReviewUnavailableError,
  reviewImage as reviewShot,
} from '@/lib/agent-os/visual-defects/review-image';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function withShot<T>(run: (path: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'defects-'));
  const path = join(dir, 'customers-375.png');
  writeFileSync(path, PNG);
  return run(path).finally(() => rmSync(dir, { recursive: true, force: true }));
}

const CHEVRON_REPLY = JSON.stringify({
  findings: [
    {
      category: 'affordance-no-behavior',
      finding: 'Customers header shows a down chevron with no items under it',
      severity: 'high',
      confidence: 0.93,
      bbox: [12, 80, 140, 32],
    },
    { category: 'bogus', finding: 'x', severity: 'nope', confidence: 9 },
  ],
});

describe('defect checklist', () => {
  it('names every checklist rule in the prompt', () => {
    const prompt = buildDefectPrompt('Customers page, 375px');
    for (const rule of DEFECT_CHECKLIST)
      expect(prompt).toContain(rule.category);
    expect(prompt).toContain('Customers page, 375px');
    expect(DEFECT_CATEGORIES).toContain('other');
  });

  it('parses and clamps findings, and rejects non-JSON', () => {
    const findings = parseDefectFindings(`ok ${CHEVRON_REPLY}`);
    expect(findings).toHaveLength(2);
    expect(findings?.[0]).toMatchObject({
      severity: 'high',
      bbox: [12, 80, 140, 32],
    });
    expect(findings?.[1]).toMatchObject({
      category: 'other',
      severity: 'low',
      confidence: 1,
    });
    expect(parseDefectFindings('{"findings":[]}')).toEqual([]);
    expect(parseDefectFindings('nothing here')).toBeNull();
  });

  it('blocks only on high severity at high confidence', () => {
    expect(isBlockingFinding({ severity: 'high', confidence: 0.9 })).toBe(true);
    expect(isBlockingFinding({ severity: 'high', confidence: 0.5 })).toBe(
      false
    );
    expect(isBlockingFinding({ severity: 'medium', confidence: 1 })).toBe(
      false
    );
  });
});

describe('single-image review', () => {
  it('flags the chevron-with-no-items shot through an injected transport', async () => {
    const seen: string[] = [];
    const transport: DefectVisionTransport = async request => {
      seen.push(request.model, request.images[0]);
      return CHEVRON_REPLY;
    };
    await withShot(async path => {
      const findings = await reviewShot(path, {
        model: 'claude-haiku-4-5',
        transport,
      });
      expect(findings.some(isBlockingFinding)).toBe(true);
      expect(seen).toEqual(['claude-haiku-4-5', path]);
    });
  });

  it('fails loudly on an unreadable reply or a missing file', async () => {
    await withShot(async path => {
      await expect(
        reviewShot(path, { transport: async () => 'sorry' })
      ).rejects.toBeInstanceOf(ReviewUnavailableError);
    });
  });
});
