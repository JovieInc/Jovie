/**
 * ASR-033. A demo artist presented as a named, verified customer is invented
 * proof. The homepage example slot stays labeled "Example artist", with no
 * verified badge, no stock workspace line, and no print-sheet costume.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const PERSONAL = /^[A-Z][\p{L}'’-]+ [A-Z][\p{L}'’-]+$/u;
const STOCK = [
  /quiet workspace/iu,
  /\bseamless(?:ly)?\b/iu,
  /\bunlock(?:s|ed|ing)?\b/iu,
  /\belevate[sd]?\b/iu,
  /\bworld-class\b/iu,
  /\ball-in-one\b/iu,
];

const COPY_FILES = [
  'apps/web/data/homepageEditorialCopy.ts',
  'apps/web/data/demoArtists.ts',
  'apps/web/data/homepageProductUi.ts',
];

const BRIEF = 'docs/design-system/pen-briefs/homepage.md';

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function demoArtistFailures(source) {
  const code = stripComments(source);
  const failures = [];
  const names = [...code.matchAll(/\bname:\s*'([^']*)'/g)].map(
    match => match[1]
  );
  const handles = [...code.matchAll(/\bhandle:\s*'([^']*)'/g)].map(
    match => match[1]
  );
  const profiles = [...code.matchAll(/\bprofileDisplay:\s*'([^']*)'/g)].map(
    match => match[1]
  );
  const bylines = [...code.matchAll(/\bbyline:\s*'([^']*)'/g)].map(
    match => match[1]
  );
  if (names.length === 0) failures.push('demo artist file has no name');
  for (const name of names) {
    if (PERSONAL.test(name) || !/\bexample\b/iu.test(name)) {
      failures.push(
        `demo artist name ${JSON.stringify(name)} reads as an invented customer; label it Example artist`
      );
    }
  }
  for (const handle of handles) {
    if (!/example/iu.test(handle)) {
      failures.push(
        `demo handle ${JSON.stringify(handle)} reads as a real customer`
      );
    }
  }
  for (const profile of profiles) {
    if (!/example/iu.test(profile)) {
      failures.push(
        `demo profile ${JSON.stringify(profile)} reads as a real customer`
      );
    }
  }
  for (const byline of bylines) {
    for (const segment of byline.split('·').map(part => part.trim())) {
      if (PERSONAL.test(segment)) {
        failures.push(
          `demo byline ${JSON.stringify(segment)} reads as a person`
        );
      }
    }
  }
  return failures;
}

export function stockPhraseFailures(source, label) {
  const code = stripComments(source);
  const failures = [];
  for (const pattern of STOCK) {
    if (pattern.test(code)) {
      failures.push(`${label} contains stock phrase ${pattern}`);
    }
  }
  return failures;
}

export function homepageSurfaceFailures(source, label) {
  const code = stripComments(source);
  const failures = [];
  if (/\bCircleCheck\b/u.test(code)) {
    failures.push(`${label} paints a verified badge on the homepage mock`);
  }
  if (/\.hv3-rule::before/u.test(code) || /--hv3-mark\b/u.test(code)) {
    failures.push(`${label} draws a registration cross`);
  }
  if (/background-clip:\s*text/u.test(code)) {
    failures.push(`${label} clips a headline to a gradient`);
  }
  return failures;
}

export function briefFailures(source) {
  const failures = [];
  if (!/Example artist/u.test(source)) {
    failures.push('homepage pen brief must label the mock Example artist');
  }
  if (/registration crosses where/iu.test(source)) {
    failures.push('homepage pen brief still requires registration crosses');
  }
  if (/fall off from primary ink/iu.test(source)) {
    failures.push(
      'homepage pen brief still requires gradient-clipped headlines'
    );
  }
  if (/invented demo artist/iu.test(source)) {
    failures.push('homepage pen brief still asks for an invented customer');
  }
  return failures;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

export function check(repoRoot) {
  const failures = [];
  const read = rel => readFileSync(join(repoRoot, rel), 'utf8');
  for (const failure of demoArtistFailures(
    read('apps/web/data/demoArtists.ts')
  )) {
    failures.push(failure);
  }
  for (const rel of COPY_FILES) {
    for (const failure of stockPhraseFailures(read(rel), rel)) {
      failures.push(failure);
    }
  }
  const home = join(repoRoot, 'apps/web/components/homepage');
  for (const path of walk(home)) {
    if (/\.(test|stories)\.[cm]?[jt]sx?$/u.test(path)) continue;
    if (!/\.(tsx?|css)$/u.test(path)) continue;
    const rel = relative(repoRoot, path);
    for (const failure of homepageSurfaceFailures(
      readFileSync(path, 'utf8'),
      rel
    )) {
      failures.push(failure);
    }
  }
  for (const failure of briefFailures(read(BRIEF))) failures.push(failure);
  return { failures };
}
