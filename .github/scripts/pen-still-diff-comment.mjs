/** Upsert the advisory Pen-still comment and attach the triptych. Failures exit 0. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runGh } from '../../packages/api-client/gh.ts';

export const COMMENT_MARKER = '<!-- pen-still-diff -->';

/**
 * @param {{pr: string, repo: string, bodyFile: string, image?: string, exec?: typeof runGh}} input
 */
export async function upsertTriptychComment({
  pr,
  repo,
  bodyFile,
  image,
  exec = runGh,
}) {
  const body = readFileSync(bodyFile, 'utf8');
  if (!body.includes(COMMENT_MARKER)) {
    throw new Error('comment body is missing the pen-still marker');
  }
  const call = async args => {
    // Allow GitHub's shared write spacing while still shedding low-budget reports.
    const result = await exec(args, { priority: 'report', maxWaitMs: 5_000 });
    if (result.code !== 0) {
      throw new Error(result.stderr || `gh exited with code ${result.code}`);
    }
    return result.stdout;
  };
  const comments = JSON.parse(
    (await call([
      'api',
      '--paginate',
      `repos/${repo}/issues/${pr}/comments`,
    ])) || '[]'
  );
  const previous = comments.filter(
    comment =>
      typeof comment.body === 'string' && comment.body.includes(COMMENT_MARKER)
  );
  const args = [
    'pr',
    'comment',
    String(pr),
    '--repo',
    repo,
    '--body-file',
    bodyFile,
  ];
  if (image && existsSync(image)) {
    args.push('--attach', `${image}#Pen, render, and diff`);
  }
  await call(args);
  for (const comment of previous) {
    await call([
      'api',
      '-X',
      'DELETE',
      `repos/${repo}/issues/comments/${comment.id}`,
    ]);
  }
  return { posted: true, removed: previous.length };
}

async function main() {
  const pr = process.env.PR_NUMBER;
  const repo = process.env.GITHUB_REPOSITORY;
  const outDir = resolve(process.env.PEN_STILL_OUT ?? 'pen-still-out');
  if (!pr || !repo) {
    process.stderr.write(
      'PR_NUMBER or GITHUB_REPOSITORY missing; skip comment\n'
    );
    return;
  }
  const bodyFile = resolve(outDir, 'comment.md');
  if (!existsSync(bodyFile)) {
    process.stderr.write('comment.md missing; skip comment\n');
    return;
  }
  try {
    const result = await upsertTriptychComment({
      pr,
      repo,
      bodyFile,
      image: resolve(outDir, 'triptych.png'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `triptych attach failed (${error.message}); posting text only\n`
    );
    try {
      await upsertTriptychComment({ pr, repo, bodyFile });
    } catch (textError) {
      process.stderr.write(`comment skipped: ${textError.message}\n`);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
