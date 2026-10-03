import type { AuditFix, VisibilityAuditReport } from './types';

function fixLine(fix: AuditFix): string {
  if (fix.agenticFix.kind === 'submission') {
    const ready = fix.agenticFix.ready
      ? 'provider ready'
      : 'provider mapped, not in the current preparable set';
    return `${fix.priority}. ${fix.title} — submission \`${fix.agenticFix.providerId}\` (${ready}). ${fix.reason}`;
  }
  if (fix.agenticFix.kind === 'dsp_bio_sync') {
    return `${fix.priority}. ${fix.title} — DSP bio sync (${fix.agenticFix.providerIds.join(', ')}). ${fix.reason}`;
  }
  return `${fix.priority}. ${fix.title} — manual \`${fix.agenticFix.action}\`. ${fix.reason}`;
}

export function renderVisibilityAuditMarkdown(
  report: VisibilityAuditReport
): string {
  const lines: string[] = [
    `# ${report.title}`,
    '',
    `Artist: ${report.artistName}`,
    `Profile: ${report.profileUrl} (${report.profilePath})`,
    `Generated: ${report.generatedAt}`,
    `Price: $${report.priceUsd}`,
    report.creditNote,
    '',
  ];
  if (report.evidenceNote) {
    lines.push(report.evidenceNote, '');
  }

  lines.push('## Identity', '');
  lines.push(
    'Chain: MusicBrainz MBID → Wikidata QID → ISNI, using stored links and `buildEntitySameAs`.',
    ''
  );
  for (const step of report.identity.steps) {
    const values = step.values.length > 0 ? step.values.join(', ') : 'none';
    lines.push(`- ${step.label}: ${step.status} (${values})`);
  }
  lines.push('', 'sameAs:', '');
  if (report.identity.sameAs.length === 0) {
    lines.push('- none');
  } else {
    for (const url of report.identity.sameAs) lines.push(`- ${url}`);
  }

  lines.push(
    '',
    `## DSP presence (${report.dspPresence.registryCount} registry platforms)`,
    '',
    `${report.dspPresence.presentCount} present, ${report.dspPresence.missingCount} missing. Presence is a stored URL on a dsp-registry platform. MusicFetch is not called.`,
    ''
  );
  for (const category of ['streaming', 'video', 'metadata', 'social']) {
    const rows = report.dspPresence.platforms.filter(
      row => row.category === category
    );
    if (rows.length === 0) continue;
    lines.push(`### ${category}`, '');
    for (const row of rows.filter(item => item.present)) {
      lines.push(`- ${row.name}: present (${row.urls.join(', ')})`);
    }
    const missing = rows.filter(item => !item.present).map(item => item.name);
    if (missing.length > 0) lines.push(`- Missing: ${missing.join(', ')}`);
    lines.push('');
  }

  lines.push('## Link-in-bio graph', '');
  lines.push(
    'Classified with the ingestion strategy URL detectors (Linktree, Beacons, Laylo, Instagram, TikTok, X, YouTube). No pages were fetched for this report.',
    ''
  );
  if (report.linkGraph.nodes.length === 0) {
    lines.push('No ingested link-in-bio or social URLs were supplied.', '');
  } else {
    for (const node of report.linkGraph.nodes) {
      const handle = node.handle ? ` @${node.handle}` : '';
      const via = node.via ? ` via ${node.via}` : '';
      lines.push(
        `- ${node.platform}${handle} (${node.source}${via}): ${node.url}`
      );
    }
    lines.push('');
  }
  if (report.linkGraph.conflicts.length === 0) {
    lines.push('Conflicts: none.', '');
  } else {
    lines.push('Conflicts:', '');
    for (const conflict of report.linkGraph.conflicts) {
      lines.push(`- ${conflict.kind}: ${conflict.summary}`);
    }
    lines.push('');
  }

  lines.push('## Google page-1 ownership', '');
  lines.push(report.searchOwnership.instruction, '');
  lines.push(
    `Monitoring flag \`${report.searchOwnership.monitoringFlag}\` default: ${report.searchOwnership.monitoringDefault ? 'on' : 'off'}. SerpAPI requests: ${report.searchOwnership.serpApiRequests}.`,
    ''
  );
  if (report.searchOwnership.rows.length === 0) {
    lines.push('Manual rows: none yet.', '');
  } else {
    for (const row of report.searchOwnership.rows) {
      lines.push(
        `- ${row.query}: rank ${row.rank ?? 'unrecorded'}, owned ${row.owned === null ? 'unrecorded' : row.owned ? 'yes' : 'no'}, ${row.url ?? 'no url'}`
      );
    }
    lines.push('');
  }

  lines.push('## Answer-engine citations', '');
  lines.push(report.citations.disclosure, '');
  lines.push(report.citations.instruction, '');
  lines.push(
    `Checks: ${report.citations.totalChecks}. Cited: ${report.citations.citedCount}. Share of citation: ${report.citations.shareOfCitation}.`,
    ''
  );
  for (const question of report.citations.questions) {
    if (question.checks.length === 0) {
      lines.push(`- ${question.question} (${question.category}): not checked`);
      continue;
    }
    const summary = question.checks
      .map(check => `${check.engine} ${check.cited ? 'cited' : 'not cited'}`)
      .join('; ');
    lines.push(`- ${question.question} (${question.category}): ${summary}`);
  }
  lines.push('');

  lines.push('## Catalog mismatches', '');
  lines.push(report.catalog.policy, '');
  if (report.catalog.mismatches.length === 0) {
    lines.push('No `dsp_catalog_mismatches` rows were supplied.', '');
  } else {
    for (const row of report.catalog.mismatches) {
      lines.push(
        `- ${row.isrc} ${row.mismatchType} (${row.status})${row.providerId ? ` on ${row.providerId}` : ''}${row.externalTrackName ? `: ${row.externalTrackName}` : ''}`
      );
    }
    lines.push('');
  }

  lines.push('## Ad pixels', '');
  for (const row of report.pixels.rows) {
    const ids = row.pixelIds.length > 0 ? row.pixelIds.join(', ') : 'none';
    lines.push(
      `- ${row.platform}: ${row.present ? 'present' : 'missing'} (${ids})`
    );
  }
  lines.push('');

  lines.push('## Prioritized fixes', '');
  lines.push(
    'Agentic fixes map to Pro submissions (MusicBrainz, AllMusic) and DSP bio sync. MusicBrainz authenticated edits stay mapped and not preparable.',
    ''
  );
  for (const fix of report.fixes) {
    lines.push(fixLine(fix));
  }
  lines.push('');
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '')}\n`;
}
