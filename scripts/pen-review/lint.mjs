import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectDocument, parsePen } from './lint-format.mjs';
import { checkLinks } from './lint-links.mjs';
import { checkPolicy, validPolicy } from './lint-policy.mjs';

const MB = 1024 * 1024;
const MAX_BYTES = 32 * MB;
const MAX_POLICY_BYTES = MB;
const MAX_FINDINGS = 1500;
const MAX_LIBRARIES = 8;
const HELP = `Usage: pnpm lint:pen -- INPUT.pen [--policy POLICY.json] [--library alias=PATH]... [--json]
Read-only structural report for approved snapshots. Does not open Pen, follow import
URIs, rewrite files, or certify visual appearance. Exit: 0 no lint errors, 1 lint
errors, 2 invocation/invalid input. Unavailable linked evidence is unverified.`;

function parseArgs(input) {
  const args = input[0] === '--' ? input.slice(1) : input;
  const config = { libraries: new Map() };
  for (let i = 0; i < args.length; i++) {
    const part = args[i];
    if (part === '--help' || part === '-h') return { help: true };
    if (part === '--json') config.json = true;
    else if (
      part === '--policy' &&
      !config.policy &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      config.policy = args[++i];
    else if (part === '--library' && args[i + 1]) {
      const match = /^([^:/=]+)=(.+)$/u.exec(args[++i]);
      if (
        !match ||
        config.libraries.has(match[1]) ||
        config.libraries.size >= MAX_LIBRARIES
      )
        throw new Error(
          'Specify a unique --library alias=PATH (maximum eight).'
        );
      config.libraries.set(match[1], match[2]);
    } else if (part.startsWith('-') || config.input) {
      throw new Error(`Unexpected argument: ${JSON.stringify(part)}`);
    } else config.input = part;
  }
  if (!config.input) throw new Error('A Pen input snapshot is required.');
  return config;
}

async function readLimited(path, max) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('A regular file is required.');
    if (stat.size > max) throw new Error(`File exceeds ${max} bytes.`);
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        offset
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (offset !== stat.size || after.mtimeMs !== stat.mtimeMs)
      throw new Error(
        'File size changed while reading; use a frozen snapshot.'
      );
    return new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(0, offset)
    );
  } finally {
    await file.close();
  }
}

async function penModel(file, report, unavailable = false) {
  try {
    return inspectDocument(
      parsePen(await readLimited(file, MAX_BYTES)),
      file,
      report
    );
  } catch (error) {
    const detail =
      error?.code ??
      (error instanceof SyntaxError ? 'invalid JSON/JSONC' : error.message);
    report(
      unavailable ? 'unverified' : 'error',
      unavailable ? 'import.unavailable' : 'input.read',
      { file, path: '$' },
      detail,
      'Provide a readable, bounded, unmodified Pen snapshot in UTF-8.'
    );
    return null;
  }
}

function format(result) {
  const lines = result.findings.map(d => {
    const at = [
      d.page && `page=${JSON.stringify(d.page.id)}`,
      d.frame && `frame=${JSON.stringify(d.frame.id)}`,
      d.node && `node=${JSON.stringify(d.node.id)}`,
    ]
      .filter(Boolean)
      .join(' ');
    return `${d.severity} ${d.rule} ${JSON.stringify(d.file)}${at ? ` ${at}` : ''} ${d.path}: ${JSON.stringify(d.value)}. ${d.remediation}`;
  });
  const s = result.summary;
  lines.push(
    `Pen ${result.penVersion ?? 'unknown'} | ${s.error} error(s), ${s.warning} warning(s), ${s.unverified} unverified${s.omitted ? `, ${s.omitted} diagnostic(s) omitted` : ''}. Structural only; no rendered or canonical certification.`
  );
  return lines.join('\n');
}

export async function main(argv, write = console.log) {
  const json = argv.includes('--json');
  const result = {
    schemaVersion: 1,
    mode: 'structural-only',
    penVersion: null,
    findings: [],
    summary: { error: 0, warning: 0, unverified: 0, omitted: 0 },
  };
  function report(severity, rule, where, value, remediation) {
    result.summary[severity]++;
    if (result.findings.length >= MAX_FINDINGS) result.summary.omitted++;
    else {
      const encoded = JSON.stringify(value ?? null);
      result.findings.push({
        severity,
        rule,
        ...where,
        value:
          encoded.length > 480 ? `${encoded.slice(0, 480)}…` : (value ?? null),
        remediation,
      });
    }
  }
  const finish = code => {
    write(json ? JSON.stringify(result) : format(result));
    return code;
  };
  let config;
  try {
    config = parseArgs(argv);
    if (config.help) {
      write(HELP);
      return 0;
    }
  } catch (error) {
    report('error', 'usage', { file: null, path: '$' }, error.message, HELP);
    return finish(2);
  }
  let policy;
  if (config.policy) {
    const file = resolve(config.policy);
    try {
      policy = JSON.parse(await readLimited(file, MAX_POLICY_BYTES));
    } catch (error) {
      report(
        'error',
        'policy.read',
        { file, path: '$' },
        error?.code ?? 'invalid or oversized JSON policy',
        'Supply a readable JSON policy described in scripts/pen-review/LINT.md.'
      );
      return finish(2);
    }
    if (!validPolicy(policy)) {
      report(
        'error',
        'policy.schema',
        { file, path: '$' },
        policy?.version ?? null,
        'Use version 1 of the explicit ID-scoped policy described in scripts/pen-review/LINT.md.'
      );
      return finish(2);
    }
  }
  const model = await penModel(resolve(config.input), report);
  if (!model) return finish(2);
  result.penVersion = model.version;
  for (const [alias, fixture] of config.libraries) {
    const file = resolve(fixture);
    if (!model.imports.has(alias)) {
      report(
        'error',
        'import.not-declared',
        model.base,
        alias,
        'Supply a library for an alias declared in the document imports map.'
      );
      continue;
    }
    // An unavailable source cannot disprove a declared reference. A malformed
    // supplied fixture is reported separately and is never used as evidence.
    const library = await penModel(file, report, true);
    if (library) {
      model.linked.set(alias, library);
      checkLinks(library);
    }
  }
  checkLinks(model);
  if (policy) checkPolicy(model, policy);
  return finish(result.summary.error > 0 ? 1 : 0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await main(process.argv.slice(2));
