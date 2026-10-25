#!/usr/bin/env node
/**
 * One-off backfill: add release-ledger rows to existing daily receipts.
 *
 * node scripts/backfill-changelog-ledger.mjs --keys 2026-10-24,2026-10-13 [--write]
 *
 * For each receipt, reads titles and merge times for the PRs it already names
 * (source ids and audit ids), keeps those merged after the previous receipt's
 * window and by the end of this one, and classifies them with the same module
 * the publisher uses. Receipt contentHash covers the rendered digest lines,
 * not the receipt comment, so the digest text is untouched. Titles are not
 * stored. Idempotent: receipts that already have a ledger are skipped.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  classifyLedgerEntry,
  readLedgerNote,
  toReceiptRow,
} from '../apps/web/lib/release-ledger.ts';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const keys = new Set((arg('--keys') ?? '').split(',').filter(Boolean));
if (keys.size === 0) throw new Error('Usage: --keys YYYY-MM-DD[,..] [--write]');
const path = 'CHANGELOG.md';
const markdown = readFileSync(path, 'utf8');
const RECEIPT_RE = /<!-- daily-changelog-receipt\/v1 (.+) -->/g;
const receipts = [...markdown.matchAll(RECEIPT_RE)].map(match => ({
  raw: match[0],
  data: JSON.parse(match[1]),
}));
const windowEnds = receipts
  .map(item => item.data.window?.end)
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

const gql = query =>
  JSON.parse(
    execFileSync('gh', ['api', 'graphql', '--input', '-'], {
      input: JSON.stringify({ query }),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  );

let updated = markdown;
for (const item of receipts) {
  const { data } = item;
  if (!keys.has(data.window?.key) || data.ledger) continue;
  const end = data.window.end;
  const previousEnd = windowEnds.filter(value => value < end).at(-1) ?? 0;
  const ids = [
    ...new Set([
      ...(data.sourceReceiptIds ?? []),
      ...(data.audit ?? []).map(a => a.id),
    ]),
  ];
  const storyBySource = new Map(
    (data.stories ?? []).flatMap(story =>
      story.sourceIds.map(id => [id, story.id])
    )
  );
  const numbers = [
    ...new Set(ids.map(id => Number(/#(\d+)@/.exec(id)?.[1])).filter(Boolean)),
  ];
  const rows = [];
  for (let offset = 0; offset < numbers.length; offset += 50) {
    const batch = numbers.slice(offset, offset + 50);
    const fields = batch
      .map(n => `p${n}:pullRequest(number:${n}){number title mergedAt body}`)
      .join('\n');
    const response = gql(
      `query { repository(owner:"JovieInc",name:"Jovie") { ${fields} } }`
    );
    if (response.errors || !response.data?.repository)
      throw new Error('PR read failed during backfill');
    for (const n of batch) {
      const pr = response.data.repository[`p${n}`];
      const mergedMs = Date.parse(pr?.mergedAt ?? '');
      if (!pr || !Number.isFinite(mergedMs)) continue;
      if (mergedMs <= previousEnd || mergedMs > end) continue;
      const id = ids.find(value => value.includes(`#${n}@`));
      rows.push(
        toReceiptRow(
          classifyLedgerEntry({
            number: n,
            title: pr.title,
            storyId: storyBySource.get(id) ?? null,
            ...readLedgerNote(pr.body),
          })
        )
      );
    }
  }
  rows.sort((a, b) => a.n - b.n);
  console.log(
    `${data.window.key}: ${rows.length} ledger rows from ${numbers.length} PRs`
  );
  updated = updated.replace(
    item.raw,
    () =>
      `<!-- daily-changelog-receipt/v1 ${JSON.stringify({ ...data, ledger: rows })} -->`
  );
}
if (process.argv.includes('--write')) writeFileSync(path, updated);
