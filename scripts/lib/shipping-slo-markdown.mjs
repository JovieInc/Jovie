function fmtSeconds(s) {
  if (!Number.isFinite(s)) return 'n/a';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m${r ? ` ${r}s` : ''}` : `${r}s`;
}

export function markdownSummary(report) {
  const lines = [
    '## Shipping SLO — rolling 7d',
    '',
    '| Metric | p50 | p95 |',
    '| --- | --- | --- |',
  ];
  const rows = [
    ['CI wall time (pull_request)', report.metrics.ci?.pull_request],
    ['CI wall time (merge_group)', report.metrics.ci?.merge_group],
    ['Merge-queue wait', report.metrics.mergeQueue?.wait],
    ['Lead time · devin', report.metrics.leadTime?.devin],
    ['Lead time · codex', report.metrics.leadTime?.codex],
    ['Lead time · other', report.metrics.leadTime?.other],
    ['Remediation · PR red→green', report.metrics.remediation?.prRedToGreen],
    [
      'Remediation · main red→green',
      report.metrics.remediation?.mainRedToGreen,
    ],
    ['Remediation · promote hold', report.metrics.remediation?.promoteHold],
    ['Production lag (merged→verified)', report.metrics.productionLag?.lag],
  ];
  for (const [label, stat] of rows)
    lines.push(
      `| ${label} | ${fmtSeconds(stat?.p50)} | ${fmtSeconds(stat?.p95)} | (n=${stat?.n ?? 0}) |`
    );
  const t = report.metrics.throughput ?? {};
  lines.push(
    '',
    `**Throughput:** ${Number(t.mergesPerDay ?? 0).toFixed(1)} merges/day ` +
      `(verified ${Number(t.verifiedPerDay ?? 0).toFixed(1)}/day) · ` +
      `WoW growth ${t.wowGrowth === null ? 'n/a' : `${(t.wowGrowth * 100).toFixed(1)}%`} ` +
      `(target +8%) · trend ${t.growthTrend ?? 'unknown'}`,
    `**Queue ejection rate:** ${report.metrics.mergeQueue?.ejectionRate === null || report.metrics.mergeQueue?.ejectionRate === undefined ? 'n/a' : (report.metrics.mergeQueue.ejectionRate * 100).toFixed(1) + '%'}`
  );
  const cr = report.metrics.ciRounds;
  if (cr?.prs)
    lines.push(
      `**CI rounds per merged PR:** mean ${cr.roundsMean.toFixed(2)} (target <= ${cr.target}) · p95 ${cr.roundsP95} · Source Validation first-push pass ${cr.firstPushPassRate === null ? 'n/a' : `${(cr.firstPushPassRate * 100).toFixed(0)}%`} (n=${cr.firstPushSamples})`
    );
  const blog = report.blogPublishLatency;
  lines.push(
    '',
    `**Blog publish latency:** legacy n=${blog.cohorts.legacy.sampleCount}, content-only n=${blog.cohorts.contentOnly.sampleCount}; no SLA or improvement claim is emitted without complete samples in both cohorts.`
  );
  const regs = report.evaluation?.regressions ?? [];
  if (regs.length) {
    lines.push('', '### Regressions (>20%)');
    for (const r of regs)
      lines.push(
        `- \`${r.key}\`: baseline ${r.baseline} → observed ${r.observed} (${r.changeFraction === null ? 'n/a' : `${(r.changeFraction * 100).toFixed(0)}%`})`
      );
  }
  if (report.evaluation?.flatStall)
    lines.push(
      '',
      '### Throughput growth stall — WoW growth below +8% target for the flat-growth window; investigate the limiting stage (host pressure, provider concurrency, CI, merge queue, remediation, deploy).'
    );
  const tightened = report.evaluation?.tightenCandidates ?? [];
  if (tightened.length) {
    lines.push('', '### Baseline ratchet candidates (improvement held)');
    for (const c of tightened)
      lines.push(
        `- \`${c.key}\`: ${c.baseline} → ${c.observed} (held ${c.heldDays}d)`
      );
  }
  if (report.stageTimings)
    lines.push('', ...stageMarkdown(report.stageTimings));
  return lines.join('\n');
}

/** Stage dwell table (7d/28d) with the regression flag per stage. */
export function stageMarkdown(timings) {
  const lines = [
    '## Stage timings (jovie-stage-event/v1)',
    '',
    '| Stage | status | 24h n | 7d p50 | 7d p95 | 7d n | 28d p95 | 28d n | regression |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [type, entity] of Object.entries(timings.entities)) {
    const rows = [
      ...Object.entries(entity.stages).map(([id, row]) => [
        `${type}:${id}`,
        row,
      ]),
      ...Object.entries(entity.endToEnd).map(([pair, row]) => [
        `${type}:${pair}`,
        { ...row, status: 'end-to-end' },
      ]),
    ];
    for (const [name, row] of rows)
      lines.push(
        `| ${name} | ${row.status}${row.terminal ? ' (terminal: arrivals)' : ''} | ${row['24h']?.n ?? 0} | ${fmtSeconds(row['7d']?.p50)} | ${fmtSeconds(row['7d']?.p95)} | ${row['7d']?.n ?? 0} | ${fmtSeconds(row['28d']?.p95)} | ${row['28d']?.n ?? 0} | ${row.regression?.regressed ? `yes (${row.regression.ratio.toFixed(2)}x)` : ''} |`
      );
  }
  const down = Object.entries(timings.sources ?? {}).filter(([, s]) => !s.ok);
  if (down.length)
    lines.push(
      '',
      `**Stage sources unavailable:** ${down.map(([id, s]) => `${id} (${s.error})`).join('; ')}`
    );
  // Partial sources still carry data (ok: true) — surface the counts so a
  // shed/missing batch is visible next to the timings it weakens.
  const partial = Object.entries(timings.sources ?? {}).filter(
    ([, s]) => s.partial
  );
  if (partial.length)
    lines.push(
      '',
      `**Stage sources partial:** ${partial
        .map(([id, s]) => {
          const c = s.counts ?? {};
          const bits = [];
          if (c.failed) bits.push(`${c.failed} failed batch(es)`);
          if (c.missing) bits.push(`${c.missing} not returned`);
          if (c.capped) bits.push(`${c.capped} capped`);
          if (c.historyTruncated)
            bits.push(`${c.historyTruncated} truncated histories`);
          return `${id}${bits.length ? ` (${bits.join(', ')})` : ' (partial)'}`;
        })
        .join('; ')}`
    );
  return lines;
}
