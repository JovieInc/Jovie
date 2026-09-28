#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
/**
 * Storybook story quality guard.
 *
 * Blocks the class of "coverage void" stories that pass Chromatic/a11y while
 * destroying product taste:
 * - bare atoms on pure black / dark void backgrounds
 * - hand-rolled fake product chrome (bg-blue-600 continue buttons, etc.)
 * - design-studio leftovers pretending to be the system
 * - stale Storybook source receipts that no longer prove current ancestry
 *
 * Run: node scripts/storybook-story-quality-guard.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  process.env.STORYBOOK_QUALITY_ROOT ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
);
const scanRoots = [
  path.join(root, 'apps/web/components'),
  path.join(root, 'packages/ui'),
];

/** @type {{ file: string, rule: string, detail: string }[]} */
const findings = [];

async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...(await walk(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.stories.tsx')) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file);
}

function add(file, rule, detail) {
  findings.push({ file: rel(file), rule, detail });
}

const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const STRING_CONSTANT_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"]*)\2/g;
const SOURCE_SHA_PROPERTY_PATTERN =
  /\bsourceSha\s*:\s*(?:(['"])([^'"]*)\1|([A-Za-z_$][\w$]*))/g;

// Exit 0 and 1 are git's definitive answers for `rev-parse --verify --quiet`
// and `merge-base --is-ancestor`. Anything else (spawn failure, signal, exit 128
// from an unreadable object) is an execution error, not a verdict: retry it,
// then fail closed with the stderr instead of reporting a false "not an
// ancestor".
const GIT_ATTEMPTS = 3;

// Every provenance read walks the real object graph, not the commit-graph
// file. CI checkouts run `git fetch` with auto maintenance enabled, whose
// detached `git maintenance run --auto` rewrites .git/objects/info/commit-graph
// while structural lanes run concurrently; a half-written or stale graph can
// answer --is-ancestor falsely and report a valid receipt as a non-ancestor.
const GIT_FLAGS = ['-c', 'core.commitGraph=false'];

/** @returns {{ value: boolean, error: string }} Non-empty error = no verdict. */
function gitVerdict(args) {
  let error = '';
  for (let attempt = 1; attempt <= GIT_ATTEMPTS; attempt += 1) {
    const result = spawnSync('git', [...GIT_FLAGS, ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    if (result.status === 0) return { value: true, error: '' };
    if (result.status === 1) return { value: false, error: '' };
    error =
      result.error?.message ||
      result.stderr?.trim() ||
      `exit ${result.status ?? 'null'} signal ${result.signal ?? 'none'}`;
  }
  return { value: false, error: `git ${args.join(' ')}: ${error}` };
}

function gitOutput(args) {
  const result = spawnSync('git', [...GIT_FLAGS, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

// A shallow boundary hides every commit below it, so in a shallow checkout a
// missing commit or a failed ancestry walk proves nothing about the receipt.
// A hosted structural lane reported a receipt ~1,345 commits deep as "not an
// ancestor" after the job had verified the checkout was unshallowed; the
// context below tells the next occurrence whether HEAD was cut off.
function checkoutContext() {
  const gitPath = name => {
    const file = gitOutput(['rev-parse', '--git-path', name]);
    return file ? path.resolve(root, file) : '';
  };
  const shallowPath = gitPath('shallow');
  const boundaryShas =
    shallowPath && existsSync(shallowPath)
      ? readFileSync(shallowPath, 'utf8').split('\n').filter(Boolean)
      : [];
  const shallow =
    gitOutput(['rev-parse', '--is-shallow-repository']) === 'true' ||
    boundaryShas.length > 0;
  const head = gitOutput(['rev-parse', '--short', 'HEAD']) || 'unknown';
  const reachable = gitOutput(['rev-list', '--count', 'HEAD']) || 'unknown';
  let summary = `HEAD ${head}, ${reachable} commits reachable, ${boundaryShas.length} shallow boundaries`;
  if (boundaryShas.length > 0) {
    // Name who cut the history: when the shallow file was written, where the
    // cut is, and what the most recent fetch retrieved.
    const fetchHeadPath = gitPath('FETCH_HEAD');
    const lastFetch =
      fetchHeadPath && existsSync(fetchHeadPath)
        ? readFileSync(fetchHeadPath, 'utf8').split('\n')[0].trim()
        : 'none';
    summary += `; boundary ${boundaryShas.slice(0, 3).join(',')}; shallow file written ${statSync(shallowPath).mtime.toISOString()}; last fetch: ${lastFetch || 'none'}`;
  }
  return { shallow, summary };
}

function stringConstants(text) {
  return new Map(
    [...text.matchAll(STRING_CONSTANT_PATTERN)].map(match => [
      match[1],
      match[3],
    ])
  );
}

function sourceShaReceipts(text) {
  const constants = stringConstants(text);
  return [...text.matchAll(SOURCE_SHA_PROPERTY_PATTERN)].map(match => ({
    sha: match[2] ?? constants.get(match[3]) ?? '',
    token: match[2] ?? match[3] ?? '',
  }));
}

async function checkStoryProvenance(files, texts) {
  /** @type {Map<string, { file: string, storyPath: string }[]>} */
  const storiesBySha = new Map();

  for (const file of files) {
    const receipts = sourceShaReceipts(texts.get(file));
    const storyPath = rel(file).replaceAll(path.sep, '/');
    for (const receipt of receipts) {
      if (!SOURCE_SHA_PATTERN.test(receipt.sha)) {
        add(
          file,
          'story-provenance-invalid-source-sha',
          `sourceSha ${receipt.token || '<missing>'} is not a 40-character lowercase commit SHA.`
        );
        continue;
      }
      const existing = storiesBySha.get(receipt.sha) ?? [];
      existing.push({ file, storyPath });
      storiesBySha.set(receipt.sha, existing);
    }
  }

  for (const [sha, stories] of storiesBySha) {
    const reportAll = (rule, detail) => {
      for (const story of stories) add(story.file, rule, detail);
    };

    const exists = gitVerdict([
      'rev-parse',
      '--verify',
      '--quiet',
      `${sha}^{commit}`,
    ]);
    if (exists.error) {
      reportAll('story-provenance-git-error', exists.error);
      continue;
    }
    if (!exists.value) {
      const context = checkoutContext();
      if (context.shallow) {
        reportAll(
          'story-provenance-shallow',
          `sourceSha ${sha} is not in this shallow checkout (${context.summary}); fetch full history before checking provenance.`
        );
        continue;
      }
      reportAll(
        'story-provenance-commit',
        `sourceSha ${sha} does not resolve to a commit in this checkout.`
      );
      continue;
    }

    const ancestor = gitVerdict(['merge-base', '--is-ancestor', sha, 'HEAD']);
    if (ancestor.error) {
      reportAll('story-provenance-git-error', ancestor.error);
      continue;
    }
    if (!ancestor.value) {
      const context = checkoutContext();
      if (context.shallow) {
        reportAll(
          'story-provenance-shallow',
          `sourceSha ${sha} is below the shallow boundary of this checkout (${context.summary}); fetch full history before checking provenance.`
        );
        continue;
      }
      reportAll(
        'story-provenance-ancestor',
        `sourceSha ${sha} is not an ancestor of HEAD (${context.summary}); update the receipt to a commit containing this story.`
      );
      continue;
    }

    for (const story of stories) {
      const atReceipt = gitVerdict([
        'rev-parse',
        '--verify',
        '--quiet',
        `${sha}:${story.storyPath}`,
      ]);
      if (atReceipt.error) {
        add(story.file, 'story-provenance-git-error', atReceipt.error);
      } else if (!atReceipt.value) {
        add(
          story.file,
          'story-provenance-story-at-receipt',
          `sourceSha ${sha} does not contain ${story.storyPath}.`
        );
      }
    }
  }
}

const BANNED_PATTERNS = [
  {
    rule: 'no-pure-black-story-chrome',
    re: /\bbg-black\b|backgroundColor:\s*['"]#000['"]|background:\s*['"]#000['"]/i,
    detail:
      'Do not stage stories on pure black chrome; use System B surfaces (bg-base).',
  },
  {
    rule: 'no-fake-blue-cta',
    re: /\bbg-blue-600\b|\bbg-blue-500\b/,
    detail:
      'Do not hand-roll fake primary CTAs in stories; render the real product component.',
  },
  {
    rule: 'no-gray-900-void-tile',
    re: /dark:bg-gray-900[^"'`]*dark:text-gray-100/,
    detail:
      'Do not invent off-system gray tiles; use AmountSelector/PaySelector or System B tokens.',
  },
];

async function main() {
  const files = (await Promise.all(scanRoots.map(walk))).flat();
  const texts = new Map();

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    texts.set(file, text);
    const normalized = file.replaceAll('\\', '/');

    // Design-studio section stories are not the product system.
    if (normalized.includes('/components/design-studio/')) {
      add(
        file,
        'no-design-studio-product-stories',
        'Design-studio leftovers are quarantined from the product Storybook library.'
      );
      continue;
    }

    for (const ban of BANNED_PATTERNS) {
      if (ban.re.test(text)) add(file, ban.rule, ban.detail);
    }

    // Bare AmountSelector args-only stories recreate the floating white circle.
    if (
      normalized.endsWith('/AmountSelector.stories.tsx') &&
      !text.includes('grid grid-cols-') &&
      !text.includes('PayAmountRow') &&
      !text.includes('PaySelector')
    ) {
      add(
        file,
        'amount-selector-requires-composition',
        'AmountSelector must be shown in a pay-row composition, never as a lone void tile.'
      );
    }

    // PaySelector stories must render PaySelector itself.
    if (
      normalized.endsWith('/PaySelector.stories.tsx') &&
      text.includes('<button') &&
      !text.includes('<PaySelector')
    ) {
      add(
        file,
        'payselector-must-use-real-component',
        'PaySelector stories must render <PaySelector />, not a hand-rolled mock.'
      );
    }
  }

  await checkStoryProvenance(files, texts);

  if (findings.length === 0) {
    console.log(`[story-quality] clean (${files.length} stories scanned)`);
    return;
  }

  console.error(
    `[story-quality] ${findings.length} finding(s) in ${files.length} stories:`
  );
  for (const f of findings) {
    console.error(`- ${f.file}\n  rule: ${f.rule}\n  ${f.detail}`);
  }
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
