#!/usr/bin/env node
// CLI for the engineering wins ledger (canon/wins/wins.jsonl).
//   validate                 schema + duplicate check
//   summary [--json]         counts by status and the weekly metric
//   ingest --pr N [--repo R] append a win from a merged PR "## Win" section
//   sync                     refresh PR mergedAt from GitHub
//   rollup [--write]         weekly investor rollup (docs/metrics/wins-weekly.json)
//   due                      merged wins still waiting on their after-value
//   measure-due [--store]    auto-measure queryable dues; skip needs-probe
//   notify                   one-line messages for verified, meaningful wins
//   receipt --id --metric --value --evidence [--sha] [--store]  post-deploy re-measure
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';
import { formatBiomeJson } from './lib/format-biome-json.mjs';
import {
  clusters,
  dueMeasurements,
  notifyLine,
  parseWinSection,
  readLedger,
  validateLedger,
  validateWin,
  WINS_PATH,
  weeklyMetrics,
  weeklyRollup,
  winFromPr,
  winStatus,
} from './lib/wins-ledger.mjs';
import { dueMeasurePlan, measureDueWins } from './lib/wins-measure/index.mjs';
import {
  listWinsFromStore,
  mergeWins,
  overwriteWinInStore,
  putMeasureReportToStore,
  putWinsMetricsToStore,
  putWinToStore,
} from './lib/wins-store.mjs';

