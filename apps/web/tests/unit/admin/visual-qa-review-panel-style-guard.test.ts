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
});
