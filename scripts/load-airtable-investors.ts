#!/usr/bin/env tsx

/**
 * Load investor records into the Jovie fundraising Airtable.
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx scripts/load-airtable-investors.ts \
 *     [--source <path>] [--dry-run] [--self-test] \
 *     [--base <id>] [--table <id>] [--batch-id <slug>] [--help]
 *
 * Env (via Doppler):
 *   AIRTABLE_API_KEY  required PAT (data.records:read+write, schema.bases:read)
 *   AIRTABLE_BASE_ID  default appln0KH60XfDQc6N
 *   AIRTABLE_TABLE_ID default tblSuSH1vAmjUsjs0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'csv-parse/sync';

const DEFAULT_BASE_ID = 'appln0KH60XfDQc6N';
const DEFAULT_TABLE_ID = 'tblnFs2ZBzqwa2uhP';

const CANONICAL_HEADERS = [
  'ID',
  'Name',
  'Title',
  'Firm/Network',
  'Location',
  'Investment Stage',
  'Typical Check Size',
  'Sectors/Thesis',
  'Notable Investments',
  'Contact Email (or preferred contact method)',
  'LinkedIn',
  'Twitter',
  'AngelList/Crunchbase profile',
  'Notes on qualification',
  'Confidence',
  'Source Links',
] as const;

type Row = Record<(typeof CANONICAL_HEADERS)[number], string>;

interface Args {
  source?: string;
  dryRun: boolean;
  selfTest: boolean;
  withSource: boolean;
  base: string;
  table: string;
  batchId: string;
  help: boolean;
  force: boolean;
  allowDuplicates: boolean;
  strictSelects: boolean;
}

interface BatchAuditEntry {
  index: number;
  status: 'ok' | 'failed';
  pass: 'A' | 'B';
  recordIds: string[];
  errors: Array<{ name: string; message: string }>;
}

interface AuditLog {
  batchId: string;
  source: string;
  baseId: string;
  tableId: string;
  summary: {
    created: number;
    updated: number;
    failed: number;
    duplicates: number;
  };
  failedNames: string[];
  batches: BatchAuditEntry[];
}

const HELP = `Load investor records into the Jovie fundraising Airtable.

Usage:
  doppler run --project jovie-web --config dev -- \\
    pnpm tsx scripts/load-airtable-investors.ts [options]

Options:
  --source <path>        Source file (.csv or .txt/.md with fenced \`\`\`csv blocks)
  --dry-run              Parse + dedupe + schema diff + sample payloads. No writes.
  --self-test            Run inline synthetic fixture tests. No network.
  --with-source          With --self-test: also smoke-check today's source parses.
  --base <id>            Airtable base ID (default \${AIRTABLE_BASE_ID:-${DEFAULT_BASE_ID}})
  --table <id>           Airtable table ID (default \${AIRTABLE_TABLE_ID:-${DEFAULT_TABLE_ID}})
  --batch-id <slug>      Slug for audit log filename (default: timestamp)
  --force                Continue past schema mismatch (DANGEROUS).
  --allow-duplicates     Permit dupe Names in source (last-wins).
  --strict-selects       Fail on unknown singleSelect values (default warn).
  --help                 Show this message.

Source formats accepted:
  - Plain .csv with canonical 16-column header.
  - Markdown/text with one or more fenced \`\`\`csv blocks. Header line must match
    /^\\uFEFF?\\s*ID\\s*,\\s*Name\\s*,\\s*Title\\b/. Other fenced blocks ignored.

Canonical header (16 columns):
  ${CANONICAL_HEADERS.join(',\n  ')}

Examples:
  --self-test                              # offline tests
  --self-test --with-source --source FILE  # offline tests + parse smoke
  --dry-run --source FILE                  # show schema diff, no writes
  --source FILE --batch-id 20260425-paste  # live load with named audit
`;

function parseArgs(argv: string[]): Args {
  const a: Args = {
    source: undefined,
    dryRun: false,
    selfTest: false,
    withSource: false,
    base: process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID,
    table: process.env.AIRTABLE_TABLE_ID || DEFAULT_TABLE_ID,
    batchId: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
    help: false,
    force: false,
    allowDuplicates: false,
    strictSelects: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) {
        fail(
          `flag ${arg} requires a value`,
          'flag missing value',
          `add a value after ${arg}`
        );
      }
      return v;
    };
    switch (arg) {
      case '--source':
        a.source = next();
        break;
      case '--dry-run':
        a.dryRun = true;
        break;
      case '--self-test':
        a.selfTest = true;
        break;
      case '--with-source':
        a.withSource = true;
        break;
      case '--base':
        a.base = next();
        break;
      case '--table':
        a.table = next();
        break;
      case '--batch-id':
        a.batchId = next();
        break;
      case '--force':
        a.force = true;
        break;
      case '--allow-duplicates':
        a.allowDuplicates = true;
        break;
      case '--strict-selects':
        a.strictSelects = true;
        break;
      case '--help':
      case '-h':
        a.help = true;
        break;
      default:
        fail(
          `unknown flag: ${arg}`,
          'unrecognized argument',
          'run with --help to see usage'
        );
    }
  }
  return a;
}

function fail(what: string, cause: string, fix: string): never {
  process.stderr.write(`ERROR: ${what} | CAUSE: ${cause} | FIX: ${fix}\n`);
  process.exit(1);
}

function warn(msg: string): void {
  process.stderr.write(`WARN: ${msg}\n`);
}

const FENCE_HEADER = /^\uFEFF?\s*ID\s*,\s*Name\s*,\s*Title\b/;

function extractCsvBlocks(text: string): string[] {
  const blocks: string[] = [];
  // Match opening fence + lang tag (or blank), then capture content up to closing fence at line start.
  const fence = /^```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  const canonicalHeader = CANONICAL_HEADERS.join(',');
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const lang = m[1].toLowerCase();
    if (lang && lang !== 'csv') continue;
    const body = m[2];
    const firstLine = body.split('\n', 1)[0];
    if (FENCE_HEADER.test(firstLine)) {
      blocks.push(body);
      continue;
    }
    // Continuation block: 16-column data row starting with numeric ID + canonical
    // header missing. Prepend canonical header so csv-parse can handle it.
    if (/^\s*\d+\s*,/.test(firstLine)) {
      try {
        const cols = parse(firstLine, {
          skip_empty_lines: true,
        })[0] as string[];
        if (Array.isArray(cols) && cols.length === CANONICAL_HEADERS.length) {
          blocks.push(`${canonicalHeader}\n${body}`);
        }
      } catch {
        // ignore — not a parseable continuation
      }
    }
  }
  return blocks;
}

function parseSource(filePath: string): { rows: Row[]; rawCount: number } {
  if (!fs.existsSync(filePath)) {
    fail(
      `source file not found: ${filePath}`,
      'no such file',
      `pass an existing path via --source`
    );
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let csvTexts: string[];
  if (ext === '.csv') {
    csvTexts = [raw];
  } else {
    csvTexts = extractCsvBlocks(raw);
    if (csvTexts.length === 0) {
      fail(
        `no fenced \`\`\`csv blocks found in ${filePath}`,
        'header must match ID,Name,Title,...',
        'wrap data in ```csv ... ``` with the canonical header'
      );
    }
  }
  return parseCsvTexts(csvTexts, filePath);
}

function parseCsvTexts(
  csvTexts: string[],
  sourceLabel: string
): { rows: Row[]; rawCount: number } {
  const all: Row[] = [];
  for (const text of csvTexts) {
    const stripped = text.replace(/^\uFEFF/, '');
    let records: Record<string, string>[];
    try {
      records = parse(stripped, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail(
        `failed to parse CSV from ${sourceLabel}`,
        msg,
        'check for unmatched quotes; quote fields containing commas'
      );
    }
    const headerCheck = Object.keys(records[0] ?? {});
    if (
      headerCheck.length > 0 &&
      !headerCheck.includes('Name') &&
      !headerCheck.includes('ID')
    ) {
      warn(
        `block in ${sourceLabel} missing expected headers; got: ${headerCheck.join(',')}`
      );
    }
    for (const r of records) {
      const row: Partial<Row> = {};
      for (const h of CANONICAL_HEADERS)
        row[h] = (r[h] ?? '').toString().trim();
      if (!row.Name) continue;
      all.push(row as Row);
    }
  }
  return { rows: all, rawCount: all.length };
}

function normalizeConfidence(rows: Row[]): { rows: Row[]; warnings: number } {
  let warnings = 0;
  const out: Row[] = [];
  for (const r of rows) {
    const v = r.Confidence?.toString().trim() ?? '';
    if (v === '') {
      out.push(r);
      continue;
    }
    const lc = v.toLowerCase();
    let canon: string | null = null;
    if (lc === 'high') canon = 'High';
    else if (lc === 'medium' || lc === 'med') canon = 'Medium';
    else if (lc === 'low') canon = 'Low';
    if (canon === null) {
      warn(`unknown Confidence value "${v}" for ${r.Name} — clearing field`);
      warnings++;
      out.push({ ...r, Confidence: '' });
      continue;
    }
    out.push({ ...r, Confidence: canon });
  }
  return { rows: out, warnings };
}

function dedupe(
  rows: Row[],
  allowDuplicates: boolean
): {
  rows: Row[];
  nameCollisions: Array<{ name: string; count: number }>;
  linkedinCollisions: Array<{ url: string; count: number }>;
} {
  const byName = new Map<string, Row[]>();
  const byLinkedIn = new Map<string, Row[]>();
  for (const r of rows) {
    const nk = r.Name.trim().toLowerCase();
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk)!.push(r);
    const li = r.LinkedIn?.trim();
    if (li) {
      if (!byLinkedIn.has(li)) byLinkedIn.set(li, []);
      byLinkedIn.get(li)!.push(r);
    }
  }
  const nameCollisions = [...byName.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([name, v]) => ({ name, count: v.length }));
  const linkedinCollisions = [...byLinkedIn.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([url, v]) => ({ url, count: v.length }));

  if (
    (nameCollisions.length || linkedinCollisions.length) &&
    !allowDuplicates
  ) {
    const lines: string[] = [];
    if (nameCollisions.length) {
      lines.push('Duplicate Names:');
      nameCollisions.forEach(c => lines.push(`  - "${c.name}" x${c.count}`));
    }
    if (linkedinCollisions.length) {
      lines.push('Duplicate LinkedIn URLs:');
      linkedinCollisions.forEach(c => lines.push(`  - ${c.url} x${c.count}`));
    }
    process.stderr.write(lines.join('\n') + '\n');
    fail(
      'source contains duplicates',
      'Airtable performUpsert rejects intra-batch duplicates',
      'pass --allow-duplicates (last-wins) or fix the source'
    );
  }
  if (allowDuplicates) {
    const seen = new Map<string, Row>();
    for (const r of rows) seen.set(r.Name.trim().toLowerCase(), r);
    const seenLi = new Map<string, Row>();
    for (const r of seen.values()) {
      const li = r.LinkedIn?.trim();
      if (li) seenLi.set(li, r);
    }
    const out: Row[] = [];
    const usedLi = new Set<string>();
    for (const r of seen.values()) {
      const li = r.LinkedIn?.trim();
      if (li) {
        if (usedLi.has(li)) continue;
        usedLi.add(li);
      }
      out.push(r);
    }
    return { rows: out, nameCollisions, linkedinCollisions };
  }
  return { rows, nameCollisions, linkedinCollisions };
}

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: { choices?: Array<{ name: string }> };
}
interface AirtableTable {
  id: string;
  name: string;
  fields: AirtableField[];
}

async function fetchSchema(
  apiKey: string,
  baseId: string
): Promise<AirtableTable[]> {
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  if (res.status === 401 || res.status === 403) {
    fail(
      `Airtable auth failed (${res.status})`,
      'PAT missing or insufficient scopes',
      'doppler secrets set AIRTABLE_API_KEY=<token> --project jovie-web --config dev'
    );
  }
  if (res.status === 404) {
    fail(
      `base ${baseId} not found`,
      'base ID wrong or PAT lacks access',
      `verify https://airtable.com/${baseId}`
    );
  }
  if (!res.ok) {
    fail(
      `Airtable Meta API error (${res.status})`,
      await res.text(),
      'retry; if persistent, check Airtable status'
    );
  }
  const data = (await res.json()) as { tables: AirtableTable[] };
  return data.tables;
}

function diffSchema(table: AirtableTable): {
  missing: string[];
  nearMatches: Map<string, string[]>;
} {
  const fieldNames = new Set(table.fields.map(f => f.name));
  const missing: string[] = [];
  const nearMatches = new Map<string, string[]>();
  for (const expected of CANONICAL_HEADERS) {
    if (fieldNames.has(expected)) continue;
    missing.push(expected);
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9/]/g, '');
    const target = norm(expected);
    const candidates = table.fields
      .filter(
        f =>
          norm(f.name) === target || norm(f.name).includes(target.slice(0, 6))
      )
      .map(f => f.name);
    if (candidates.length) nearMatches.set(expected, candidates);
  }
  return { missing, nearMatches };
}

function validateSelects(
  rows: Row[],
  table: AirtableTable,
  strict: boolean
): { unknown: Array<{ field: string; value: string; name: string }> } {
  const selectFields = table.fields.filter(
    f =>
      (f.type === 'singleSelect' || f.type === 'multipleSelects') &&
      f.options?.choices
  );
  const unknown: Array<{ field: string; value: string; name: string }> = [];
  for (const f of selectFields) {
    if (
      !CANONICAL_HEADERS.includes(f.name as (typeof CANONICAL_HEADERS)[number])
    )
      continue;
    const allowed = new Set(f.options!.choices!.map(c => c.name));
    for (const r of rows) {
      const raw = r[f.name as keyof Row];
      if (!raw) continue;
      const values =
        f.type === 'multipleSelects'
          ? raw.split(',').map(s => s.trim())
          : [raw];
      for (const v of values) {
        if (v && !allowed.has(v))
          unknown.push({ field: f.name, value: v, name: r.Name });
      }
    }
  }
  if (unknown.length) {
    process.stderr.write(`Unknown singleSelect values:\n`);
    for (const u of unknown.slice(0, 20)) {
      process.stderr.write(`  - ${u.field}="${u.value}" (${u.name})\n`);
    }
    if (unknown.length > 20)
      process.stderr.write(`  ... +${unknown.length - 20} more\n`);
    if (strict) {
      fail(
        'unknown singleSelect values',
        '--strict-selects refuses to write typo-driven options',
        'normalize values in source or drop --strict-selects to allow typecast'
      );
    }
    warn('proceeding with typecast: true — Airtable may create new options');
  }
  return { unknown };
}

interface UpsertResponse {
  records: Array<{ id: string; fields: Record<string, unknown> }>;
  createdRecords?: string[];
  updatedRecords?: string[];
}

async function upsertBatch(
  apiKey: string,
  baseId: string,
  tableId: string,
  records: Row[],
  mergeOn: string[]
): Promise<UpsertResponse> {
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  const body = {
    performUpsert: { fieldsToMergeOn: mergeOn },
    typecast: true,
    records: records.map(r => ({
      fields: Object.fromEntries(
        Object.entries(r).filter(([, v]) => v !== '' && v != null)
      ),
    })),
  };
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      fail(
        `Airtable auth failed (${res.status})`,
        'PAT invalid or expired mid-run',
        'rotate PAT in Doppler and re-run; partial audit log preserved'
      );
    }
    if (res.status === 429) {
      const wait = attempt === 0 ? 1000 : 2000;
      warn(
        `429 rate-limited; backing off ${wait}ms (attempt ${attempt + 1}/3)`
      );
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      lastErr = await res.text();
      throw new Error(`Airtable upsert ${res.status}: ${lastErr}`);
    }
    return (await res.json()) as UpsertResponse;
  }
  throw new Error(`Airtable upsert exhausted retries: ${lastErr}`);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function writeAudit(audit: AuditLog): string {
  const dir = path.resolve(process.cwd(), '.context');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `airtable-load-result-${audit.batchId}.json`);
  fs.writeFileSync(file, JSON.stringify(audit, null, 2));
  return file;
}

async function runLoad(args: Args, rows: Row[]): Promise<void> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    fail(
      'AIRTABLE_API_KEY not set',
      'Doppler secret missing or not piped through',
      'doppler run --project jovie-web --config dev -- pnpm tsx scripts/load-airtable-investors.ts ...'
    );
  }

  const tables = await fetchSchema(apiKey, args.base);
  const table = tables.find(t => t.id === args.table || t.name === args.table);
  if (!table) {
    fail(
      `table ${args.table} not found in base ${args.base}`,
      'table ID wrong or PAT lacks access',
      `verify https://airtable.com/${args.base}/${args.table}`
    );
  }
  const { missing, nearMatches } = diffSchema(table);
  if (missing.length) {
    const lines = ['Missing columns in Airtable:'];
    for (const m of missing) {
      const near = nearMatches.get(m);
      lines.push(
        near ? `  - "${m}" (near matches: ${near.join(', ')})` : `  - "${m}"`
      );
    }
    process.stderr.write(lines.join('\n') + '\n');
    if (!args.force) {
      fail(
        'schema mismatch',
        'canonical columns missing in target table',
        'create the missing columns in Airtable UI, or pass --force to skip them'
      );
    }
    warn('--force set; missing columns will be omitted from payloads');
  }

  validateSelects(rows, table, args.strictSelects);

  const audit: AuditLog = {
    batchId: args.batchId,
    source: args.source ?? '<unspecified>',
    baseId: args.base,
    tableId: args.table,
    summary: { created: 0, updated: 0, failed: 0, duplicates: 0 },
    failedNames: [],
    batches: [],
  };

  if (args.dryRun) {
    process.stdout.write(`DRY RUN: ${rows.length} records would be loaded.\n`);
    process.stdout.write(
      `Schema diff: ${missing.length === 0 ? 'CLEAN' : `${missing.length} missing`}\n`
    );
    process.stdout.write(`Sample payloads (first 3):\n`);
    for (const r of rows.slice(0, 3)) {
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    }
    const withLi = rows.filter(r => r.LinkedIn?.trim()).length;
    const noLi = rows.length - withLi;
    process.stdout.write(
      `Plan: Pass A (LinkedIn merge): ${withLi} rows in ${Math.ceil(withLi / 10)} batches; Pass B (Name merge): ${noLi} rows in ${Math.ceil(noLi / 10)} batches.\n`
    );
    return;
  }

  // Two-pass upsert.
  const passA = rows.filter(r => r.LinkedIn?.trim());
  const passB = rows.filter(r => !r.LinkedIn?.trim());
  let batchIndex = 0;

  for (const [pass, list, mergeOn] of [
    ['A', passA, ['LinkedIn']],
    ['B', passB, ['Name']],
  ] as const) {
    const batches = chunk(list, 10);
    for (const b of batches) {
      const entry: BatchAuditEntry = {
        index: batchIndex++,
        status: 'ok',
        pass,
        recordIds: [],
        errors: [],
      };
      try {
        const res = await upsertBatch(apiKey, args.base, args.table, b, [
          ...mergeOn,
        ]);
        entry.recordIds = res.records.map(r => r.id);
        const created = res.createdRecords?.length ?? 0;
        const updated =
          res.updatedRecords?.length ?? Math.max(0, b.length - created);
        audit.summary.created += created;
        audit.summary.updated += updated;
      } catch (e) {
        entry.status = 'failed';
        const msg = e instanceof Error ? e.message : String(e);
        for (const r of b) {
          entry.errors.push({ name: r.Name, message: msg });
          audit.failedNames.push(r.Name);
        }
        audit.summary.failed += b.length;
        warn(`batch ${entry.index} (pass ${pass}) failed: ${msg}`);
      }
      audit.batches.push(entry);
      writeAudit(audit);
      await sleep(250);
    }
  }

  const auditFile = writeAudit(audit);
  const tableUrl = `https://airtable.com/${args.base}/${args.table}`;
  process.stdout.write(
    `\n` +
      `=== Airtable load complete ===\n` +
      `created:   ${audit.summary.created}\n` +
      `updated:   ${audit.summary.updated}\n` +
      `failed:    ${audit.summary.failed}\n` +
      `audit:     ${auditFile}\n` +
      `airtable:  ${tableUrl}\n`
  );
  if (audit.summary.failed > 0) {
    process.stdout.write(
      `\nFailed Names:\n${audit.failedNames.map(n => `  - ${n}`).join('\n')}\n`
    );
    process.stdout.write(
      `\nRe-run (idempotent): doppler run --project jovie-web --config dev -- pnpm tsx scripts/load-airtable-investors.ts --source ${args.source ?? '<source>'} --batch-id ${args.batchId}-retry\n`
    );
    process.exit(2);
  }
}

// ---------- Self-test fixtures ----------

const FIXTURE_QUOTED = `ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
1,Alice Test,Founder,"Acme, Inc","San Francisco, CA",Pre-seed,$25k,"Music, audio, creator tools","Spotify, SoundCloud",alice@example.com,https://linkedin.com/in/alice,@alice,,Strong fit,High,https://example.com
`;

const FIXTURE_BLANKS = `ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links

1,Real Person,VC,Fund,NYC,Seed,$100k,SaaS,Co1,r@x.com,https://linkedin.com/in/real,,,Good,Medium,
,,,,,,,,,,,,,,,
2,Other Person,Angel,,LA,Pre-seed,$10k,,,o@x.com,,,,Weak,Low,
`;

const FIXTURE_DUPES = `ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
1,John Smith,Angel,,NYC,Seed,$50k,,,j@a.com,,,,A,High,
2,john smith,Investor,,SF,Seed,$25k,,,j2@a.com,,,,B,Medium,
`;

const FIXTURE_FENCED = `# Some intro

\`\`\`json
{"not": "csv"}
\`\`\`

Some prose.

\`\`\`csv
\uFEFFID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
1,Bom Person,Angel,,Tokyo,Seed,$10k,,,b@x.com,,,,Has BOM,High,
\`\`\`

\`\`\`csv
ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
2,Second Person,VC,,London,Seed,$50k,,,s@x.com,,,,Block 2,Medium,
\`\`\`
`;

const FIXTURE_BAD_CONFIDENCE = `ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
1,Up Person,Angel,,NYC,Seed,$10k,,,u@x.com,,,,X,high,
2,Mid Person,Angel,,LA,Seed,$10k,,,m@x.com,,,,Y,Heigh,
3,Low Person,Angel,,SF,Seed,$10k,,,l@x.com,,,,Z,Low,
`;

interface TestCase {
  name: string;
  fn: () => void;
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function selfTest(): void {
  const cases: TestCase[] = [
    {
      name: 'quoted commas in Sectors/Thesis parse correctly',
      fn: () => {
        const { rows } = parseCsvTexts([FIXTURE_QUOTED], 'fixture:quoted');
        assert(rows.length === 1, `expected 1 row, got ${rows.length}`);
        assert(
          rows[0]['Sectors/Thesis'] === 'Music, audio, creator tools',
          `Sectors/Thesis quoted comma not preserved: ${rows[0]['Sectors/Thesis']}`
        );
        assert(
          rows[0]['Firm/Network'] === 'Acme, Inc',
          'Firm/Network quoted comma'
        );
        assert(
          rows[0].Location === 'San Francisco, CA',
          'Location quoted comma'
        );
      },
    },
    {
      name: 'blank rows dropped',
      fn: () => {
        const { rows } = parseCsvTexts([FIXTURE_BLANKS], 'fixture:blanks');
        assert(
          rows.length === 2,
          `expected 2 rows after blank drop, got ${rows.length}`
        );
      },
    },
    {
      name: 'duplicate Names (case-insensitive) detected; --allow-duplicates collapses',
      fn: () => {
        const { rows } = parseCsvTexts([FIXTURE_DUPES], 'fixture:dupes');
        const result = dedupe(rows, true);
        assert(
          result.rows.length === 1,
          `expected 1 deduped row, got ${result.rows.length}`
        );
        assert(
          result.nameCollisions.length === 1,
          `expected 1 name collision detected, got ${result.nameCollisions.length}`
        );
      },
    },
    {
      name: 'fenced ```csv blocks extracted; non-csv fences ignored; BOM stripped',
      fn: () => {
        const blocks = extractCsvBlocks(FIXTURE_FENCED);
        assert(
          blocks.length === 2,
          `expected 2 csv blocks, got ${blocks.length}`
        );
        const { rows } = parseCsvTexts(blocks, 'fixture:fenced');
        assert(
          rows.length === 2,
          `expected 2 rows from 2 blocks, got ${rows.length}`
        );
        assert(
          rows[0].Name === 'Bom Person',
          `BOM row not parsed: ${rows[0].Name}`
        );
      },
    },
    {
      name: 'mixed Confidence values normalize correctly',
      fn: () => {
        const { rows } = parseCsvTexts(
          [FIXTURE_BAD_CONFIDENCE],
          'fixture:confidence'
        );
        const { rows: norm } = normalizeConfidence(rows);
        assert(
          norm[0].Confidence === 'High',
          `'high' -> 'High' failed: ${norm[0].Confidence}`
        );
        assert(
          norm[1].Confidence === '',
          `'Heigh' -> '' (warn) failed: ${norm[1].Confidence}`
        );
        assert(
          norm[2].Confidence === 'Low',
          `'Low' kept: ${norm[2].Confidence}`
        );
      },
    },
    {
      name: 'empty source aborts',
      fn: () => {
        const blocks = extractCsvBlocks('# nothing here\n\nplain prose only.');
        assert(
          blocks.length === 0,
          `expected 0 csv blocks, got ${blocks.length}`
        );
      },
    },
    {
      name: 'fence header regex tolerates BOM and whitespace',
      fn: () => {
        assert(FENCE_HEADER.test('ID,Name,Title,Firm/Network'), 'plain header');
        assert(FENCE_HEADER.test('\uFEFFID,Name,Title'), 'BOM header');
        assert(
          FENCE_HEADER.test('  ID , Name , Title , Firm'),
          'whitespace header'
        );
        assert(
          !FENCE_HEADER.test('Foo,Bar,Baz'),
          'non-canonical header rejected'
        );
      },
    },
  ];

  let pass = 0;
  let fail_ct = 0;
  for (const c of cases) {
    try {
      c.fn();
      process.stdout.write(`  ✓ ${c.name}\n`);
      pass++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stdout.write(`  ✗ ${c.name}\n    ${msg}\n`);
      fail_ct++;
    }
  }
  process.stdout.write(`\n${pass} passed, ${fail_ct} failed\n`);
  if (fail_ct > 0) process.exit(1);
}

// ---------- Main ----------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  if (args.selfTest) {
    process.stdout.write('Running self-test fixtures...\n');
    selfTest();
    if (args.withSource) {
      if (!args.source) {
        fail(
          '--with-source requires --source <path>',
          'flag combination',
          'pass --source <path-to-source>'
        );
      }
      const { rows } = parseSource(args.source);
      const { rows: deduped } = dedupe(rows, false);
      process.stdout.write(
        `smoke: source parsed to ${deduped.length} unique records\n`
      );
    }
    return;
  }

  if (!args.source) {
    fail(
      '--source <path> is required (or use --self-test)',
      'no source specified',
      'pass --source /path/to/file.txt or --help for usage'
    );
  }

  const { rows: parsed } = parseSource(args.source);
  if (parsed.length === 0) {
    fail(
      `no valid records parsed from ${args.source}`,
      'all rows had empty Name or no fenced csv blocks',
      'verify the source has the canonical 16-column header'
    );
  }
  const { rows: normalized } = normalizeConfidence(parsed);
  const {
    rows: deduped,
    nameCollisions,
    linkedinCollisions,
  } = dedupe(normalized, args.allowDuplicates);
  if (
    args.allowDuplicates &&
    (nameCollisions.length || linkedinCollisions.length)
  ) {
    warn(
      `--allow-duplicates: collapsed ${nameCollisions.length} name + ${linkedinCollisions.length} LinkedIn dupes (last-wins)`
    );
  }

  process.stderr.write(
    `Parsed ${parsed.length} rows; ${deduped.length} after dedupe.\n`
  );

  await runLoad(args, deduped);
}

main().catch(e => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(1);
});
