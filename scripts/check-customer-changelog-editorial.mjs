#!/usr/bin/env node
// Deterministic check of the customer changelog editorial overlay against the
// published CHANGELOG.md. See docs/CHANGELOG_PUBLICATION.md ("Headlines").
import { existsSync, readFileSync } from 'node:fs';
import { checkEditorialOverlay } from './lib/customer-changelog-editorial.mjs';

const OVERLAY = '../apps/web/data/customer-changelog-editorial.json';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
if (!existsSync(new URL(OVERLAY, import.meta.url))) {
  process.stdout.write('No customer changelog editorial overlay to check.\n');
  process.exit(0);
}
const { errors, checked } = checkEditorialOverlay({
  markdown: read('../CHANGELOG.md'),
  overlay: JSON.parse(read(OVERLAY)),
  migrations: JSON.parse(
    read('../apps/web/data/customer-changelog-permalink-migrations.json')
  ),
});
if (errors.length) {
  process.stderr.write(
    `Customer changelog editorial overlay failed:\n${errors.map(error => `  - ${error}`).join('\n')}\n`
  );
  process.exit(1);
}
process.stdout.write(
  `Customer changelog editorial overlay ok (${checked} published entries).\n`
);
