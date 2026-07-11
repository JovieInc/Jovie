import path from 'node:path';

export interface PublisherCommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface InvestorReviewPublisherDependencies {
  readonly run: (
    command: 'git' | 'gh',
    args: readonly string[],
    cwd: string
  ) => PublisherCommandResult;
  readonly createTempDirectory: () => Promise<string>;
  readonly removeTempDirectory: (directory: string) => Promise<void>;
  readonly writeArtifact: (filePath: string, content: string) => Promise<void>;
}

interface PublishOptions {
  readonly repoRoot: string;
  readonly branch: string;
  readonly base: string;
  readonly title: string;
  readonly relativeOutput: string;
  readonly markdown: string;
}

function failure(result: PublisherCommandResult, fallback: string): Error {
  return new Error(result.stderr.trim() || fallback);
}

export async function publishInvestorReviewDraft(
  options: PublishOptions,
  dependencies: InvestorReviewPublisherDependencies
): Promise<string> {
  const { repoRoot, branch, base, title, relativeOutput, markdown } = options;
  const run = (
    command: 'git' | 'gh',
    args: readonly string[],
    cwd = repoRoot
  ) => dependencies.run(command, args, cwd);
  const status = run('git', ['status', '--porcelain']);
  if (status.status !== 0) {
    throw failure(status, 'Could not verify worktree cleanliness.');
  }
  if (status.stdout.trim()) {
    throw new Error('Refusing a dirty worktree.');
  }
  const initialLocal = run('git', [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ]);
  if (initialLocal.status === 0) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (initialLocal.status !== 1) {
    throw failure(initialLocal, 'Could not verify local branch availability.');
  }
  const initialRemote = run('git', [
    'ls-remote',
    '--exit-code',
    '--heads',
    'origin',
    branch,
  ]);
  if (initialRemote.status === 0) {
    throw new Error(`Remote branch already exists: ${branch}`);
  }
  if (initialRemote.status !== 2) {
    throw failure(
      initialRemote,
      'Could not verify remote branch availability.'
    );
  }

  const temporaryWorktree = await dependencies.createTempDirectory();
  let remoteCreated = false;
  let primaryError: Error | null = null;
  try {
    const add = run('git', [
      'worktree',
      'add',
      '-b',
      branch,
      temporaryWorktree,
      base,
    ]);
    if (add.status !== 0)
      throw failure(add, 'Temporary worktree creation failed.');
    const output = path.join(temporaryWorktree, relativeOutput);
    await dependencies.writeArtifact(output, markdown);
    for (const args of [
      ['add', '--', relativeOutput],
      [
        'commit',
        '-m',
        `docs(investors): add ${path.basename(relativeOutput, '.md')} review proposal`,
      ],
    ] as const) {
      const result = run('git', args, temporaryWorktree);
      if (result.status !== 0) throw failure(result, `git ${args[0]} failed.`);
    }
    const push = run(
      'git',
      ['push', '-u', 'origin', `${branch}:${branch}`],
      temporaryWorktree
    );
    if (push.status !== 0) {
      remoteCreated =
        run('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch])
          .status === 0;
      throw failure(push, 'Draft branch push failed.');
    }
    remoteCreated = true;
    const pr = run(
      'gh',
      [
        'pr',
        'create',
        '--draft',
        '--base',
        base,
        '--head',
        branch,
        '--title',
        title,
        '--body',
        'Manual investor-note review proposal only. No investor-facing content is changed.',
      ],
      temporaryWorktree
    );
    if (pr.status !== 0) throw failure(pr, 'Draft PR creation failed.');
    return pr.stdout.trim();
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
    if (remoteCreated) {
      const rollback = run('git', ['push', 'origin', '--delete', branch]);
      if (rollback.status !== 0) {
        primaryError = new Error(
          `${primaryError.message} Recoverable state: remote branch ${branch} exists; delete it manually before retrying. ${rollback.stderr.trim()}`
        );
      }
    }
    throw primaryError;
  } finally {
    const cleanupErrors: string[] = [];
    const remove = run('git', [
      'worktree',
      'remove',
      '--force',
      temporaryWorktree,
    ]);
    if (remove.status !== 0) cleanupErrors.push(remove.stderr.trim());
    try {
      await dependencies.removeTempDirectory(temporaryWorktree);
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error ? error.message : String(error)
      );
    }
    const local = run('git', [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`,
    ]);
    if (local.status === 0) {
      const deleteBranch = run('git', ['branch', '-D', branch]);
      if (deleteBranch.status !== 0)
        cleanupErrors.push(deleteBranch.stderr.trim());
    }
    if (cleanupErrors.length > 0) {
      const prefix = primaryError
        ? `${primaryError.message} Recoverable state: local cleanup failed:`
        : 'Draft created but local cleanup failed:';
      throw new Error(`${prefix} ${cleanupErrors.join(' ')}`);
    }
  }
}
