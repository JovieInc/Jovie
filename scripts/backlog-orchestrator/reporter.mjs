export function generateShadowReport({ total, classifications, workstreams, skipped }) {
  const lines = [];
  lines.push('═'.repeat(72));
  lines.push(' BACKLOG ORCHESTRATOR — SHADOW MODE REPORT');
  lines.push('═'.repeat(72));
  lines.push(`\nRan at: ${new Date().toISOString()}`);
  lines.push(`Total: ${total} | Classified: ${classifications.length} | Skipped: ${skipped || 0}\n`);

  const cats = {};
  for (const c of classifications) {
    const cat = c.category || 'unclassified';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(c);
  }
  lines.push('─'.repeat(72));
  lines.push(' CLASSIFICATION SUMMARY');
  lines.push('─'.repeat(72));
  for (const [cat, items] of Object.entries(cats)) {
    lines.push(`  ${cat.padEnd(16)} → ${items.length}`);
  }
  lines.push('');

  const dupes = classifications.filter(c => c.category === 'duplicate');
  if (dupes.length > 0) {
    lines.push('─'.repeat(72));
    lines.push(` DUPLICATES (${dupes.length})`);
    lines.push('─'.repeat(72));
    for (const d of dupes) {
      lines.push(`  ${d.identifier}: ${(d.title || '').slice(0, 60)}`);
      for (const r of d.relatedIssues) lines.push(`    → ${r.relation}: ${r.identifier}`);
    }
    lines.push('');
  }

  if (workstreams && workstreams.length > 0) {
    lines.push('─'.repeat(72));
    lines.push(` WORKSTREAMS (${workstreams.length})`);
    lines.push('─'.repeat(72));
    for (const ws of workstreams) {
      lines.push(`  ${ws.name} (${ws.issueIds.length} issues, score ${ws.valueScore})`);
      lines.push(`    ${ws.issueIds.join(', ')}`);
    }
    lines.push('');
  }

  const ranked = classifications.filter(c => c.category === 'triageable')
    .sort((a, b) => (b.valueScore || 0) - (a.valueScore || 0)).slice(0, 15);
  if (ranked.length > 0) {
    lines.push('─'.repeat(72));
    lines.push(' TOP-RANKED');
    lines.push('─'.repeat(72));
    lines.push('  Score  ID          Title');
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      lines.push(`  ${(r.valueScore || '').toString().padStart(4)}  ${r.identifier.padEnd(10)} ${(r.title || '').slice(0, 50)}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(72));
  lines.push(` END — ${classifications.length} issues`);
  lines.push('═'.repeat(72));
  return lines.join('\n');
}
