import {
  computeKey,
  cwesForRule,
  InvalidFindingError,
} from './fingerprint.mjs';

const SOURCES = new Set([
  'codeql',
  'codex-cli',
  'codex-cloud',
  'daybreak',
  'deepsec',
  'dependabot',
  'gitleaks',
  'osv',
  'semgrep',
  'trivy',
  'trufflehog',
]);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

function numbers(value) {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  return [
    ...new Set(
      entries
        .flatMap(entry => String(entry).match(/\d+/g) ?? [])
        .map(Number)
        .filter(number => Number.isInteger(number) && number > 0)
    ),
  ];
}

function severity(value, score) {
  const name = String(value ?? '')
    .trim()
    .toLowerCase();
  if (SEVERITIES.has(name)) return name;
  // SARIF diagnostic levels describe presentation, not security impact.
  const numeric =
    score == null || String(score).trim() === '' ? NaN : Number(score);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) {
    if (numeric >= 9) return 'critical';
    if (numeric >= 7) return 'high';
    if (numeric >= 4) return 'medium';
    return numeric > 0 ? 'low' : 'info';
  }
  if (name === 'error') return 'high';
  if (name === 'warning' || name === 'moderate') return 'medium';
  if (name === 'note' || name === 'none')
    return name === 'note' ? 'low' : 'info';
  return 'low';
}

function status(value) {
  const normalized = String(value ?? 'open')
    .toLowerCase()
    .replace(/[ -]+/g, '_');
  if (['fixed', 'resolved', 'done'].includes(normalized)) return 'fixed';
  if (['dismissed', 'suppressed'].includes(normalized)) return 'dismissed';
  if (['falsepositive', 'false_positive'].includes(normalized)) {
    return 'false_positive';
  }
  return 'open';
}

function sourceFrom(name) {
  const driver = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  for (const source of SOURCES) {
    if (driver.includes(source.replaceAll('-', ''))) {
      return source;
    }
  }
  if (driver.includes('aardvark')) return 'codex-cli';
  if (driver.includes('codex')) return 'codex-cloud';
  return null;
}

function pathFrom(value, isUri = false) {
  if (!value) return null;
  let path = String(value);
  if (isUri) {
    try {
      path = decodeURIComponent(path);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      // Preserve malformed scanner URIs rather than dropping the document.
    }
  }
  path = path
    .replace(/^file:\/\//, '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  const repositoryRoot = path.search(
    /(?:^|\/)(?:\.github|apps|packages|scripts|workers)\//
  );
  if (repositoryRoot > 0) {
    path = path.slice(
      path[repositoryRoot] === '/' ? repositoryRoot + 1 : repositoryRoot
    );
  }
  return path.replace(/^\/+/, '');
}

function finding(options, patch) {
  return {
    schema_version: 1,
    source: patch.source,
    source_id: String(patch.source_id ?? ''),
    repo: patch.repo || options.repo || 'JovieInc/Jovie',
    commit_sha: patch.commit_sha ?? options.commit_sha ?? null,
    severity: patch.severity ?? 'low',
    validated: patch.validated === true,
    rule_id: patch.rule_id ?? null,
    cwe: patch.cwe ?? [],
    file: patch.file ?? null,
    start_line: patch.start_line ?? null,
    end_line: patch.end_line ?? patch.start_line ?? null,
    symbol: patch.symbol ?? null,
    title: String(patch.title ?? patch.rule_id ?? 'finding'),
    url: patch.url ?? null,
    status: patch.status ?? 'open',
    coverage: patch.coverage ?? options.coverage ?? 'unknown',
  };
}

function finish(findings, warnings) {
  const normalized = [];
  for (const item of findings) {
    if (!item.cwe.length) item.cwe = cwesForRule(item.rule_id);
    if (!SOURCES.has(item.source)) {
      warnings.push('unknown_source');
      continue;
    }
    try {
      item.key = computeKey(item);
      normalized.push(item);
    } catch (error) {
      if (!(error instanceof InvalidFindingError)) throw error;
      warnings.push(error.code);
    }
  }
  return { findings: normalized, warnings: [...new Set(warnings)] };
}