const HEADER = readFileSync(WINS_PATH, 'utf8').split('\n')[0];
const arg = (argv, k) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const gh = async path => {
  const result = await runGh(['api', path], { priority: 'default' });
  if (result.code !== 0)
    throw new Error(`GitHub read ${path} failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
};
const save = wins =>
  writeFileSync(
    WINS_PATH,
    `${HEADER}\n${wins.map(w => JSON.stringify(w)).join('\n')}\n`
  );

async function loadWins(argv) {
  const ledger = readLedger();
  if (!argv.includes('--store') && !argv.includes('--from-store'))
    return ledger;
  const storeWins = await listWinsFromStore();
  return mergeWins(ledger, storeWins);
}

function writeSummary(wins, argv, io) {
  const out = {
    ...weeklyMetrics(wins),
    clusters: clusters(wins).map(({ wins: _w, ...c }) => c),
    wins: wins.map(w => ({ id: w.id, status: winStatus(w) })),
  };
  if (argv.includes('--write'))
    writeFileSync(
      'docs/metrics/wins-latest.json',
      formatBiomeJson({
        schema: 'jovie.wins-metrics/v1',
        at: new Date().toISOString(),
        ...out,
      })
    );
  io.log(JSON.stringify(out, null, argv.includes('--json') ? 0 : 2));
  return out;
}

export async function main(argv, io = console) {
  const [cmd] = argv;
  // receipt --store must merge runtime-store overlays first: measure-due
  // receipts live only in the store, and a ledger-only overwrite would erase them.
  const wins =
    cmd === 'measure-due' || (cmd === 'receipt' && argv.includes('--store'))
      ? await loadWins(argv)
      : readLedger();
  if (cmd === 'validate') {
    const problems = validateLedger(wins);
    for (const p of problems) io.error(p);
    io.log(`wins ledger: ${wins.length} wins, ${problems.length} problems`);
    return problems.length ? 1 : 0;
  }
  if (cmd === 'summary') {
    writeSummary(wins, argv, io);
    return 0;
  }
  if (cmd === 'ingest') {
    const repo = arg(argv, 'repo') ?? 'JovieInc/Jovie';
    const number = Number(arg(argv, 'pr'));
    const pr = await gh(`repos/${repo}/pulls/${number}`);
    if (!pr.merged_at) throw new Error(`#${number} is not merged`);
    const win = winFromPr(
      { repo, number, mergedAt: pr.merged_at },
      parseWinSection(pr.body)
    );
    if (!win) {
      io.log(`#${number}: no Win section, nothing to ingest`);
      return 0;
    }
    const problems = validateWin(win);
    if (problems.length) throw new Error(problems.join('; '));
    if (argv.includes('--store')) {
      // Data is not shipped as PRs: write the record to the runtime store.
      const r = await putWinToStore(win);
      io.log(`${win.id}: ${r}`);
      return 0;
    }
    if (wins.some(w => w.prs.some(p => p.number === number && p.repo === repo)))
      return (io.log(`#${number}: already in the ledger`), 0);
    save([...wins, win]);
    io.log(`added ${win.id}`);
    return 0;
  }
  if (cmd === 'sync') {
    for (const win of wins)
      for (const p of win.prs)
        if (!p.mergedAt && p.repo === 'JovieInc/Jovie')
          p.mergedAt =
            (await gh(`repos/${p.repo}/pulls/${p.number}`)).merged_at ?? null;
    save(wins);
    return 0;
  }
  if (cmd === 'due') {
    const due = dueMeasurements(wins);
    const plan = dueMeasurePlan(wins);
    for (const w of due) {
      const tag = plan.needsProbe.some(n => n.id === w.id)
        ? 'needs-probe'
        : plan.queryable.includes(w.id)
          ? 'queryable'
          : 'mixed';
      io.log(
        `${w.id}: ${tag} — measure the after-value, then wins-ledger.mjs receipt`
      );
    }
    io.log(
      `${due.length} pending-measure wins due (${plan.queryable.length} queryable, ${plan.needsProbe.length} needs-probe)`
    );
    return 0;
  }
  if (cmd === 'measure-due') {
    const toStore = argv.includes('--store');
    // Receipts are runtime-store data only (same data-vs-behaviour rule as ingest).
    // Without --store, always dry-run so canon/wins/wins.jsonl is never mirrored.
    const dryRun = argv.includes('--dry-run') || !toStore;
    const report = await measureDueWins(wins, {
      dryRun,
      sha: arg(argv, 'sha') ?? process.env.GITHUB_SHA ?? null,
      apiKey: process.env.AI_GATEWAY_API_KEY,
    });
    if (!dryRun && toStore) {
      const touched = new Set(report.measured.map(m => m.id));
      for (const id of touched) {
        const win = wins.find(w => w.id === id);
        if (!win) continue;
        const problems = validateWin(win);
        if (problems.length) throw new Error(`${id}: ${problems.join('; ')}`);
        io.log(`${id}: ${await overwriteWinInStore(win)}`);
      }
      const metrics = {
        schema: 'jovie.wins-metrics/v1',
        at: report.at,
        ...weeklyMetrics(wins),
        clusters: clusters(wins).map(({ wins: _w, ...c }) => c),
      };
      io.log(await putWinsMetricsToStore(metrics));
      io.log(
        await putMeasureReportToStore({
          schema: 'jovie.wins-measure/v1',
          ...report,
        })
      );
    } else if (!toStore) {
      io.log(
        'measure-due: dry-run (pass --store to persist receipts in the runtime store)'
      );
    }
    io.log(JSON.stringify(report, null, argv.includes('--json') ? 0 : 2));
    if (argv.includes('--write')) writeSummary(wins, argv, io);
    return report.errors.length ? 1 : 0;
  }
  if (cmd === 'notify') {
    for (const line of wins.map(notifyLine).filter(Boolean)) io.log(line);
    return 0;
  }
  if (cmd === 'rollup') {
    const limit = 500;
    const since = new Date(Date.now() - 56 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = await runGh(
      [
        'pr',
        'list',
        '--repo',
        'JovieInc/Jovie',
        '--state',
        'merged',
        '--search',
        `merged:>=${since}`,
        '--limit',
        String(limit),
        '--json',
        'createdAt,mergedAt',
      ],
      { priority: 'default' }
    );
    if (r.code !== 0) throw new Error(`GitHub read failed: ${r.stderr.trim()}`);
    const merged = JSON.parse(r.stdout);
    // A full capped response cannot establish that the cohort is complete.
    // Stop before aggregation/publication; retain the previous snapshot.
    if (merged.length >= limit)
      throw new Error(
        `Merged PR cohort reached the ${limit}-row limit; completeness is unproven. Weekly rollup not written.`
      );
    const out = {
      schema: 'jovie.wins-weekly/v1',
      at: new Date().toISOString(),
      weeks: weeklyRollup(wins, merged),
      unmeasured: ['ciMinutesSaved', 'costPerMergedPr'],
      note: 'Engineering metrics only. Dollar figures belong in the private ops store and are never written here.',
    };
    if (argv.includes('--write'))
      writeFileSync('docs/metrics/wins-weekly.json', formatBiomeJson(out));
    io.log(JSON.stringify(out, null, 2));
    return 0;
  }
  if (cmd === 'receipt') {
    const id = arg(argv, 'id');
    const win = wins.find(w => w.id === id);
    if (!win) throw new Error('unknown win id');
    win.receipts = [
      ...(win.receipts ?? []),
      {
        metric: arg(argv, 'metric'),
        value: Number(arg(argv, 'value')),
        at: new Date().toISOString(),
        evidence: arg(argv, 'evidence'),
        sha: arg(argv, 'sha') ?? null,
      },
    ];
    const problems = validateWin(win);
    if (problems.length) throw new Error(problems.join('; '));
    if (argv.includes('--store')) {
      io.log(
        `${win.id}: ${await overwriteWinInStore(win)} (${winStatus(win)})`
      );
      return 0;
    }
    // Replace the win in the ledger copy and save.
    const next = wins.map(w => (w.id === win.id ? win : w));
    if (!wins.some(w => w.id === win.id)) next.push(win);
    save(next);
    io.log(`${win.id}: ${winStatus(win)}`);
    return 0;
  }
  io.error(
    'usage: wins-ledger.mjs validate|summary|ingest|sync|rollup|due|measure-due|notify|receipt'
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(await main(process.argv.slice(2)));
