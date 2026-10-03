import { computeKey, cwesForRule, InvalidKeyError } from './fingerprint.mjs';

const SOURCES = new Set([
  'codex-cloud',
  'daybreak',
  'codex-cli',
  'codeql',
  'semgrep',
  'trivy',
  'osv',
  'gitleaks',
  'trufflehog',
  'deepsec',
  'dependabot',
]);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const STATUSES = new Set(['open', 'fixed', 'dismissed', 'false_positive']);
const LEVEL_SEVERITY = Object.freeze({
  error: 'high',
  warning: 'medium',
  note: 'low',
  none: 'info',
});
const DEEPSEC_SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  HIGH_BUG: 'high',
  MEDIUM: 'medium',
  BUG: 'low',
  LOW: 'low',
  SEVERE: 'low',
  INFO: 'info',
});
const CSV_HEADERS = Object.freeze({
  title: 'title',
  name: 'title',
  summary: 'title',
  severity: 'severity',
  level: 'severity',
  file: 'file',
  path: 'file',
  filename: 'file',
  filepath: 'file',
  line: 'start_line',
  start_line: 'start_line',
  startline: 'start_line',
  end_line: 'end_line',
  endline: 'end_line',
  rule: 'rule_id',
  rule_id: 'rule_id',
  ruleid: 'rule_id',
  cwe: 'cwe',
  id: 'source_id',
  finding_id: 'source_id',
  findingid: 'source_id',
  status: 'status',
  state: 'status',
  validated: 'validated',
  url: 'url',
  link: 'url',
  symbol: 'symbol',
  function: 'symbol',
  repo: 'repo',
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function integersFrom(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const found = [];
  for (const entry of raw) {
    const text = String(entry ?? '');
    const tagged = text.match(/(?:cwe[-_/])(\d+)/i);
    const numeric = Number(tagged?.[1] ?? text);
    if (Number.isInteger(numeric) && numeric > 0) found.push(numeric);
  }
  return [...new Set(found)];
}

function severityFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= 9) return 'critical';
  if (value >= 7) return 'high';
  if (value >= 4) return 'medium';
  return 'low';
}

function severityFromText(value) {
  const text = String(value ?? '').toLowerCase();
  if (SEVERITIES.has(text)) return text;
  if (text === 'moderate' || text === 'warning') return 'medium';
  if (text === 'error') return 'high';
  return LEVEL_SEVERITY[text] ?? null;
}

