import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { renderInvestorReviewProposal } from '@/lib/investors/investor-review-proposal';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const repoRoot = path.resolve(webRoot, '../..');
const reviewRoot = path.join(repoRoot, 'docs/fundraising/reviews');

function argument(name: string): string {
  const value = process.argv
    .slice(2)
    .find(item => item.startsWith(`--${name}=`));
  if (!value) throw new Error(`--${name} is required.`);
  return value.slice(name.length + 3);
}

function git(args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}

async function regularRealPath(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const stats = await lstat(resolved);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Input must be a regular non-symlink file: ${filePath}`);
  }
  return realpath(resolved);
}

async function main() {
  const proposalPath = await regularRealPath(argument('proposal'));
  const artifactPath = await regularRealPath(argument('artifact'));
  const publish = process.argv.includes('--publish-draft');
  const rendered = renderInvestorReviewProposal(
    JSON.parse(await readFile(proposalPath, 'utf8')),
    JSON.parse(await readFile(artifactPath, 'utf8'))
  );
  const output = path.join(reviewRoot, 'proposals', `${rendered.slug}.md`);
  const branch = `codex/investor-review-${rendered.slug}`;
  const base = git(['branch', '--show-current']);
  const plan = {
    mode: publish ? 'publish-draft' : 'dry-run',
    branch,
    base,
    output,
  };
  if (!publish) {
    process.stdout.write(
      `${JSON.stringify({ ...plan, markdown: rendered.markdown })}\n`
    );
    return;
  }
  if (git(['status', '--porcelain']))
    throw new Error('Refusing a dirty worktree.');
  const localBranch = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    { cwd: repoRoot }
  );
  if (localBranch.status === 0) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  const remote = spawnSync(
    'git',
    ['ls-remote', '--exit-code', '--heads', 'origin', branch],
    { cwd: repoRoot }
  );
  if (remote.status === 0)
    throw new Error(`Remote branch already exists: ${branch}`);
  if (remote.status !== 2) {
    throw new Error(
      remote.stderr?.toString().trim() ||
        'Could not verify remote branch availability.'
    );
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, rendered.markdown, { encoding: 'utf8', flag: 'wx' });
  git(['switch', '-c', branch]);
  git(['add', '--', path.relative(repoRoot, output)]);
  git([
    'commit',
    '-m',
    `docs(investors): add ${rendered.slug} review proposal`,
  ]);
  git(['push', '-u', 'origin', branch]);
  const pr = spawnSync(
    'gh',
    [
      'pr',
      'create',
      '--draft',
      '--base',
      base,
      '--title',
      rendered.title,
      '--body',
      'Manual investor-note review proposal only. No investor-facing content is changed.',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (pr.status !== 0)
    throw new Error(pr.stderr.trim() || 'Draft PR creation failed.');
  process.stdout.write(
    `${JSON.stringify({ ...plan, draftPr: pr.stdout.trim() })}\n`
  );
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`
  );
  process.exitCode = 1;
});
