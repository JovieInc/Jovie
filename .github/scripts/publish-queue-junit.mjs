import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPaged } from './collect-quarantine-evidence.mjs';

const REPO = 'JovieInc/Jovie';
const CI = 178737329;
const positive = n => Number.isSafeInteger(n) && n > 0;
function fact(ok, message) {
  if (!ok) throw new Error(message);
}
export function junitFailureCount(xml) {
  fact(
    typeof xml === 'string' &&
      Buffer.byteLength(xml) <= 4 * 1024 * 1024 &&
      !/<!DOCTYPE|<!ENTITY/i.test(xml),
    'Unsafe or oversized JUnit'
  );
  const script = `import sys,xml.etree.ElementTree as ET\nr=ET.fromstring(sys.stdin.read())\nassert r.tag in ('testsuite','testsuites')\nt=list(r.iter('testcase'))\nassert 0 < len(t) <= 100000\nprint(sum(any(c.tag in ('failure','error','flakyFailure','rerunFailure') for c in x) for x in t))\n`;
  const count = Number(
    execFileSync('python3', ['-c', script], {
      input: xml,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 4096,
    })
  );
  fact(
    Number.isSafeInteger(count) && count >= 0,
    'Unknown JUnit failure count'
  );
  return count;
}
export function readQueueJUnit(
  artifact,
  download = id =>
    execFileSync('gh', ['api', `repos/${REPO}/actions/artifacts/${id}/zip`], {
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    })
) {
  const root = mkdtempSync(join(tmpdir(), 'queue-junit-'));
  try {
    const zip = join(root, 'artifact.zip');
    writeFileSync(zip, download(artifact.id));
    const names = execFileSync('unzip', ['-Z1', zip], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 4096,
    })
      .trim()
      .split('\n');
    fact(
      names.length > 0 &&
        names.length <= 16 &&
        new Set(names).size === names.length &&
        names.every(name =>
          /^test-report\.[A-Za-z0-9.-]+\.junit\.xml$/.test(name)
        ),
      'Unsafe JUnit archive roster'
    );
    return names.map(name =>
      execFileSync('unzip', ['-p', zip, name], {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      })
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
/** @param {object} input
 * @param {any} input.event
 * @param {(path:string)=>any} input.api
 * @param {(artifact:any)=>string[]} [input.readArtifact]
 * @param {string} input.outputRoot
 */
export function prepareQueueJUnit({
  event,
  api,
  readArtifact = readQueueJUnit,
  outputRoot,
}) {
  const expected = event?.workflow_run;
  fact(
    event?.repository?.full_name === REPO &&
      positive(expected?.id) &&
      positive(expected.run_attempt) &&
      expected.workflow_id === CI &&
      /^[a-f0-9]{40}$/.test(expected.head_sha),
    'Unbound JUnit controller event'
  );
  const run = api(`repos/${REPO}/actions/runs/${expected.id}`);
  fact(
    run.id === expected.id &&
      run.run_attempt === expected.run_attempt &&
      run.workflow_id === CI &&
      run.path === '.github/workflows/ci.yml' &&
      run.head_sha === expected.head_sha &&
      run.repository?.full_name === REPO &&
      run.head_repository?.full_name === REPO &&
      run.event === 'merge_group' &&
      run.status === 'completed' &&
      ['success', 'failure'].includes(run.conclusion) &&
      /^gh-readonly-queue\/main\/[A-Za-z0-9._/-]+$/.test(run.head_branch),
    'Untrusted completed merge-group JUnit run'
  );
  const artifacts = collectPaged(
    `repos/${REPO}/actions/runs/${run.id}/artifacts`,
    'artifacts',
    api
  ).filter(artifact =>
    new RegExp(`^unit-test-failure-${run.id}-${run.run_attempt}-\\d+$`).test(
      artifact.name
    )
  );
  fact(
    artifacts.length <= 16 &&
      new Set(artifacts.map(a => a.name)).size === artifacts.length,
    'Ambiguous JUnit artifacts'
  );
  const reports = [];
  let failures = 0,
    reportBytes = 0;
  for (const artifact of artifacts) {
    fact(
      positive(artifact.id) &&
        artifact.expired === false &&
        artifact.workflow_run?.id === run.id &&
        artifact.workflow_run?.head_sha === run.head_sha,
      'Unbound JUnit artifact'
    );
    const xmls = readArtifact(artifact);
    fact(
      Array.isArray(xmls) && xmls.length > 0 && xmls.length <= 16,
      'Missing JUnit reports'
    );
    for (const xml of xmls) {
      reportBytes += Buffer.byteLength(xml);
      fact(reportBytes <= 64 * 1024 * 1024, 'JUnit report set exceeds bound');
      failures += junitFailureCount(xml);
      reports.push(xml);
    }
  }
  const current = api(`repos/${REPO}/actions/runs/${run.id}`);
  fact(
    current.head_sha === run.head_sha &&
      current.run_attempt === run.run_attempt &&
      current.status === 'completed' &&
      current.conclusion === run.conclusion,
    'JUnit producer attempt changed'
  );
  if (!failures) return { upload: false, headSha: run.head_sha, files: [] };
  mkdirSync(outputRoot, { recursive: false });
  const files = reports.map((xml, index) => {
    const file = join(outputRoot, `report-${index}.junit.xml`);
    writeFileSync(file, xml, { flag: 'wx' });
    return file;
  });
  return {
    upload: true,
    headSha: run.head_sha,
    branch: run.head_branch,
    runId: run.id,
    failures,
    files,
  };
}
export function main() {
  fact(
    process.env.QUARANTINE_AUTO_HEAL_ENABLED === 'true' &&
      process.env.GITHUB_EVENT_NAME === 'workflow_run',
    'JUnit publication is disabled'
  );
  const api = path =>
    JSON.parse(
      execFileSync('gh', ['api', path], {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
      })
    );
  const result = prepareQueueJUnit({
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    api,
    outputRoot: resolve('queue-junit'),
  });
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `upload=${result.upload}\nhead_sha=${result.headSha}\nfiles=${result.files.join(',')}\nbranch=${result.branch ?? ''}\nrun_id=${result.runId ?? ''}\n`
    );
  console.log(JSON.stringify({ ...result, files: result.files.length }));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