function statusFrom(value) {
  const text = String(value ?? '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (text === 'falsepositive' || text === 'false_positive')
    return 'false_positive';
  if (text === 'fixed' || text === 'resolved' || text === 'done')
    return 'fixed';
  if (text === 'dismissed' || text === 'suppressed') return 'dismissed';
  if (STATUSES.has(text)) return text;
  return 'open';
}

function sourceFromDriver(name) {
  const text = String(name ?? '').toLowerCase();
  if (text.includes('codeql')) return 'codeql';
  if (text.includes('semgrep')) return 'semgrep';
  if (text.includes('trivy')) return 'trivy';
  if (text.includes('gitleaks')) return 'gitleaks';
  if (text.includes('osv')) return 'osv';
  if (text.includes('truffle')) return 'trufflehog';
  if (text.includes('daybreak')) return 'daybreak';
  if (text.includes('codex') || text.includes('aardvark')) return 'codex-cli';
  if (text.includes('dependabot')) return 'dependabot';
  return null;
}

function repoRelative(uri) {
  if (!uri) return null;
  let path = decodeURIComponent(String(uri).replace(/^file:\/\//, ''));
  path = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const rooted = path.search(
    /(?:^|\/)(?:apps|packages|scripts|workers|\.github)\//
  );
  if (rooted > 0) path = path.slice(path[rooted] === '/' ? rooted + 1 : rooted);
  return path.replace(/^\/+/, '') || null;
}

function cwesFromRule(rule, result, run) {
  const props = asObject(rule?.properties) ?? {};
  const resultProps = asObject(result?.properties) ?? {};
  const tags = [...(props.tags ?? []), ...(resultProps.tags ?? [])];
  const fromTags = tags.flatMap(tag => {
    const match = String(tag).match(/cwe[-_/]?(\d+)/i);
    return match ? [Number(match[1])] : [];
  });
  const fromProps = integersFrom(props.cwe ?? resultProps.cwe);
  const taxa = new Map();
  for (const taxonomy of run?.taxonomies ?? []) {
    for (const taxon of taxonomy?.taxa ?? [])
      taxa.set(`${taxonomy.name}:${taxon.id}`, taxon.id);
  }
  const fromTaxa = [];
  for (const item of result?.taxa ?? []) {
    const id =
      item?.id ?? taxa.get(`${item?.toolComponent?.name}:${item?.index}`);
    fromTaxa.push(...integersFrom(id));
  }
  for (const relationship of rule?.relationships ?? []) {
    fromTaxa.push(...integersFrom(relationship?.target?.id));
  }
  return [...new Set([...fromTags, ...fromProps, ...fromTaxa])];
}

function indexRules(driver) {
  const rules = new Map();
  for (const rule of driver?.rules ?? []) {
    if (rule?.id) rules.set(rule.id, rule);
  }
  return rules;
}

function blankFinding(options, patch) {
  return {
    schema_version: 1,
    source: patch.source,
    source_id: String(patch.source_id ?? ''),
    repo: patch.repo || options.repo || 'JovieInc/Jovie',
    commit_sha: options.commit_sha ?? patch.commit_sha ?? null,
    severity: patch.severity ?? 'low',
    validated: patch.validated === true,
    rule_id: patch.rule_id ?? null,
    cwe: patch.cwe ?? [],
    file: patch.file ?? null,
    start_line: patch.start_line ?? null,
    end_line: patch.end_line ?? null,
    symbol: patch.symbol ?? null,
    title: String(patch.title ?? patch.rule_id ?? 'finding'),
    url: patch.url ?? null,
    status: patch.status ?? 'open',
    coverage: options.coverage ?? patch.coverage ?? 'unknown',
    package: patch.package ?? null,
    kind: patch.kind ?? null,
    extra: patch.extra ?? null,
  };
}

function finish(findings, warnings, options) {
  const kept = [];
  for (const finding of findings) {
    if (!finding.cwe?.length) finding.cwe = cwesForRule(finding.rule_id);
    if (!SOURCES.has(finding.source)) {
      warnings.push('unknown_source');
      continue;
    }
    try {
      finding.key = computeKey(finding, options);
      kept.push(finding);
    } catch (error) {
      if (error instanceof InvalidKeyError) warnings.push(error.code);
      else throw error;
    }
  }
  return { findings: kept, warnings };
}

function parseSarif(doc, options) {
  const findings = [];
  const warnings = [];
  for (const run of doc.runs ?? []) {
    const driver = run.tool?.driver ?? {};
    const source = options.source ?? sourceFromDriver(driver.name);
    const rules = indexRules(driver);
    (run.results ?? []).forEach((result, index) => {
      const ruleId = result.ruleId ?? result.rule?.id ?? null;
      const rule = rules.get(ruleId) ?? null;
      const props = asObject(rule?.properties) ?? {};
      const resultProps = asObject(result?.properties) ?? {};
      const location = result.locations?.[0]?.physicalLocation ?? {};
      const region = location.region ?? {};
      const score =
        resultProps['security-severity'] ??
        props['security-severity'] ??
        resultProps.securitySeverity;
      const packageName =
        resultProps.pkgName ?? resultProps.package ?? props.pkgName ?? null;
      findings.push(
        blankFinding(options, {
          source,
          source_id: String(
            result.partialFingerprints?.primaryLocationLineHash ??
              result.fingerprints?.primary ??
              result.guid ??
              `${ruleId ?? 'result'}-${index}`
          ),
          severity:
            severityFromScore(score) ?? severityFromText(result.level) ?? 'low',
          validated: resultProps.validated === true || props.validated === true,
          rule_id: ruleId,
          cwe: cwesFromRule(rule, result, run),
          file: repoRelative(location.artifactLocation?.uri),
          start_line: region.startLine ?? null,
          end_line: region.endLine ?? region.startLine ?? null,
          title:
            result.message?.text ??
            rule?.shortDescription?.text ??
            ruleId ??
            'finding',
          url: result.hostedViewerUri ?? result.webRequest?.url ?? null,
          status: (result.suppressions ?? []).length > 0 ? 'dismissed' : 'open',
          package: packageName,
          kind: packageName || source === 'osv' ? 'dependency' : null,
        })
      );
    });
  }
  return finish(findings, warnings, options);
}

function codexCwes(entry) {
  return [
    ...integersFrom(entry.cwe ?? entry.cwes),
    ...integersFrom(entry.taxonomy?.cwe ?? entry.taxonomy),
  ];
}

function parseCodexJson(doc, options) {
  const rows = Array.isArray(doc) ? doc : (doc.findings ?? []);
  const findings = rows.map((entry, index) =>
    blankFinding(options, {
      source: options.source ?? entry.source ?? 'codex-cloud',
      source_id: String(
        entry.id ?? entry.finding_id ?? entry.occurrence_id ?? index
      ),
      severity: severityFromText(entry.severity) ?? 'low',
      validated: entry.validated === true || entry.validated === 'true',
      rule_id: entry.rule_id ?? entry.rule ?? null,
      cwe: codexCwes(entry),
      file: entry.file ?? entry.path ?? null,
      start_line: entry.start_line ?? entry.line ?? null,
      end_line: entry.end_line ?? entry.start_line ?? entry.line ?? null,
      symbol: entry.symbol ?? entry.function ?? null,
      title: entry.title ?? entry.summary ?? 'finding',
      url: entry.url ?? null,
      status: statusFrom(entry.status),
      coverage: entry.coverage,
      kind: entry.kind ?? (entry.package ? 'dependency' : null),
      package: entry.package ?? null,
      commit_sha: entry.commit_sha ?? null,
    })
  );
  return finish(findings, [], options);
}

function parseCsv(text, options) {
  const warnings = [];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = `${text}\n`;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (rows.length === 0) return finish([], ['empty_csv'], options);
  const headers = rows[0].map(header => header.trim().toLowerCase());
  const unknown = headers.filter(header => header && !CSV_HEADERS[header]);
  if (unknown.length > 0) warnings.push('unknown_column');
  const findings = rows.slice(1).map((values, index) => {
    const extra = {};
    const fields = {};
    headers.forEach((header, column) => {
      const key = CSV_HEADERS[header];
      const value = values[column] ?? '';
      if (!header) return;
      if (!key) extra[header] = value;
      else fields[key] = value;
    });
    return blankFinding(options, {
      source: options.source ?? 'codex-cloud',
      source_id: fields.source_id || `csv-${index + 1}`,
      repo: fields.repo || options.repo,
      severity: severityFromText(fields.severity) ?? 'low',
      validated: fields.validated === 'true' || fields.validated === 'yes',
      rule_id:
        fields.rule_id ||
        (integersFrom(fields.cwe).length > 0 ? null : 'unclassified'),
      cwe: integersFrom(fields.cwe),
      file: fields.file || null,
      start_line: fields.start_line ? Number(fields.start_line) : null,
      end_line: fields.end_line ? Number(fields.end_line) : null,
      symbol: fields.symbol || null,
      title: fields.title || 'finding',
      url: fields.url || null,
      status: statusFrom(fields.status),
      extra: Object.keys(extra).length > 0 ? extra : null,
    });
  });
  return finish(findings, warnings, options);
}

function parseGitleaks(doc, options) {
  const rows = Array.isArray(doc) ? doc : (doc.findings ?? []);
  const findings = rows.map((entry, index) =>
    blankFinding(options, {
      source: options.source ?? 'gitleaks',
      source_id: String(entry.Fingerprint ?? entry.fingerprint ?? index),
      severity: 'high',
      rule_id: entry.RuleID ?? entry.ruleID ?? entry.RuleId ?? null,
      cwe: [798],
      file: entry.File ?? entry.file ?? null,
      start_line: entry.StartLine ?? entry.startLine ?? null,
      end_line: entry.EndLine ?? entry.endLine ?? null,
      title: entry.Description ?? entry.description ?? 'secret',
      commit_sha: entry.Commit ?? entry.commit ?? null,
    })
  );
  return finish(findings, [], options);
}

function osvSeverity(vulnerability) {
  const named =
    vulnerability.database_specific?.severity ?? vulnerability.severity;
  if (typeof named === 'string') return severityFromText(named);
  const scored = (vulnerability.severity ?? []).find(item => item?.score);
  return severityFromScore(scored?.score) ?? 'medium';
}

function parseOsv(doc, options) {
  const findings = [];
  for (const result of doc.results ?? []) {
    const file = result.source?.path ?? result.source?.path_pretty ?? null;
    for (const pkg of result.packages ?? []) {
      const packageName = pkg.package?.name ?? null;
      for (const vulnerability of pkg.vulnerabilities ?? []) {
        findings.push(
          blankFinding(options, {
            source: 'osv',
            source_id: String(
              vulnerability.id ?? vulnerability.aliases?.[0] ?? packageName
            ),
            severity: osvSeverity(vulnerability),
            rule_id: vulnerability.id ?? null,
            title: vulnerability.summary ?? vulnerability.id ?? 'advisory',
            url: vulnerability.database_specific?.url ?? null,
            file,
            package: packageName,
            kind: 'dependency',
          })
        );
      }
    }
  }
  return finish(findings, [], options);
}

function parseCodeScanning(doc, options) {
  const rows = Array.isArray(doc) ? doc : (doc.alerts ?? [doc]);
  const findings = rows.map(alert => {
    const instance = alert.most_recent_instance ?? {};
    const location = instance.location ?? {};
    return blankFinding(options, {
      source: options.source ?? sourceFromDriver(alert.tool?.name) ?? 'codeql',
      source_id: String(alert.number ?? alert.rule?.id ?? ''),
      severity:
        severityFromText(alert.rule?.security_severity_level) ??
        severityFromText(alert.rule?.severity) ??
        'low',
      rule_id: alert.rule?.id ?? null,
      cwe: integersFrom(alert.rule?.tags),
      file: location.path ?? null,
      start_line: location.start_line ?? null,
      end_line: location.end_line ?? null,
      title:
        alert.rule?.description ??
        instance.message?.text ??
        alert.rule?.id ??
        'alert',
      url: alert.html_url ?? null,
      status: statusFrom(alert.state),
      commit_sha: instance.commit_sha ?? null,
    });
  });
  return finish(findings, [], options);
}

function deepsecStatus(entry) {
  const verdict = entry.revalidation?.verdict ?? entry.verdict;
  if (verdict === 'false-positive') return 'false_positive';
  if (verdict === 'fixed') return 'fixed';
  return statusFrom(entry.status);
}

function parseDeepsec(doc, options) {
  const records = Array.isArray(doc) ? doc : (doc.records ?? [doc]);
  const findings = [];
  for (const record of records) {
    const nested = record.findings;
    const rows = Array.isArray(nested) ? nested : [record];
    for (const entry of rows) {
      const lines = entry.lineNumbers ?? entry.lines ?? [];
      findings.push(
        blankFinding(options, {
          source: 'deepsec',
          source_id: String(
            entry.fingerprint ?? entry.id ?? entry.vulnSlug ?? entry.slug ?? ''
          ),
          severity:
            DEEPSEC_SEVERITY[String(entry.severity ?? '').toUpperCase()] ??
            severityFromText(entry.severity) ??
            'low',
          rule_id: entry.vulnSlug ?? entry.slug ?? null,
          file:
            entry.filePath ??
            entry.path ??
            record.filePath ??
            record.path ??
            null,
          start_line: lines[0] ?? null,
          end_line: lines[1] ?? lines[0] ?? null,
          title: entry.title ?? 'finding',
          status: deepsecStatus(entry),
        })
      );
    }
  }
  return finish(findings, [], options);
}

function looksLikeGitleaks(rows) {
  const entry = rows[0];
  return Boolean(
    entry && (entry.RuleID || entry.ruleID || entry.File) && !entry.title
  );
}

function looksLikeCodeScanning(entry) {
  return Boolean(
    entry?.most_recent_instance || entry?.rule?.security_severity_level
  );
}

function looksLikeDeepsec(entry) {
  return Boolean(
    entry?.vulnSlug ||
      entry?.filePath ||
      (Array.isArray(entry?.findings) &&
        entry.findings.some(item => item?.vulnSlug))
  );
}

/**
 * @param {string | Record<string, any> | unknown[]} input
 * @param {{ repo?: string, source?: string, commit_sha?: string | null, coverage?: string, resolveSymbol?: Function }} [options]
 */
export function parseDocument(input, options = {}) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('['))
      return parseCsv(trimmed, options);
    return parseDocument(JSON.parse(trimmed), options);
  }
  const doc = /** @type {Record<string, any>} */ (input);
  if (Array.isArray(doc)) {
    if (looksLikeGitleaks(doc)) return parseGitleaks(doc, options);
    if (looksLikeCodeScanning(doc[0])) return parseCodeScanning(doc, options);
    if (looksLikeDeepsec(doc[0])) return parseDeepsec(doc, options);
    return parseCodexJson(doc, options);
  }
  if (Array.isArray(doc?.runs)) return parseSarif(doc, options);
  if (
    Array.isArray(doc?.results) &&
    doc.results.some(result => result?.packages)
  ) {
    return parseOsv(doc, options);
  }
  if (looksLikeCodeScanning(doc) || Array.isArray(doc?.alerts)) {
    return parseCodeScanning(doc, options);
  }
  if (looksLikeDeepsec(doc) || Array.isArray(doc?.records))
    return parseDeepsec(doc, options);
  if (Array.isArray(doc?.findings) && looksLikeGitleaks(doc.findings)) {
    return parseGitleaks(doc, options);
  }
  if (Array.isArray(doc?.findings)) return parseCodexJson(doc, options);
  return finish([], ['unrecognized_document'], options);
}
