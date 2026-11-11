// Local copy of JovieInc/ci guards/plugins/tracker-registry.mjs at the
// company-guards pin recorded in company-trackers.pin.json. The company job
// scans comments, so a comment that quotes a loader call fails the same way
// as an SDK import. privacy-rules.test.mjs runs this on the compliance lane.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
export const CATALOG_PATH = join(HERE, 'company-trackers.pin.json');
export const REGISTRY_PATH = join(ROOT, 'canon/privacy/tracker-registry.json');

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|html|vue|svelte|swift|kt)$/;
const COPY = /\.(md|mdx|tsx|ts|html|json)$/;
const COPY_PATH =
  /(legal|privacy|cookie|terms|marketing|landing|content|copy|messages)/i;
const SKIP =
  /(^|\/)(node_modules|vendor|dist|build|\.next|Pods|fixtures?|__fixtures__|__mocks__)\/|\.(test|spec|stories)\.|\.min\.|(^|\/)([^/]+\.lock(?:\.json)?|(?:package|npm-shrinkwrap|pnpm)-lock\.(?:json|yaml)|yarn\.lock|bun\.lockb?)$|(^|\/)canon\/(privacy\/tracker-registry|trackers)\.json$|(^|\/)\.company-guards\//;

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileCatalog(catalog) {
  return catalog.signatures.map(signature => ({
    ...signature,
    res: [
      ...(signature.hosts ?? []).map(
        host => new RegExp(`(?<![a-z0-9_-])${escape(host)}(?![a-z0-9_.-])`, 'i')
      ),
      ...(signature.code ?? []).map(pattern => new RegExp(pattern)),
    ],
  }));
}

function hostCovered(signatureHost, vendorHosts) {
  const host = signatureHost.split('/')[0];
  return vendorHosts.some(
    vendor =>
      host === vendor ||
      host.endsWith(`.${vendor}`) ||
      vendor.endsWith(`.${host}`)
  );
}

export function approved(signature, registry) {
  return (registry?.vendors ?? []).some(
    vendor =>
      vendor.rationale &&
      (vendor.id === signature.id ||
        (signature.hosts ?? []).some(host =>
          hostCovered(host, vendor.hosts ?? [])
        ))
  );
}

export function selectPaths(paths) {
  return paths.filter(
    path =>
      path &&
      !SKIP.test(path) &&
      (CODE.test(path) || COPY.test(path) || path.endsWith('package.json'))
  );
}

/** Unapproved signature hits for one file. Same pass rule as the company guard. */
export function scanFile(path, text, signatures, registry, claims = []) {
  const out = [];
  if (CODE.test(path) || path.endsWith('package.json')) {
    for (const signature of signatures) {
      if (approved(signature, registry)) continue;
      if (signature.res.some(pattern => pattern.test(text))) {
        out.push({
          id: signature.id,
          key: `tracker:${signature.id}:${path}`,
          message: `${path}: ${signature.category} "${signature.id}" is not approved in canon/privacy/tracker-registry.json (add a vendor entry with a rationale)`,
        });
      }
    }
  }
  if (COPY.test(path) && COPY_PATH.test(path)) {
    const normalized = text.replace(
      /[’‘]|&(?:apos|rsquo|lsquo);|&#0*(?:39|8216|8217);|&#x0*(?:27|2018|2019);/gi,
      "'"
    );
    for (const source of claims) {
      if (new RegExp(source, 'i').test(normalized)) {
        out.push({
          id: source,
          key: `claim:${source}:${path}`,
          message: `${path}: privacy claim /${source}/ cannot be literally true while any pixel runs`,
        });
      }
    }
  }
  return out;
}

export function invalidEntries(registry) {
  return (registry?.vendors ?? [])
    .filter(
      vendor =>
        !vendor.id ||
        !vendor.category ||
        !(vendor.hosts ?? []).length ||
        !vendor.rationale
    )
    .map(
      vendor =>
        `canon/privacy/tracker-registry.json: vendor "${vendor.id ?? '?'}" needs id, category, hosts and rationale`
    );
}

export function scanTexts(entries, catalog, registry) {
  const signatures = compileCatalog(catalog);
  const claims = [
    ...new Set([...catalog.banned_claims, ...(registry?.banned_claims ?? [])]),
  ];
  return entries.flatMap(({ path, text }) =>
    scanFile(path, text, signatures, registry, claims)
  );
}

export function scanRepo({
  root = ROOT,
  catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')),
  registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')),
  listFiles = () =>
    execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(
      '\n'
    ),
} = {}) {
  const findings = [];
  for (const path of selectPaths(listFiles())) {
    let text;
    try {
      text = readFileSync(join(root, path), 'utf8');
    } catch {
      continue;
    }
    if (text.length > 2_000_000) continue;
    findings.push(...scanTexts([{ path, text }], catalog, registry));
  }
  return [...invalidEntries(registry), ...findings.map(hit => hit.message)];
}

/** Regenerate the mirror from committed upstream bytes at the workflow's exact pin. */
export function syncCatalog({ root = ROOT, companyRoot }) {
  const workflow = readFileSync(
    join(root, '.github/workflows/company-guards.yml'),
    'utf8'
  );
  const pin = workflow.match(/^# ci-ref: ([0-9a-f]{40})$/m)?.[1];
  if (!pin) throw new Error('Missing exact company-guards workflow pin');
  const catalog = JSON.parse(
    execFileSync('git', ['show', `${pin}:canon/trackers.json`], {
      cwd: companyRoot,
      encoding: 'utf8',
    })
  );
  if (
    catalog.schema !== 'company-trackers/v1' ||
    !Array.isArray(catalog.signatures) ||
    !Array.isArray(catalog.banned_claims)
  )
    throw new Error('Invalid upstream company tracker catalog');
  compileCatalog(catalog);
  writeFileSync(
    join(root, 'scripts/compliance/company-trackers.pin.json'),
    `${JSON.stringify({ ...catalog, pin }, null, 2)}\n`
  );
  return pin;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--sync-catalog')
      throw new Error(
        'Usage: tracker-signature-scan.mjs [--sync-catalog <company-repo>]'
      );
    console.log(
      `tracker catalog synced: ${syncCatalog({ companyRoot: args[1] })}`
    );
    return;
  }
  const findings = scanRepo();
  for (const finding of findings) console.error(finding);
  console.log(`tracker-signature-scan: ${findings.length} unapproved`);
  if (findings.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
