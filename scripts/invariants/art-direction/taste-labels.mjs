/**
 * Taste-label capture. Every time Tim approves or rejects a frame or page
 * (chat, approvals artifact, Pen, design review) the reviewer stores it here:
 * the image, the verdict, his words, and the anti-slop rule ids it maps to.
 * Judges calibrate from this set (vision-calibration.mjs) and promote as it
 * grows. Data: docs/design-system/taste-labels/labels.jsonl, images in docs/screenshots/taste-labels/images/.
 *
 *   node scripts/invariants/art-direction/taste-labels.mjs add --id <slug> --surface <text> \
 *     --verdict approve|reject --words "<Tim's words>" --rules ASR-023,ASR-026 \
 *     [--image <file>] [--source <ref>] [--judge cliche=defect --judge polish=ok]
 *   node scripts/invariants/art-direction/taste-labels.mjs list
 */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './paths.mjs';
import { CRITERIA } from './vision-calibration.mjs';

export const TASTE_DIR = 'docs/design-system/taste-labels';
export const TASTE_LABELS = `${TASTE_DIR}/labels.jsonl`;
const REGISTRY = 'docs/design-system/anti-slop-rules.json';
const ID = /^[a-z0-9][a-z0-9-]{2,60}$/u;

export function readTasteLabels(root = REPO_ROOT) {
  const file = join(root, TASTE_LABELS);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function validateRow(row, root = REPO_ROOT, seen = new Set()) {
  const errors = [];
  const at = row.id ?? '(no id)';
  if (!ID.test(row.id ?? '')) errors.push(`${at}: id must be a lowercase slug`);
  if (seen.has(row.id)) errors.push(`${at}: duplicate id`);
  if (!['approve', 'reject'].includes(row.verdict))
    errors.push(`${at}: verdict must be approve or reject`);
  if (!row.words || !row.wordsSource)
    errors.push(`${at}: needs words and wordsSource`);
  if (!row.surface) errors.push(`${at}: needs surface`);
  if (!Array.isArray(row.rules))
    errors.push(`${at}: rules must be an array of ASR ids`);
  for (const rule of row.rules ?? [])
    if (!/^ASR-\d{3}$/u.test(rule)) errors.push(`${at}: bad rule id ${rule}`);
  if (existsSync(join(root, REGISTRY))) {
    const known = new Set(
      JSON.parse(readFileSync(join(root, REGISTRY), 'utf8')).rules.map(
        r => r.id
      )
    );
    for (const rule of row.rules ?? [])
      if (/^ASR-\d{3}$/u.test(rule) && !known.has(rule))
        errors.push(`${at}: unknown rule ${rule}`);
  }
  if (row.image) {
    if (!existsSync(join(root, row.image)))
      errors.push(`${at}: image missing ${row.image}`);
  } else if (row.imageStatus !== 'unrecoverable' || !row.imageNote) {
    errors.push(
      `${at}: no image needs imageStatus "unrecoverable" and an imageNote saying why`
    );
  }
  for (const j of row.judgeLabels ?? []) {
    if (!(j.criterion in CRITERIA) || !['defect', 'ok'].includes(j.truth))
      errors.push(`${at}: bad judge label ${JSON.stringify(j)}`);
  }
  seen.add(row.id);
  return errors;
}

export function validateAll(root = REPO_ROOT) {
  const seen = new Set();
  return readTasteLabels(root).flatMap(row => validateRow(row, root, seen));
}

export function check(root = REPO_ROOT) {
  return { failures: validateAll(root).map(e => `taste-labels: ${e}`) };
}

function cli(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name, all = false) => {
    const values = [];
    rest.forEach((v, i) => {
      if (v === `--${name}`) values.push(rest[i + 1]);
    });
    return all ? values : values[0];
  };
  if (cmd === 'list') {
    for (const r of readTasteLabels())
      process.stdout.write(
        `${r.verdict.padEnd(7)} ${r.id}  ${r.rules.join(',')}  ${r.words.slice(0, 70)}\n`
      );
    return 0;
  }
  if (cmd !== 'add') {
    process.stderr.write('usage: add|list\n');
    return 2;
  }
  const id = flag('id');
  const row = {
    id,
    ts: new Date().toISOString(),
    surface: flag('surface'),
    verdict: flag('verdict'),
    words: flag('words'),
    wordsSource: flag('source') ?? 'chat',
    rules: (flag('rules') ?? '').split(',').filter(Boolean),
    judgeLabels: flag('judge', true).map(v => {
      const [criterion, truth] = v.split('=');
      return { criterion, truth };
    }),
  };
  const image = flag('image');
  if (image) {
    mkdirSync(join(REPO_ROOT, 'docs/screenshots/taste-labels/images'), {
      recursive: true,
    });
    row.image = `docs/screenshots/taste-labels/images/${id}${extname(image)}`;
    copyFileSync(image, join(REPO_ROOT, row.image));
  } else {
    row.imageStatus = 'unrecoverable';
    row.imageNote = flag('image-note') ?? '';
  }
  const errors = validateRow(
    row,
    REPO_ROOT,
    new Set(readTasteLabels().map(r => r.id))
  );
  if (errors.length) {
    process.stderr.write(errors.join('\n') + '\n');
    return 1;
  }
  appendFileSync(join(REPO_ROOT, TASTE_LABELS), JSON.stringify(row) + '\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = cli(process.argv.slice(2));
