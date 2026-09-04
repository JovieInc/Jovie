import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(
  path.join(
    process.cwd(),
    'components/features/admin/hud/VisualQaReviewPanel.tsx'
  ),
  'utf8'
);

describe('VisualQaReviewPanel typography contract', () => {
  it('uses the semantic heading weight instead of a raw font value', () => {
    expect(panelSource).not.toContain('font-[560]');
    expect(panelSource.match(/font-semibold/g)).toHaveLength(3);
  });

  it('routes transient feedback through the canonical feedback API', () => {
    expect(panelSource).not.toContain("from 'sonner'");
    expect(panelSource).toContain("from '@/components/feedback'");
  });
});

describe('VisualQaReviewPanel reference id contract', () => {
  it('precomputes sequential HUD-VQA ids without mutating render-scope state', () => {
    expect(panelSource).toContain('surfaceReferenceIds');
    expect(panelSource).not.toContain('surfaceIndex');
    expect(panelSource).toContain("padStart(3, '0')");
  });
});
