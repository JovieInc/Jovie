import { describe, expect, it } from 'vitest';
import {
  type PublisherCommandResult,
  publishInvestorReviewDraft,
} from '@/lib/investors/investor-review-publisher';

type FailurePhase = 'commit' | 'push' | 'gh';

function harness(failurePhase: FailurePhase) {
  const state = {
    callerBranch: 'codex/original',
    localBranch: false,
    remoteBranch: false,
    temporaryWorktree: false,
    artifactWritten: false,
  };
  const result = (
    status = 0,
    stdout = '',
    stderr = ''
  ): PublisherCommandResult => ({ status, stdout, stderr });
  return {
    state,
    dependencies: {
      createTempDirectory: async () => '/tmp/injected-review-worktree',
      removeTempDirectory: async () => {
        state.temporaryWorktree = false;
      },
      writeArtifact: async () => {
        state.artifactWritten = true;
      },
      run: (command: 'git' | 'gh', args: readonly string[]) => {
        if (command === 'gh') {
          return failurePhase === 'gh'
            ? result(1, '', 'injected gh failure')
            : result(0, 'https://example.test/pr/1');
        }
        if (args[0] === 'status') return result();
        if (args[0] === 'show-ref') return result(state.localBranch ? 0 : 1);
        if (args[0] === 'ls-remote') return result(state.remoteBranch ? 0 : 2);
        if (args[0] === 'worktree' && args[1] === 'add') {
          state.localBranch = true;
          state.temporaryWorktree = true;
          return result();
        }
        if (args[0] === 'worktree' && args[1] === 'remove') {
          state.temporaryWorktree = false;
          return result();
        }
        if (args[0] === 'branch' && args[1] === '-D') {
          state.localBranch = false;
          return result();
        }
        if (args[0] === 'commit' && failurePhase === 'commit')
          return result(1, '', 'injected commit failure');
        if (args[0] === 'push' && args.includes('--delete')) {
          state.remoteBranch = false;
          return result();
        }
        if (args[0] === 'push') {
          state.remoteBranch = true;
          return failurePhase === 'push'
            ? result(1, '', 'injected push failure')
            : result();
        }
        return result();
      },
    },
  };
}

describe('investor review publisher', () => {
  it.each([
    'commit',
    'push',
    'gh',
  ] as const)('restores caller state after an injected %s failure', async failurePhase => {
    const { state, dependencies } = harness(failurePhase);
    await expect(
      publishInvestorReviewDraft(
        {
          repoRoot: '/repo',
          branch: 'codex/investor-review-test',
          base: state.callerBranch,
          title: 'Test proposal',
          relativeOutput: 'docs/fundraising/reviews/proposals/test.md',
          markdown: '# Test',
        },
        dependencies
      )
    ).rejects.toThrow(`injected ${failurePhase} failure`);
    expect(state).toMatchObject({
      callerBranch: 'codex/original',
      localBranch: false,
      remoteBranch: false,
      temporaryWorktree: false,
      artifactWritten: true,
    });
  });

  it('never deletes a preexisting branch rejected during preflight', async () => {
    const { state, dependencies } = harness('commit');
    state.localBranch = true;
    await expect(
      publishInvestorReviewDraft(
        {
          repoRoot: '/repo',
          branch: 'codex/investor-review-test',
          base: state.callerBranch,
          title: 'Test proposal',
          relativeOutput: 'docs/fundraising/reviews/proposals/test.md',
          markdown: '# Test',
        },
        dependencies
      )
    ).rejects.toThrow('Branch already exists');
    expect(state.localBranch).toBe(true);
    expect(state.temporaryWorktree).toBe(false);
  });

  it('reports recoverable remote state when rollback deletion fails', async () => {
    const { state, dependencies } = harness('gh');
    const originalRun = dependencies.run;
    dependencies.run = (command, args) => {
      if (
        command === 'git' &&
        args[0] === 'push' &&
        args.includes('--delete')
      ) {
        return { status: 1, stdout: '', stderr: 'injected delete failure' };
      }
      return originalRun(command, args);
    };
    await expect(
      publishInvestorReviewDraft(
        {
          repoRoot: '/repo',
          branch: 'codex/investor-review-test',
          base: state.callerBranch,
          title: 'Test proposal',
          relativeOutput: 'docs/fundraising/reviews/proposals/test.md',
          markdown: '# Test',
        },
        dependencies
      )
    ).rejects.toThrow(
      'Recoverable state: remote branch codex/investor-review-test exists'
    );
    expect(state.remoteBranch).toBe(true);
    expect(state.localBranch).toBe(false);
    expect(state.temporaryWorktree).toBe(false);
  });
});
