import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { renderInvestorReviewProposal } from '@/lib/investors/investor-review-proposal';
import { publishInvestorReviewDraft } from '@/lib/investors/investor-review-publisher';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const repoRoot = path.resolve(webRoot, '../..');
const relativeReviewRoot = 'docs/fundraising/reviews/proposals';

function argument(name: string): string {
  const value = process.argv
    .slice(2)
    .find(item => item.startsWith(`--${name}=`));
  if (!value) throw new Error(`--${name} is required.`);
  return value.slice(name.length + 3);
}

function run(command: 'git' | 'gh', args: readonly string[], cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
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
  const relativeOutput = path.join(relativeReviewRoot, `${rendered.slug}.md`);
  const output = path.join(repoRoot, relativeOutput);
  const branch = `codex/investor-review-${rendered.slug}`;
  const currentBranch = run('git', ['branch', '--show-current']);
  if (currentBranch.status !== 0 || !currentBranch.stdout.trim()) {
    throw new Error(
      currentBranch.stderr.trim() || 'Current branch is required.'
    );
  }
  const base = currentBranch.stdout.trim();
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
  const repositoryResult = run('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]);
  if (repositoryResult.status !== 0 || !repositoryResult.stdout.trim()) {
    throw new Error(
      repositoryResult.stderr.trim() || 'GitHub repository is required.'
    );
  }
  const repository = repositoryResult.stdout.trim();
  const draftPr = await publishInvestorReviewDraft(
    {
      repoRoot,
      branch,
      base,
      title: rendered.title,
      repository,
      relativeOutput,
      markdown: rendered.markdown,
    },
    {
      run,
      createTempDirectory: () =>
        mkdtemp(path.join(tmpdir(), 'jovie-investor-review-')),
      removeTempDirectory: directory =>
        rm(directory, { recursive: true, force: true }),
      writeArtifact: async (filePath, content) => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
      },
    }
  );
  process.stdout.write(`${JSON.stringify({ ...plan, draftPr })}\n`);
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`
  );
  process.exitCode = 1;
});
