#!/usr/bin/env node
/**
 * Binds dependency-review's package license exclusions to recorded SPDX
 * elections. A version bump of a dual-licensed package fails the GPL/AGPL
 * denylist even when the expression did not change, because the action
 * treats OR as satisfied by the denied id. The repair is an election of the
 * permissive disjunct, not a shorter denylist.
 *
 *   node scripts/security/dual-license-elections.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = '.github/dependency-review-config.yml';
const ELECTIONS = 'scripts/security/dual-license-elections.json';

/** Ids the denylist must keep. Growing it is allowed; dropping one is not. */
export const REQUIRED_DENY_LICENSES = Object.freeze([
  'AGPL-1.0',
  'AGPL-1.0-only',
  'AGPL-1.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'GPL-1.0',
  'GPL-1.0-only',
  'GPL-1.0-or-later',
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-2.0-with-classpath-exception',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'GPL-3.0-with-GCC-exception',
]);

const PURL = /^pkg:npm\/(?:%40[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const LICENSE_ID = /^[A-Za-z0-9.+-]+$/;

function scalar(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

export function yamlList(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.startsWith(`${key}:`));
  if (start < 0) return null;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    const item = /^ {2}- (.+)$/.exec(line);
    if (!item) break;
    items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return items;
}

function disjuncts(expression) {
  const wrapped = /^\((.+)\)$/.exec(expression ?? '');
  if (!wrapped || wrapped[1].includes(' AND ')) return null;
  const parts = wrapped[1].split(' OR ');
  if (parts.length < 2 || parts.some(part => !LICENSE_ID.test(part)))
    return null;
  return parts;
}

function purlName(purl) {
  const slash = purl.lastIndexOf('/');
  return slash < 0 ? '' : decodeURIComponent(purl.slice(slash + 1));
}

export function problemsFor({ configText, elections }) {
  const problems = [];
  if (typeof configText !== 'string' || configText.length === 0) {
    return ['dependency-review config is empty'];
  }
  if (/^allow-licenses:/m.test(configText)) {
    problems.push(
      'allow-licenses is set; the action ignores deny-licenses when both are set'
    );
  }
  const scalars = {
    'fail-on-severity': 'high',
    'warn-only': 'false',
    'vulnerability-check': 'true',
    'license-check': 'true',
    'comment-summary-in-pr': 'never',
  };
  for (const [key, expected] of Object.entries(scalars)) {
    if (scalar(configText, key) !== expected) {
      problems.push(`${key} must stay ${expected}`);
    }
  }
  const deny = yamlList(configText, 'deny-licenses') ?? [];
  const denied = new Set(deny);
  for (const id of REQUIRED_DENY_LICENSES) {
    if (!denied.has(id)) problems.push(`deny-licenses dropped ${id}`);
  }
  if (!Array.isArray(elections?.elections)) {
    return [...problems, 'elections file needs an elections array'];
  }
  const allow = yamlList(configText, 'allow-dependencies-licenses') ?? [];
  const electedPurls = [];
  for (const election of elections.elections) {
    const purl = election?.purl;
    if (typeof purl !== 'string' || !PURL.test(purl) || purl.includes('@')) {
      problems.push(
        `election purl must be an unversioned npm package url, got ${purl}`
      );
      continue;
    }
    if (election.package !== purlName(purl)) {
      problems.push(`${purl} package field does not match the purl name`);
    }
    const parts = disjuncts(election.expression);
    if (!parts) {
      problems.push(`${purl} expression must be an SPDX OR of license ids`);
      continue;
    }
    if (!parts.includes(election.elected) || denied.has(election.elected)) {
      problems.push(`${purl} elected license must be a permissive disjunct`);
    }
    if (
      !parts.includes(election.deniedDisjunct) ||
      !denied.has(election.deniedDisjunct)
    ) {
      problems.push(
        `${purl} deniedDisjunct must be a denied disjunct of the expression`
      );
    }
    if (
      typeof election.reason !== 'string' ||
      election.reason.trim().length < 40
    ) {
      problems.push(`${purl} needs a reason`);
    }
    electedPurls.push(purl);
  }
  const expected = [...electedPurls].sort();
  const actual = [...allow].sort();
  if (expected.join('\n') !== actual.join('\n')) {
    problems.push(
      `allow-dependencies-licenses must equal elected purls (${expected.join(', ') || 'none'})`
    );
  }
  return problems;
}

export function checkDualLicenseElections(root = ROOT) {
  let configText = '';
  let elections = null;
  try {
    configText = readFileSync(join(root, CONFIG), 'utf8');
  } catch (error) {
    return [`unreadable ${CONFIG}: ${error.message}`];
  }
  try {
    elections = JSON.parse(readFileSync(join(root, ELECTIONS), 'utf8'));
  } catch (error) {
    return [`unreadable ${ELECTIONS}: ${error.message}`];
  }
  return problemsFor({ configText, elections });
}

function main() {
  const problems = checkDualLicenseElections();
  if (problems.length > 0) {
    for (const problem of problems)
      console.error(`dual-license-elections: ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log('dual-license-elections: ok');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
