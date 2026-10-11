import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Object.assign(new Error(reason), { reason });
};
const ghDefault = args =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });

function jsonCall(gh, args, reason) {
  let result;
  try {
    result = JSON.parse(gh(args));
  } catch {
    fail(reason);
  }
  if (!Array.isArray(result)) fail(reason);
  // A full page cannot establish absence or a unique canonical issue.
  if (result.length >= 100) fail(`${reason}_incomplete`);
  return result;
}

export function upsertSloFinding(
  { repo, metric, title, body, runUrl },
  gh = ghDefault
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-z0-9_.-]+$/.test(metric)) {
    fail('invalid_finding_identity');
  }
  const fingerprint = hash(JSON.stringify(['shipping-slo', repo, metric]));
  const marker = `<!-- shipping-slo:v1 fingerprint=${fingerprint} -->`;
  const observation = `<!-- shipping-slo-observation:${hash(runUrl)} -->`;
  const list = search =>
    jsonCall(
      gh,
      [
        'issue',
        'list',
        '--repo',
        repo,
        '--state',
        'open',
        '--search',
        search,
        '--limit',
        '100',
        '--json',
        'number,title,body',
      ],
      'issue_lookup_failed'
    );
  const rows = [
    ...list(`"${fingerprint}" in:body`),
    ...list(`"${metric}" in:title`),
  ];
  const matches = [
    ...new Map(
      rows
        .filter(
          row =>
            Number.isSafeInteger(row.number) &&
            row.number > 0 &&
            (String(row.body ?? '').includes(marker) || row.title === title)
        )
        .map(row => [row.number, row])
    ).values(),
  ];
  if (matches.length > 1) fail('ambiguous_canonical_issue');
  const findingBody = `${body}\n\n${marker}\n${observation}`;
  if (!matches.length) {
    const labels = jsonCall(
      gh,
      [
        'label',
        'list',
        '--repo',
        repo,
        '--search',
        'slo-regression',
        '--limit',
        '100',
        '--json',
        'name',
      ],
      'label_lookup_failed'
    );
    const args = [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      title,
      '--body',
      findingBody,
    ];
    if (labels.some(label => label.name === 'slo-regression'))
      args.push('--label', 'slo-regression');
    let created;
    // Unknown result may have committed: never fall back to a second create.
    try {
      created = gh(args);
    } catch {
      fail('create_result_unknown');
    }
    const match = String(created)
      .trim()
      .match(
        new RegExp(
          `^https://github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/(\\d+)$`
        )
      );
    if (!match) fail('create_result_unknown');
    return {
      action: 'created',
      issue: Number(match[1]),
      metric,
      fingerprint,
      observation,
    };
  }
  const issue = matches[0];
  if (String(issue.body ?? '').includes(observation)) {
    return {
      action: 'replayed',
      issue: issue.number,
      metric,
      fingerprint,
      observation,
    };
  }
  const comments = jsonCall(
    gh,
    [
      'api',
      '-X',
      'GET',
      `repos/${repo}/issues/${issue.number}/comments?per_page=100`,
    ],
    'comment_lookup_failed'
  );
  if (
    comments.some(comment => String(comment.body ?? '').includes(observation))
  ) {
    return {
      action: 'replayed',
      issue: issue.number,
      metric,
      fingerprint,
      observation,
    };
  }
  // Append immutable recurrence evidence; never replace a human-owned body/state.
  try {
    gh([
      'issue',
      'comment',
      String(issue.number),
      '--repo',
      repo,
      '--body',
      findingBody,
    ]);
  } catch {
    fail('comment_result_unknown');
  }
  return {
    action: 'observed',
    issue: issue.number,
    metric,
    fingerprint,
    observation,
  };
}

export function deliverReport(report, { repo, runUrl }, gh = ghDefault) {
  const findings = (report.evaluation?.regressions ?? []).map(row => ({
    metric: row.key,
    title: `slo-regression: ${row.key} >20% over baseline`,
    body: [
      'Rolling 7d SLO regression detected by the shipping-SLO ratchet (JOV-6783).',
      '',
      '| Metric | Baseline | Observed | Change |',
      '| --- | --- | --- | --- |',
      `| \`${row.key}\` | ${row.baseline} | ${row.observed} | ${Math.floor(row.changeFraction * 100)}% |`,
      '',
      '## Top offenders',
      ...(report.offenders?.slowestPrs ?? []).map(
        pr =>
          `- #${pr.number} ${pr.title} — ${pr.lane} lane, ${Math.floor(pr.leadTimeSeconds / 360) / 10}h lead time`
      ),
      '',
      'Slowest CI gate runs in the window:',
      ...(report.offenders?.slowestCiRuns ?? []).map(
        run =>
          `- run ${run.id} \`${run.head_branch}\` — ${Math.floor(run.seconds / 6) / 10}m (${run.conclusion})`
      ),
      '',
      `Measurement run: ${runUrl}`,
      'Baseline: `docs/metrics/shipping-slo-baseline.json`',
    ].join('\n'),
  }));
  if (report.evaluation?.flatStall)
    findings.push({
      metric: 'throughput.growth_flat',
      title: 'slo-regression: throughput growth flat below +8% WoW target',
      body: [
        'Throughput improvement has flattened (JOV-6783).',
        'Investigate the limiting stage through the existing JOV-5817/JOV-5484 owner.',
        `Current readings: ${JSON.stringify(report.flat ?? {})}`,
        `Measurement run: ${runUrl}`,
      ].join('\n'),
    });
  const receipt = {
    schema: 'jovie-shipping-slo-delivery/v1',
    owner: 'Devin',
    runUrl,
    status: 'succeeded',
    findings: [],
  };
  for (const finding of findings) {
    try {
      receipt.findings.push({
        status: 'succeeded',
        ...upsertSloFinding({ ...finding, repo, runUrl }, gh),
      });
    } catch (error) {
      receipt.status = 'failed';
      receipt.findings.push({
        metric: finding.metric,
        status: 'failed',
        reason: error.reason ?? 'delivery_failed',
        retryDecision: 'reconcile-before-retry',
      });
      // Stop this sweep at the first unknown state; a later run reconciles its marker.
      break;
    }
  }
  return receipt;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = Object.fromEntries(
    Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [
      process.argv[2 + i * 2],
      process.argv[3 + i * 2],
    ])
  );
  let receipt;
  try {
    receipt = deliverReport(
      JSON.parse(readFileSync(args['--report'], 'utf8')),
      { repo: args['--repo'], runUrl: args['--run-url'] }
    );
  } catch {
    receipt = {
      schema: 'jovie-shipping-slo-delivery/v1',
      owner: 'Devin',
      status: 'failed',
      reason: 'invalid_report',
      retryDecision: 'repair-input',
    };
  }
  writeFileSync(args['--receipt'], `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.status === 'succeeded' ? 0 : 1;
}
