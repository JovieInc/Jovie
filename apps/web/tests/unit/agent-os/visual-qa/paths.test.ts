import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getVisualQaRootDirectory,
  resolveVisualQaDiffOverlayPath,
  resolveVisualQaDiffSummaryPath,
  resolveVisualQaRunDirectory,
} from '@/lib/agent-os/visual-qa/paths';

describe('visual-qa diff paths', () => {
  it('resolves diff artifact paths under agentos/runs/visual-qa', () => {
    const runDirectory = resolveVisualQaRunDirectory('demo-run');
    const overlayPath = resolveVisualQaDiffOverlayPath(
      'demo-run',
      'shell-desktop-idle'
    );
    const summaryPath = resolveVisualQaDiffSummaryPath('demo-run');

    expect(runDirectory).toContain(
      path.join('agentos', 'runs', 'visual-qa', 'demo-run')
    );
    expect(overlayPath).toBe(
      path.join(runDirectory, 'shell-desktop-idle', 'diff-overlay.png')
    );
    expect(summaryPath).toBe(path.join(runDirectory, 'diff-summary.json'));
    expect(getVisualQaRootDirectory()).toContain(
      path.join('agentos', 'runs', 'visual-qa')
    );
  });
});
