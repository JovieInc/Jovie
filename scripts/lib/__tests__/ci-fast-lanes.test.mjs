import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANE_COMMANDS, runDesignConformance } from '../../ci-fast-lanes.mjs';

describe('runDesignConformance', () => {
  const originalEventName = process.env.GITHUB_EVENT_NAME;

  afterEach(() => {
    process.env.GITHUB_EVENT_NAME = originalEventName;
    vi.clearAllMocks();
  });

  it('skips on eve-pilot-only changed files', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFiles: ['apps/eve-pilot/some-ui-changes.swift'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.output).toContain('No design-domain files changed');
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs for iOS design-domain files (for example AppShellTabBar.swift)', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFiles: ['apps/ios/Scenes/AppShell/AppShellTabBar.swift'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      LANE_COMMANDS['design-conformance']
    );
    expect(result.skipped).toBeUndefined();
  });

  it('fails closed when changed files are unavailable', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFiles: null,
      execute,
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('failed: changed files unavailable');
    expect(execute).not.toHaveBeenCalled();
  });
});
