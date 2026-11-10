/** Upsert the advisory Pen-still comment. Failures remain advisory. */
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runGh } from '../../packages/api-client/gh.ts';

export const COMMENT_MARKER = '<!-- pen-still-diff -->';
const IMAGE_LINE =
  /^!\[[^\]\r\n]*\]\((triptych(?:-[a-f0-9]{64})?\.png|synthetic-triptych\.png)\)$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const OMITTED =
  'Image omitted from this comment; see the existing output artifact for available images.';
// gh pr comment supports at most 50 attachments. Keep excess images in the artifact.
const ATTACHMENT_LIMIT = 50;

/** Snapshot only generated PNG names from the artifact root, never symlinks or traversal. */
function prepareBody(body, root, staging) {
  const images = new Map();
  const text = body
    .split('\n')
    .map(line => {
      if (!/!\[|<img\b/i.test(line)) return line;
      const match = IMAGE_LINE.exec(line);
      if (!match) return OMITTED;
      const name = match[1];
      if (images.has(name)) return line;
      if (images.size >= ATTACHMENT_LIMIT) return OMITTED;
      let fd;
      try {
        fd = openSync(
          join(root, name),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
        );
        if (!fstatSync(fd).isFile()) return OMITTED;
        const bytes = readFileSync(fd);
        if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return OMITTED;
        const path = join(staging, name);
        writeFileSync(path, bytes);
        images.set(name, path);
        return line;
      } catch {
        return OMITTED;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    })
    .join('\n');
  return { text, images: [...images.values()] };
}

function textOnly(body) {
  return body
    .split('\n')
    .map(line => (IMAGE_LINE.test(line) ? OMITTED : line))
    .join('\n');
}

/**
 * @param {{pr: string, repo: string, bodyFile: string, image?: string, exec?: typeof runGh}} input
 * The legacy image argument is ignored: comment references define the attachments.
 */
export async function upsertTriptychComment({
  pr,
  repo,
  bodyFile,
  exec = runGh,
}) {
  const body = readFileSync(bodyFile, 'utf8');
  if (!body.includes(COMMENT_MARKER)) {
    throw new Error('comment body is missing the pen-still marker');
  }
  const call = async args => {
    const result = await exec(args, { priority: 'report', maxWaitMs: 5_000 });
    if (result.code !== 0) {
      throw new Error(result.stderr || `gh exited with code ${result.code}`);
    }
    return result.stdout;
  };
  // @json emits one compact page per line, even on gh versions without --slurp.
  // Body newlines stay escaped inside each page; flatten only the page level.
  const pages = await call([
    'api',
    '--paginate',
    '--jq',
    '@json',
    `repos/${repo}/issues/${pr}/comments`,
  ]);
  const comments = pages
    .split('\n')
    .filter(line => line.trim())
    .flatMap(line => JSON.parse(line));
  const previous = comments.filter(
    comment =>
      typeof comment.body === 'string' && comment.body.includes(COMMENT_MARKER)
  );
  const staging = mkdtempSync(join(tmpdir(), 'pen-still-publish-'));
  try {
    const prepared = prepareBody(body, dirname(resolve(bodyFile)), staging);
    let images = prepared.images;
    if (images.length) {
      // Probe the installed runner, not a guessed minimum gh version.
      const help = await call(['pr', 'comment', '--help']).catch(() => '');
      if (!/(?:^|\s)--attach(?:\s|=)/m.test(help)) images = [];
    }
    const stagedBody = join(staging, 'comment.md');
    writeFileSync(
      stagedBody,
      images.length ? prepared.text : textOnly(prepared.text)
    );
    const args = [
      'pr',
      'comment',
      String(pr),
      '--repo',
      repo,
      '--body-file',
      stagedBody,
    ];
    try {
      await call([...args, ...images.flatMap(path => ['--attach', path])]);
    } catch (error) {
      // Only retry when gh explicitly establishes that no comment was posted.
      // Network/unknown failures may have committed; preserve the previous comment.
      if (
        !images.length ||
        !/no comment was posted|unknown flag: --attach/i.test(error.message)
      )
        throw error;
      writeFileSync(stagedBody, textOnly(prepared.text));
      await call(args);
    }
    // A cleanup failure must not trigger a second publication.
    for (const comment of previous) {
      await call([
        'api',
        '-X',
        'DELETE',
        `repos/${repo}/issues/comments/${comment.id}`,
      ]);
    }
    return { posted: true, removed: previous.length };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
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
    const result = await upsertTriptychComment({ pr, repo, bodyFile });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`comment update failed: ${error.message}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
