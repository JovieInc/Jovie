import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.mdx',
  '.toml',
  '.sh',
  '.txt',
  '.example',
  '.env',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  '.turbo',
  '.vercel',
  'build',
  'Pods',
  'DerivedData',
]);
const SKIP_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json']);
const PER_DEPLOY_URL =
  /https:\/\/(?:jovie-eve-shadow|summer-operations)-[a-z0-9]+-jovie\.vercel\.app/giu;
const LONG_DEPLOYMENT_ID = /dpl_[A-Za-z0-9]{20,}/gu;
const SUMMER_TIED =
  /summer\.jov\.ie|OVIE_SUMMER_EVE_|jovie-eve-shadow|company\.summer/u;
const HISTORICAL = 'summer-pin-historical';

function isTextFile(name) {
  if (name.startsWith('.env')) return true;
  const dot = name.lastIndexOf('.');
  return dot > 0 && TEXT_EXTENSIONS.has(name.slice(dot));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, out);
      continue;
    }
    if (
      !entry.isFile() ||
      SKIP_FILES.has(entry.name) ||
      !isTextFile(entry.name)
    )
      continue;
    if (statSync(path).size > 8_000_000) continue;
    out.push(path);
  }
}

export function findSummerDeploymentPins(root) {
  const files = [];
  walk(root, files);
  const findings = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const summerTied = SUMMER_TIED.test(text);
    const lines = text.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (line.includes(HISTORICAL)) return;
      PER_DEPLOY_URL.lastIndex = 0;
      const url = PER_DEPLOY_URL.exec(line);
      if (url) {
        findings.push({
          file: relative(root, path),
          line: index + 1,
          match: url[0],
          reason: 'per-deployment Summer URL',
        });
      }
      if (!summerTied) return;
      LONG_DEPLOYMENT_ID.lastIndex = 0;
      const deploymentId = LONG_DEPLOYMENT_ID.exec(line);
      if (deploymentId) {
        findings.push({
          file: relative(root, path),
          line: index + 1,
          match: deploymentId[0],
          reason: 'Summer deployment id literal',
        });
      }
    });
  }
  return findings;
}

export function formatSummerDeploymentPins(findings) {
  const details = findings
    .map(
      finding =>
        `${finding.file}:${finding.line} ${finding.reason}: ${finding.match}`
    )
    .join('\n');
  return `Summer must be referenced as https://summer.jov.ie plus a source-bound identity check, never a deployment id or per-deployment URL.\n${details}`;
}

function main() {
  const root = process.argv[2] ?? process.cwd();
  const findings = findSummerDeploymentPins(root);
  if (findings.length === 0) {
    console.log('summer-deployment-pin-guard: no Summer deployment pins');
    return;
  }
  console.error(formatSummerDeploymentPins(findings));
  process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) main();
