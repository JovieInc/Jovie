export class Workstream {
  constructor(id) {
    this.id = id;
    this.name = '';
    this.issueIds = [];
    this.area = '';
    this.effort = 'trivial';
    this.valueScore = 0;
    this.evidence = [];
  }
}

export function bundleWorkstreams(classifications) {
  const actionable = classifications.filter(
    c =>
      c.category !== 'duplicate' &&
      c.category !== 'superseded' &&
      c.category !== 'obsolete'
  );
  const byArea = {};
  for (const c of actionable) {
    const area = c.area || 'unknown';
    if (!byArea[area]) byArea[area] = [];
    byArea[area].push(c);
  }
  const workstreams = [];
  const bundled = new Set();
  for (const [area, issues] of Object.entries(byArea)) {
    const small = issues.filter(
      c => c.effort === 'trivial' || c.effort === 'small'
    );
    const rest = issues.filter(
      c => c.effort !== 'trivial' && c.effort !== 'small'
    );
    if (small.length >= 2) {
      const ws = new Workstream(`${area}-bundle-${Date.now() % 1000}`);
      ws.name = `${area} cleanup bundle`;
      ws.area = area;
      ws.issueIds = small.map(c => c.identifier);
      ws.effort = small.length <= 3 ? 'small' : 'medium';
      ws.valueScore = Math.max(...small.map(c => c.valueScore || 0));
      ws.evidence = [`bundled ${small.length} small ${area} issues`];
      workstreams.push(ws);
      small.forEach(c => bundled.add(c.identifier));
    }
    for (const c of rest) {
      if (!bundled.has(c.identifier)) {
        const ws = new Workstream(`single-${c.identifier.toLowerCase()}`);
        ws.name = (c.title || '').slice(0, 60);
        ws.area = area;
        ws.issueIds = [c.identifier];
        ws.effort = c.effort;
        ws.valueScore = c.valueScore || 0;
        ws.evidence = ['standalone'];
        workstreams.push(ws);
        bundled.add(c.identifier);
      }
    }
  }
  return workstreams;
}
