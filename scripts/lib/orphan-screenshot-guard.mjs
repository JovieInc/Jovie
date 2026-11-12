// Review-image orphan guard (repo hygiene).
//
// One-off PR evidence (before/after captures, QA stills) kept landing under
// docs/screenshots and docs/pen-stills and then nothing pointed at it, so the
// tracked tree grew against its shrink-only byte budget. Every image under
// those roots must be referenced, by path or file name, from a tracked file
// outside the image's own folder. An evidence bundle counts too: an image
// listed by a sibling file (README, capture.json, holdout.json) is live when
// a tracked file outside the folder names the folder (surface census
// evidence, a test that reads the folder). PR evidence belongs on the PR
// (attachments or a CI artifact), not in the tree. Policy:
// docs/ci/repository-health.md.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

export const REVIEW_IMAGE_ROOTS = Object.freeze([
  'docs/screenshots/',
  'docs/pen-stills/',
]);
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const IMAGE_PATH = new RegExp(`\\.(?:${IMAGE_EXTENSIONS.join('|')})$`, 'i');
// A path-ish token ending in an image extension: `a/b/c.png`, `../c.png`,
// `c.png`. Characters outside TOKEN_CHAR (quotes, `(`, `$`, `{`, `:`) end it,
// so markdown links, URLs and template literals all yield their path tail.
// Find the extension first, then walk back: a single leading-class regex
// backtracks quadratically over long word runs (minified JSON, lockfiles).
const EXTENSION_HIT = new RegExp(
  `\\.(?:${IMAGE_EXTENSIONS.join('|')})(?!\\w)`,
  'gi'
);
const TOKEN_CHAR = /[\w@.+/-]/;
function* referenceTokens(text) {
  for (const hit of text.matchAll(EXTENSION_HIT)) {
    let start = hit.index;
    while (start > 0 && TOKEN_CHAR.test(text[start - 1])) start -= 1;
    yield text.slice(start, hit.index + hit[0].length);
  }
}

export const isReviewImage = path =>
  IMAGE_PATH.test(path) && REVIEW_IMAGE_ROOTS.some(r => path.startsWith(r));

const RELATIVE_TOKEN = /^\.\.?\//;

const segmentsOf = token =>
  token.split('/').filter(part => part && part !== '.' && part !== '..');

// `jov-1/after.png` references docs/screenshots/jov-1/after.png; a bare
// `after.png` references every image with that file name.
function tailMatches(imageSegments, tokenSegments) {
  const length = Math.min(imageSegments.length, tokenSegments.length);
  for (let offset = 1; offset <= length; offset += 1)
    if (
      imageSegments[imageSegments.length - offset] !==
      tokenSegments[tokenSegments.length - offset]
    )
      return false;
  return true;
}

// `docs/screenshots/jov-1` is named as `screenshots/jov-1` (covers absolute
// and `../screenshots/jov-1` relative spellings).
const folderMention = dir => dir.split('/').slice(-2).join('/');
const mentionPattern = dir =>
  new RegExp(
    `(?<![\\w-])${folderMention(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`
  );
const isInside = (path, dir) => path.startsWith(`${dir}/`);

/**
 * Tracked files containing any of `needles` (git grep fixed-string
 * prefilter), or null when `root` is not a git checkout.
 */
export function gitFilesContaining(root, needles) {
  const args = ['grep', '-I', '-i', '-F', '-l', '-z'];
  for (const needle of needles) args.push('-e', needle);
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } catch (error) {
    // git grep exits 1 when nothing matches; anything else means no repo.
    return error?.status === 1 ? [] : null;
  }
}

/**
 * Returns one error per review image that is neither referenced from outside
 * its folder nor listed by a sibling file in a folder named from outside.
 */
export function findOrphanReviewImages({
  root = process.cwd(),
  trackedPaths = [],
  filesContaining = needles => gitFilesContaining(root, needles),
  readFile = path => readFileSync(resolve(root, path), 'utf8'),
}) {
  const images = [...new Set(trackedPaths)].filter(isReviewImage).sort();
  if (images.length === 0) return [];
  const textPaths = trackedPaths.filter(path => !IMAGE_PATH.test(path));
  const scan = (needles, visit) => {
    for (const source of filesContaining(needles) ?? textPaths) {
      if (IMAGE_PATH.test(source)) continue;
      let text;
      try {
        text = readFile(source);
      } catch {
        continue;
      }
      visit(source, text);
    }
  };
  const imageSet = new Set(images);
  const byName = new Map();
  for (const image of images) {
    const name = posix.basename(image);
    byName.set(name, [...(byName.get(name) ?? []), image]);
  }
  const live = new Set();
  const listedBySibling = new Set();
  scan(
    IMAGE_EXTENSIONS.map(extension => `.${extension}`),
    (source, text) => {
      const sourceDir = posix.dirname(source);
      // Inside a review root a bare file name lists the source's own folder
      // (a bundle README), never a same-named image in another folder.
      const bareIsLocal = REVIEW_IMAGE_ROOTS.some(r => source.startsWith(r));
      for (const token of referenceTokens(text)) {
        // There a ./ or ../ link names exactly one file, resolved from the
        // source's own folder, never every image that shares its tail.
        if (bareIsLocal && RELATIVE_TOKEN.test(token)) {
          const image = posix.normalize(posix.join(sourceDir, token));
          if (!imageSet.has(image)) continue;
          if (posix.dirname(image) === sourceDir) listedBySibling.add(image);
          else live.add(image);
          continue;
        }
        const tokenSegments = segmentsOf(token);
        for (const image of byName.get(tokenSegments.at(-1)) ?? []) {
          if (live.has(image) || !tailMatches(image.split('/'), tokenSegments))
            continue;
          if (posix.dirname(image) === sourceDir) listedBySibling.add(image);
          else if (!(bareIsLocal && !token.includes('/'))) live.add(image);
        }
      }
    }
  );
  // A review root is never a bundle: policy prose names docs/screenshots and
  // docs/pen-stills everywhere, so a root-level image must be named itself.
  const bundleDirs = [
    ...new Set(
      [...listedBySibling]
        .filter(image => !live.has(image))
        .map(image => posix.dirname(image))
        .filter(dir => !REVIEW_IMAGE_ROOTS.includes(`${dir}/`))
    ),
  ];
  if (bundleDirs.length > 0) {
    const namedDirs = new Set();
    const patterns = new Map(bundleDirs.map(dir => [dir, mentionPattern(dir)]));
    scan(bundleDirs.map(folderMention), (source, text) => {
      for (const [dir, pattern] of patterns)
        if (!isInside(source, dir) && pattern.test(text)) namedDirs.add(dir);
    });
    for (const image of listedBySibling)
      if (namedDirs.has(posix.dirname(image))) live.add(image);
  }
  return images
    .filter(image => !live.has(image))
    .map(
      image =>
        `${image}: unreferenced review image (nothing outside ${posix.dirname(image)}/ names it or its listed folder); put PR evidence on the PR (attachment or CI artifact) instead, or link it from the doc that needs it (docs/ci/repository-health.md)`
    );
}