function sarifFindings(document, options) {
  const findings = [];
  for (const run of document.runs ?? []) {
    const driver = run.tool?.driver ?? {};
    const rules = new Map((driver.rules ?? []).map(rule => [rule.id, rule]));
    (run.results ?? []).forEach((result, index) => {
      const ruleId = result.ruleId ?? result.rule?.id ?? null;
      const rule = rules.get(ruleId) ?? {};
      const properties = {
        ...(rule.properties ?? {}),
        ...(result.properties ?? {}),
      };
      const location = result.locations?.[0] ?? {};
      const physical = location.physicalLocation ?? {};
      const region = physical.region ?? {};
      const cwe = numbers([
        ...(properties.tags ?? []),
        properties.cwe,
        ...(rule.relationships ?? []).map(item => item.target?.id),
      ]);
      findings.push(
        finding(options, {
          source: options.source ?? sourceFrom(driver.name),
          source_id:
            result.partialFingerprints?.primaryLocationLineHash ??
            result.guid ??
            `${ruleId ?? 'result'}-${index}`,
          severity: severity(result.level, properties['security-severity']),
          validated: properties.validated === true,
          rule_id: ruleId,
          cwe,
          file: pathFrom(physical.artifactLocation?.uri, true),
          start_line: region.startLine ?? null,
          end_line: region.endLine ?? region.startLine ?? null,
          symbol:
            result.logicalLocations?.[0]?.fullyQualifiedName ??
            location.logicalLocations?.[0]?.fullyQualifiedName ??
            location.logicalLocations?.[0]?.name ??
            null,
          title:
            result.message?.text ??
            rule.shortDescription?.text ??
            ruleId ??
            'finding',
          url: result.hostedViewerUri ?? null,
          status: result.suppressions?.length ? 'dismissed' : 'open',
        })
      );
    });
  }
  return finish(findings, []);
}

function codexFindings(document, options) {
  const rows = Array.isArray(document) ? document : (document.findings ?? []);
  return finish(
    rows.map((entry, index) => {
      const location = entry.location ?? entry.locations?.[0] ?? {};
      const region = location.region ?? {};
      const file = entry.file ?? entry.path ?? entry.file_path ?? location.path;
      return finding(options, {
        source: options.source ?? entry.source ?? 'codex-cloud',
        source_id:
          entry.id ?? entry.finding_id ?? entry.occurrence_id ?? String(index),
        repo: entry.repo,
        commit_sha: entry.commit_sha,
        severity: severity(entry.severity),
        validated: entry.validated === true || entry.validated === 'true',
        rule_id: entry.rule_id ?? entry.rule ?? null,
        cwe: numbers([entry.cwe, entry.cwes]),
        file: file != null ? pathFrom(file) : pathFrom(location.uri, true),
        start_line: entry.start_line ?? entry.line ?? region.startLine ?? null,
        end_line: entry.end_line ?? region.endLine ?? entry.line ?? null,
        symbol: entry.symbol ?? entry.function ?? location.symbol ?? null,
        title: entry.title ?? entry.summary ?? entry.name ?? 'finding',
        url: entry.url ?? entry.link ?? null,
        status: status(entry.status ?? entry.state),
        coverage: entry.coverage,
      });
    }),
    []
  );
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = `${text}\n`;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted && character === '"' && input[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value)) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  return rows;
}

function csvFindings(text, options) {
  const rows = csvRows(text);
  if (!rows.length) return { findings: [], warnings: ['empty_csv'] };
  const aliases = {
    filename: 'file',
    filepath: 'file',
    finding_id: 'source_id',
    function: 'symbol',
    id: 'source_id',
    line: 'start_line',
    name: 'title',
    path: 'file',
    rule: 'rule_id',
    ruleid: 'rule_id',
    state: 'status',
    summary: 'title',
  };
  const allowed = new Set([
    'cwe',
    'end_line',
    'file',
    'repo',
    'rule_id',
    'severity',
    'source_id',
    'start_line',
    'status',
    'symbol',
    'title',
    'url',
    'validated',
  ]);
  const headers = rows[0].map(value => {
    const header = value.trim().toLowerCase();
    return aliases[header] ?? header;
  });
  const warnings = headers.some(header => !allowed.has(header))
    ? ['unknown_column']
    : [];
  const findings = rows.slice(1).map((values, index) => {
    const entry = Object.fromEntries(
      headers
        .map((header, column) => [header, values[column] ?? ''])
        .filter(([header]) => allowed.has(header))
    );
    return finding(options, {
      source: options.source ?? 'codex-cloud',
      source_id: entry.source_id || `csv-${index + 1}`,
      repo: entry.repo,
      severity: severity(entry.severity),
      validated: ['true', 'yes'].includes(entry.validated?.toLowerCase()),
      rule_id: entry.rule_id || (entry.cwe ? null : 'unclassified'),
      cwe: numbers(entry.cwe),
      file: pathFrom(entry.file),
      start_line: entry.start_line ? Number(entry.start_line) : null,
      end_line: entry.end_line ? Number(entry.end_line) : null,
      symbol: entry.symbol || null,
      title: entry.title || 'finding',
      url: entry.url || null,
      status: status(entry.status),
    });
  });
  return finish(findings, warnings);
}

export function parseDocument(input, options = {}) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return csvFindings(trimmed, options);
    }
    return parseDocument(JSON.parse(trimmed), options);
  }
  if (Array.isArray(input?.runs)) return sarifFindings(input, options);
  if (Array.isArray(input) || Array.isArray(input?.findings)) {
    return codexFindings(input, options);
  }
  return { findings: [], warnings: ['unrecognized_document'] };
}
