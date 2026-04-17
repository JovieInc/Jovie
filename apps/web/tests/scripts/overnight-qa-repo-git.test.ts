import { describe, expect, it, vi } from 'vitest';
import { prepareBaseBranch } from '../../scripts/overnight-qa/repo-git';
import type { CommandExecutionResult } from '../../scripts/overnight-qa/types';

function createCommandResult(
  status: number,
  stdout = '',
  stderr = ''
): CommandExecutionResult {
  return {
    code: status,
    stdout,
    stderr,
  };
}

describe('overnight-qa repo git helpers', () => {
  it('throws immediately when fetching main fails', () => {
    const runCommand = vi
      .fn<
        (
          command: readonly string[],
          options?: {
            readonly cwd?: string;
            readonly env?: Readonly<Record<string, string>>;
          }
        ) => CommandExecutionResult
      >()
      .mockReturnValueOnce(
        createCommandResult(1, '', 'fatal: unable to fetch origin/main')
      );

    expect(() => prepareBaseBranch(runCommand)).toThrow(
      'Failed to fetch the base branch.'
    );
    expect(runCommand.mock.calls).toEqual([
      [['git', 'fetch', 'origin', 'main']],
    ]);
  });

  it('detaches onto origin/main when main is claimed by another worktree', () => {
    const runCommand = vi
      .fn<
        (
          command: readonly string[],
          options?: {
            readonly cwd?: string;
            readonly env?: Readonly<Record<string, string>>;
          }
        ) => CommandExecutionResult
      >()
      .mockReturnValueOnce(createCommandResult(0))
      .mockReturnValueOnce(
        createCommandResult(
          128,
          '',
          "fatal: 'main' is already used by worktree at '/tmp/jovie-main'"
        )
      )
      .mockReturnValueOnce(createCommandResult(0));

    expect(() => prepareBaseBranch(runCommand)).not.toThrow();
    expect(runCommand.mock.calls).toEqual([
      [['git', 'fetch', 'origin', 'main']],
      [['git', 'checkout', 'main']],
      [['git', 'checkout', '--detach', 'origin/main']],
    ]);
  });

  it('throws when checkout fails for a non-worktree reason', () => {
    const runCommand = vi
      .fn<
        (
          command: readonly string[],
          options?: {
            readonly cwd?: string;
            readonly env?: Readonly<Record<string, string>>;
          }
        ) => CommandExecutionResult
      >()
      .mockReturnValueOnce(createCommandResult(0))
      .mockReturnValueOnce(
        createCommandResult(128, '', "fatal: pathspec 'main' did not match")
      );

    expect(() => prepareBaseBranch(runCommand)).toThrow(
      'Failed to checkout main.'
    );
    expect(runCommand.mock.calls).toEqual([
      [['git', 'fetch', 'origin', 'main']],
      [['git', 'checkout', 'main']],
    ]);
  });

  it('throws when detaching onto origin/main fails after a worktree conflict', () => {
    const runCommand = vi
      .fn<
        (
          command: readonly string[],
          options?: {
            readonly cwd?: string;
            readonly env?: Readonly<Record<string, string>>;
          }
        ) => CommandExecutionResult
      >()
      .mockReturnValueOnce(createCommandResult(0))
      .mockReturnValueOnce(
        createCommandResult(
          128,
          '',
          "fatal: 'main' is already used by worktree at '/tmp/jovie-main'"
        )
      )
      .mockReturnValueOnce(
        createCommandResult(128, '', 'fatal: invalid reference: origin/main')
      );

    expect(() => prepareBaseBranch(runCommand)).toThrow(
      'Failed to detach onto origin/main.'
    );
    expect(runCommand.mock.calls).toEqual([
      [['git', 'fetch', 'origin', 'main']],
      [['git', 'checkout', 'main']],
      [['git', 'checkout', '--detach', 'origin/main']],
    ]);
  });

  it('fast-forwards main when the local branch can be checked out normally', () => {
    const runCommand = vi
      .fn<
        (
          command: readonly string[],
          options?: {
            readonly cwd?: string;
            readonly env?: Readonly<Record<string, string>>;
          }
        ) => CommandExecutionResult
      >()
      .mockReturnValueOnce(createCommandResult(0))
      .mockReturnValueOnce(createCommandResult(0))
      .mockReturnValueOnce(createCommandResult(0));

    expect(() => prepareBaseBranch(runCommand)).not.toThrow();
    expect(runCommand.mock.calls).toEqual([
      [['git', 'fetch', 'origin', 'main']],
      [['git', 'checkout', 'main']],
      [['git', 'pull', '--ff-only', 'origin', 'main']],
    ]);
  });
});
