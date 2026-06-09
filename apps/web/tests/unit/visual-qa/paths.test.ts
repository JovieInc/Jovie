import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getVisualQaRootDirectory,
  resolveVisualQaManifestPath,
  resolveVisualQaPhaseScreenshotPath,
  resolveVisualQaRunDirectory,
  toVisualQaRelativePath,
} from '@/lib/agent-os/visual-qa/paths';

describe('visual-qa paths', () => {
  it('resolves run and theme-aware phase screenshot paths under agentos/runs/visual-qa', () => {
    const runDirectory = resolveVisualQaRunDirectory('demo-run');
    const screenshotPath = resolveVisualQaPhaseScreenshotPath(
      'demo-run',
      'shell-desktop-idle',
      'baseline',
      'dark'
    );
    const manifestPath = resolveVisualQaManifestPath('demo-run');

    expect(runDirectory).toContain(
      path.join('agentos', 'runs', 'visual-qa', 'demo-run')
    );
    expect(screenshotPath).toBe(
      path.join(runDirectory, 'shell-desktop-idle', 'baseline-dark.png')
    );
    expect(manifestPath).toBe(path.join(runDirectory, 'manifest.json'));
  });

  it('rejects traversal attempts in run ids', () => {
    expect(() => resolveVisualQaRunDirectory('../escape')).toThrow(
      /Invalid Visual QA run id/
    );
  });

  it('converts absolute artifact paths to run-relative paths', () => {
    const absolutePath = resolveVisualQaPhaseScreenshotPath(
      'demo-run',
      'list-releases-default',
      'after',
      'light'
    );

    expect(toVisualQaRelativePath(absolutePath)).toBe(
      'demo-run/list-releases-default/after-light.png'
    );
    expect(getVisualQaRootDirectory()).toContain(
      path.join('agentos', 'runs', 'visual-qa')
    );
  });
});
