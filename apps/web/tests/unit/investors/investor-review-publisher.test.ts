import { describe, expect, it } from 'vitest';
import {
  type PublisherCommandResult,
  publishInvestorReviewDraft,
} from '@/lib/investors/investor-review-publisher';

type FailurePhase = 'commit' | 'push' | 'gh';
const LOCAL_SHA = '1'.repeat(40);
const OTHER_SHA = '2'.repeat(40);

function options() {
  return {
    repoRoot: '/repo',
    branch: 'codex/investor-review-test',
    base: 'codex/original',
    title: 'Test proposal',
    repository: 'JovieInc/Jovie',
    relativeOutput: 'docs/fundraising/reviews/proposals/test.md',
    markdown: '# Test',
  };
}

function harness(failurePhase: FailurePhase) {
  const state = {
    callerBranch: 'codex/original',
    localBranch: false,
    remoteSha: null as string | null,
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
          if (args[1] === 'list') return result(0, '[]');
          return failurePhase === 'gh'
            ? result(1, '', 'injected gh failure')
            : result(0, 'https://example.test/pr/1');
        }
        if (args[0] === 'status') return result();
        if (args[0] === 'show-ref') return result(state.localBranch ? 0 : 1);
        if (args[0] === 'ls-remote')
          return state.remoteSha
            ? result(
                0,
                `${state.remoteSha}\trefs/heads/codex/investor-review-test\n`
              )
            : result(2);
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
        if (args[0] === 'rev-parse') return result(0, `${LOCAL_SHA}\n`);
        if (
          args[0] === 'push' &&
          args.some(arg => arg.startsWith('--force-with-lease='))
        ) {
          const expected = args
            .find(arg => arg.startsWith('--force-with-lease='))
            ?.split(':')
            .at(-1);
          if (state.remoteSha !== expected)
            return result(1, '', 'lease rejected');
          state.remoteSha = null;
          return result();
        }
        if (args[0] === 'push') {
          state.remoteSha = LOCAL_SHA;
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
          repository: 'JovieInc/Jovie',
          relativeOutput: 'docs/fundraising/reviews/proposals/test.md',
          markdown: '# Test',
        },
        dependencies
      )
    ).rejects.toThrow(`injected ${failurePhase} failure`);
    expect(state).toMatchObject({
      callerBranch: 'codex/original',
      localBranch: false,
      remoteSha: null,
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
          repository: 'JovieInc/Jovie',
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
        args.some(arg => arg.startsWith('--force-with-lease='))
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
          repository: 'JovieInc/Jovie',
          relativeOutput: 'docs/fundraising/reviews/proposals/test.md',
          markdown: '# Test',
        },
        dependencies
      )
    ).rejects.toThrow(
      'leased deletion of remote branch codex/investor-review-test'
    );
    expect(state.remoteSha).toBe(LOCAL_SHA);
    expect(state.localBranch).toBe(false);
    expect(state.temporaryWorktree).toBe(false);
  });

  it('retains a different remote SHA observed after a racing push', async () => {
    const { state, dependencies } = harness('push');
    const originalRun = dependencies.run;
    dependencies.run = (command, args) => {
      if (
        command === 'git' &&
        args[0] === 'push' &&
        !args.some(arg => arg.startsWith('--force-with-lease='))
      ) {
        state.remoteSha = OTHER_SHA;
        return { status: 1, stdout: '', stderr: 'racing push failure' };
      }
      return originalRun(command, args);
    };
    await expect(
      publishInvestorReviewDraft(options(), dependencies)
    ).rejects.toThrow(`points to different SHA ${OTHER_SHA}`);
    expect(state.remoteSha).toBe(OTHER_SHA);
  });

  it('never deletes a remote ref changed after ownership was established', async () => {
    const { state, dependencies } = harness('gh');
    const originalRun = dependencies.run;
    dependencies.run = (command, args) => {
      if (command === 'gh' && args[1] === 'list') {
        state.remoteSha = OTHER_SHA;
        return { status: 0, stdout: '[]', stderr: '' };
      }
      return originalRun(command, args);
    };
    await expect(
      publishInvestorReviewDraft(options(), dependencies)
    ).rejects.toThrow('leased deletion');
    expect(state.remoteSha).toBe(OTHER_SHA);
  });

  it('retains the owned branch when failed creation has an observable PR', async () => {
    const { state, dependencies } = harness('gh');
    const originalRun = dependencies.run;
    dependencies.run = (command, args) =>
      command === 'gh' && args[1] === 'list'
        ? {
            status: 0,
            stdout: '[{"url":"https://example.test/pr/7","state":"OPEN"}]',
            stderr: '',
          }
        : originalRun(command, args);
    await expect(
      publishInvestorReviewDraft(options(), dependencies)
    ).rejects.toThrow('https://example.test/pr/7 (OPEN)');
    expect(state.remoteSha).toBe(LOCAL_SHA);
  });

  it('retains the owned branch when exact PR existence is indeterminate', async () => {
    const { state, dependencies } = harness('gh');
    const originalRun = dependencies.run;
    dependencies.run = (command, args) =>
      command === 'gh' && args[1] === 'list'
        ? { status: 1, stdout: '', stderr: 'query unavailable' }
        : originalRun(command, args);
    await expect(
      publishInvestorReviewDraft(options(), dependencies)
    ).rejects.toThrow('PR existence for JovieInc/Jovie');
    expect(state.remoteSha).toBe(LOCAL_SHA);
  });
});
