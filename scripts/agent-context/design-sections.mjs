#!/usr/bin/env node
// Explicit authoring command; verification never rewrites reviewed hashes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST = 'scripts/agent-context/design-sections.json';

export function runDesignSections(root, args) {
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === '--write'),
    'Use --write after reviewing design edits, or no arguments to verify'
  );
  const read = file => readFileSync(resolve(root, file), 'utf8');
  const recorded = JSON.parse(read(MANIFEST));
  assert.ok(
    Array.isArray(recorded) && recorded.length > 0,
    'Empty design record'
  );
  const sections = [
    read('DESIGN.md'),
    read('docs/design-system/DETAILS.md'),
  ].flatMap(text => text.split(/(?=^## )/m));
  const seen = new Set();
  const actual = recorded.map(({ heading, sha256 }) => {
    assert.ok(
      typeof heading === 'string' &&
        heading.startsWith('## ') &&
        !seen.has(heading),
      'Invalid or duplicate recorded heading'
    );
    seen.add(heading);
    let matches = sections.filter(
      section => section.split('\n')[0] === heading
    );
    const digest = section =>
      createHash('sha256')
        .update(section.replace(/\]\([^)]*\)/g, '](link)').trim())
        .digest('hex');
    // Routing stubs and relocated bodies share headings. Preserve the already
    // recorded body; never guess which changed duplicate should become policy.
    if (matches.length > 1)
      matches = matches.filter(section => digest(section) === sha256);
    assert.equal(
      matches.length,
      1,
      `Missing or ambiguous design section: ${heading}`
    );
    return {
      heading,
      sha256: digest(matches[0]),
    };
  });
  if (args.includes('--write')) {
    writeFileSync(
      resolve(root, MANIFEST),
      `${JSON.stringify(actual, null, 2)}\n`
    );
  } else {
    assert.deepEqual(
      recorded,
      actual,
      'Design integrity record is stale. Review the design edit, then run node scripts/agent-context/design-sections.mjs --write'
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runDesignSections(process.cwd(), process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
