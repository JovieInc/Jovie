/** Scan PR metadata and commit messages independently so fences cannot leak. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText, stripCommitScopes } from './brand-name.mjs';

export function scanPullRequestText({
  title = '',
  body = '',
  base,
  head,
  root = process.cwd(),
}) {
  const commits = execFileSync(
    'git',
    ['log', '--format=%H%x00%B%x00', `${base}..${head}`],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }
  ).split('\0');
  const sections = [
    ['PR title', title],
    ['PR body', body],
  ];
  for (let i = 0; i + 1 < commits.length; i += 2)
    sections.push([`commit ${commits[i].trim()}`, commits[i + 1]]);
  return sections.flatMap(([file, text]) =>
    scanText(stripCommitScopes(text), { file, prose: true, exceptions: [] })
  );
}

export function main(argv, options = {}) {
  const [base, head] = argv;
  if (!base || !/^[0-9a-f]{40}$/u.test(head ?? ''))
    throw new Error('Expected trusted base and full head SHA');
  const hits = scanPullRequestText({
    title: process.env.PR_TITLE,
    body: process.env.PR_BODY,
    ...options,
    base,
    head,
  });
  for (const hit of hits)
    process.stderr.write(
      `ASR-036 ${hit.file}:${hit.line} ${hit.kind} "${hit.text}": ${hit.context}\n`
    );
  return hits.length ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = main(process.argv.slice(2));
