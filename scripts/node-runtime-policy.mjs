#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, '..');
const DAY_MS = 24 * 60 * 60 * 1000;
export function parseVersion(version) {
  const match = String(version)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid Node version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    version: `${match[1]}.${match[2]}.${match[3]}`,
  };
}
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
export function getReleaseStatus(scheduleEntry, now = new Date()) {
  const timestamp = now.getTime();
  const boundary = name => {
    const value = scheduleEntry?.[name];
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00Z`).getTime();
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid schedule boundary ${name}: ${value}`);
    }
    return parsed;
  };
  const start = boundary('start');
  const lts = boundary('lts');
  const maintenance = boundary('maintenance');
  const end = boundary('end');
  if (start !== null && timestamp < start) return 'planned';
  if (end !== null && timestamp >= end) return 'end_of_life';
  if (maintenance !== null && timestamp >= maintenance) {
    return 'maintenance_lts';
  }
  if (lts !== null && timestamp >= lts) return 'active_lts';
  return 'current';
}
export function latestReleaseForMajor(index, major) {
  const releases = index
    .filter(release => parseVersion(release.version).major === major)
    .sort((a, b) => compareVersions(b.version, a.version));
  if (releases.length === 0) {
    throw new Error(`Node ${major} is missing from the official release index`);
  }
  return releases[0];
}
function engineAllowsMajor(engine, major) {
  const alternatives = engine.split('||').map(value => value.trim());
  return alternatives.some(alternative => {
    if (/^\d+$/.test(alternative)) return Number(alternative) === major;
    const exactMajor = alternative.match(/^(?:\^|~)?(\d+)(?:\.x)?$/);
    if (exactMajor) return Number(exactMajor[1]) === major;
    const lower = alternative.match(/>=\s*(\d+)/);
    const upper = alternative.match(/<\s*(\d+)/);
    if (lower && major < Number(lower[1])) return false;
    if (upper && major >= Number(upper[1])) return false;
    return Boolean(lower || upper);
  });
}
export function validateRepositoryPolicy(policy, repoRoot = defaultRepoRoot) {
  const errors = [];
  const productionVersion = readFileSync(
    resolve(repoRoot, policy.production.versionFile),
    'utf8'
  ).trim();
  const mirrorVersion = readFileSync(
    resolve(repoRoot, policy.production.mirrorVersionFile),
    'utf8'
  ).trim();
  const parsed = parseVersion(productionVersion);
  const expectedPinnedEngine = `>=${productionVersion} <${parsed.major + 1}`;
  const expectedMinimumEngine = `>=${productionVersion}`;
  if (mirrorVersion !== productionVersion) {
    errors.push(
      `${policy.production.mirrorVersionFile} must match ${policy.production.versionFile}`
    );
  }
  for (const packagePath of policy.packageEngineContracts.majorPinned) {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, packagePath))
    );
    if (packageJson.engines?.node !== expectedPinnedEngine) {
      errors.push(
        `${packagePath} engines.node must be ${JSON.stringify(expectedPinnedEngine)}`
      );
    }
  }
  for (const packagePath of policy.packageEngineContracts.minimumOnly) {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, packagePath))
    );
    if (packageJson.engines?.node !== expectedMinimumEngine) {
      errors.push(
        `${packagePath} engines.node must be ${JSON.stringify(expectedMinimumEngine)}`
      );
    }
  }
  const candidateMajors = policy.compatibility.candidates.map(
    item => item.major
  );
  if (new Set(candidateMajors).size !== candidateMajors.length) {
    errors.push('Compatibility candidate majors must be unique');
  }
  if (candidateMajors.some(major => major <= parsed.major)) {
    errors.push('Compatibility candidates must be newer than production');
  }
  const blockingCandidates = policy.compatibility.candidates.filter(
    item => item.blocking
  );
  if (
    blockingCandidates.length !== 1 ||
    blockingCandidates[0].ring !== 'candidate'
  ) {
    errors.push('Exactly one candidate ring must be blocking');
  }
  if (policy.promotion.minimumConsecutiveGreenRuns < 2) {
    errors.push('Promotion requires at least two consecutive green runs');
  }
  if (policy.rollback.maximumMinutes > 30) {
    errors.push('Rollback must remain bounded to 30 minutes or less');
  }
  return { errors, productionVersion };
}
export function evaluateOfficialReleases({ policy, schedule, index, now }) {
  const errors = [];
  const productionVersion = policy.productionVersion;
  const productionMajor = parseVersion(productionVersion).major;
  const productionSchedule = schedule[`v${productionMajor}`];
  if (!productionSchedule) {
    errors.push(
      `Node ${productionMajor} is missing from the official schedule`
    );
  }
  const productionStatus = getReleaseStatus(productionSchedule, now);
  if (!policy.production.allowedStatuses.includes(productionStatus)) {
    errors.push(
      `Production Node ${productionMajor} is ${productionStatus}, not an allowed LTS status`
    );
  }
  const latestProduction = latestReleaseForMajor(index, productionMajor);
  const normalizedProduction = parseVersion(productionVersion).version;
  if (
    !index.some(
      release => parseVersion(release.version).version === normalizedProduction
    )
  ) {
    errors.push(
      `Production ${productionVersion} is missing from the official release index`
    );
  }
  const overdueSecurityRelease = index
    .filter(
      release =>
        parseVersion(release.version).major === productionMajor &&
        release.security === true &&
        compareVersions(productionVersion, release.version) < 0
    )
    .sort((a, b) => compareVersions(b.version, a.version))
    .find(
      release =>
        now.getTime() - new Date(`${release.date}T00:00:00Z`).getTime() >
        policy.production.securityPatchSlaHours * 60 * 60 * 1000
    );
  if (overdueSecurityRelease) {
    errors.push(
      `Production ${productionVersion} trails ${overdueSecurityRelease.version} beyond the security patch SLA`
    );
  }
  const patchLagMs =
    now.getTime() - new Date(`${latestProduction.date}T00:00:00Z`).getTime();
  if (
    !overdueSecurityRelease &&
    compareVersions(productionVersion, latestProduction.version) < 0 &&
    patchLagMs > policy.production.regularPatchSlaDays * DAY_MS
  ) {
    errors.push(
      `Production ${productionVersion} trails ${latestProduction.version} beyond the regular patch SLA`
    );
  }
  const matrix = policy.compatibility.candidates.map(candidate => {
    const latest = latestReleaseForMajor(index, candidate.major);
    const status = getReleaseStatus(schedule[`v${candidate.major}`], now);
    return {
      major: candidate.major,
      version: parseVersion(latest.version).version,
      ring: candidate.ring,
      blocking: candidate.blocking,
      status,
      minimumPromotionStatus: candidate.minimumPromotionStatus,
    };
  });
  return {
    errors,
    matrix,
    production: {
      version: productionVersion,
      latest: parseVersion(latestProduction.version).version,
      status: productionStatus,
    },
  };
}
export function isPromotionReady(policy, candidate, greenRuns, soakDays) {
  const statuses = ['planned', 'current', 'active_lts', 'maintenance_lts'];
  const minimumStatus = policy.compatibility.candidates.find(
    item => item.major === candidate.major
  )?.minimumPromotionStatus;
  const requiredRank = statuses.indexOf(minimumStatus);
  const actualRank = statuses.indexOf(candidate.status);
  return (
    requiredRank >= 0 &&
    actualRank >= requiredRank &&
    greenRuns >= policy.promotion.minimumConsecutiveGreenRuns &&
    soakDays >= policy.promotion.minimumSoakDays
  );
}
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'jovie-node-runtime-policy/1' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}
function loadPolicy(repoRoot) {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'config/node-runtime-policy.json'), 'utf8')
  );
}
async function writeGithubOutput(entries) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(entries)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  );
}
function findPackageJson(packageName, workspace) {
  const requireFromWorkspace = createRequire(
    resolve(workspace, 'package.json')
  );
  let current = dirname(requireFromWorkspace.resolve(packageName));
  while (current !== dirname(current)) {
    const candidate = resolve(current, 'package.json');
    try {
      const packageJson = JSON.parse(readFileSync(candidate, 'utf8'));
      if (packageJson.name === packageName)
        return { packageJson, requireFromWorkspace };
    } catch {}
    current = dirname(current);
  }
  throw new Error(`Unable to locate package.json for ${packageName}`);
}
async function runRuntimeSmoke(policy, repoRoot) {
  const currentMajor = parseVersion(process.version).major;
  for (const probe of policy.compatibility.declaredEngineProbes) {
    const workspace = resolve(repoRoot, probe.workspace);
    const { packageJson } = findPackageJson(probe.package, workspace);
    const engine = packageJson.engines?.node;
    if (engine && !engineAllowsMajor(engine, currentMajor)) {
      throw new Error(
        `${probe.package}@${packageJson.version} declares Node ${engine}; Node ${currentMajor} is unsupported`
      );
    }
  }
  for (const probe of policy.compatibility.nativeProbes) {
    const workspace = resolve(repoRoot, probe.workspace);
    const { requireFromWorkspace } = findPackageJson(probe.package, workspace);
    if (probe.package === 'sharp') {
      const sharp = requireFromWorkspace('sharp');
      const result = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      if (result.length === 0) throw new Error('sharp returned an empty image');
    } else {
      requireFromWorkspace(probe.package);
    }
  }
  process.stdout.write(`Node ${process.version} runtime probes passed\n`);
}
async function main() {
  const command = process.argv[2] ?? 'validate';
  const repoRoot = process.env.NODE_RUNTIME_REPO_ROOT ?? defaultRepoRoot;
  const policy = loadPolicy(repoRoot);
  const repository = validateRepositoryPolicy(policy, repoRoot);
  if (command === 'validate') {
    if (repository.errors.length) throw new Error(repository.errors.join('\n'));
    process.stdout.write(
      `Node runtime policy valid; production=${repository.productionVersion}\n`
    );
    return;
  }
  if (command === 'runtime-smoke') {
    if (repository.errors.length) throw new Error(repository.errors.join('\n'));
    await runRuntimeSmoke(policy, repoRoot);
    return;
  }
  if (command === 'resolve') {
    if (repository.errors.length) throw new Error(repository.errors.join('\n'));
    const schedule = await fetchJson(policy.sources.releaseSchedule);
    const index = await fetchJson(policy.sources.releaseIndex);
    const result = evaluateOfficialReleases({
      policy: { ...policy, productionVersion: repository.productionVersion },
      schedule,
      index,
      now: new Date(),
    });
    await writeGithubOutput({
      matrix: JSON.stringify({ include: result.matrix }),
      production: JSON.stringify(result.production),
      candidate_major: String(
        result.matrix.find(candidate => candidate.blocking)?.major ?? ''
      ),
      candidate_status:
        result.matrix.find(candidate => candidate.blocking)?.status ?? '',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    return;
  }
  if (command === 'promotion-ready') {
    const candidate = {
      major: Number(process.env.CANDIDATE_MAJOR),
      status: process.env.CANDIDATE_STATUS,
    };
    const ready = isPromotionReady(
      policy,
      candidate,
      Number(process.env.GREEN_RUNS),
      Number(process.env.SOAK_DAYS)
    );
    process.stdout.write(`${ready}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
