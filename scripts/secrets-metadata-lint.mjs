#!/usr/bin/env node
/**
 * Metadata-only secrets lint. Prints rule/subject/message, never a value.
 *
 *   node scripts/secrets-metadata-lint.mjs            # live: vercel, gh, doppler CLIs
 *   node scripts/secrets-metadata-lint.mjs --fixture f.json
 *
 * Exit 1 only for ERROR findings (a NEW NEXT_PUBLIC_* stored as a Secret).
 * Everything else is a warning until the owner approves the cleanup (JOV-7998).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  lintGithubEnvironment,
  lintTokenAges,
  lintVercelEnv,
  summarize,
} from './lib/secrets-metadata-lint.mjs';

const baseline = JSON.parse(
  readFileSync(
    new URL('../ops/registry/secrets-lint-baseline.json', import.meta.url),
    'utf8'
  )
);
const manifest = JSON.parse(
  readFileSync(
    new URL('../.github/production-environment-secrets.json', import.meta.url),
    'utf8'
  )
);

function cli(cmd, args) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function collectLive() {
  const data = { vercel: {}, githubEnv: null, dopplerTokens: [] };
  for (const project of baseline.vercelProjects) {
    try {
      const raw = JSON.parse(
        cli('vercel', [
          'api',
          `/v10/projects/${project}/env?teamId=jovie`,
          '--scope',
          'jovie',
        ])
      );
      // Reduce to metadata before it leaves this block: values are dropped here.
      data.vercel[project] = raw.envs.map(e => ({
        key: e.key,
        type: e.type,
        target: e.target,
      }));
    } catch {
      data.vercel[project] = null;
    }
  }
  try {
    const name = encodeURIComponent(manifest.environment);
    const policy = JSON.parse(
      cli('gh', ['api', `repos/JovieInc/Jovie/environments/${name}`])
    );
    const names = cli('gh', [
      'api',
      '--paginate',
      `repos/JovieInc/Jovie/environments/${name}/secrets`,
      '--jq',
      '.secrets[].name',
    ])
      .split('\n')
      .filter(Boolean);
    data.githubEnv = {
      environment: manifest.environment,
      secretNames: names,
      manifestNames: manifest.secrets,
      hasBranchPolicy: Boolean(policy.deployment_branch_policy),
    };
  } catch {
    data.githubEnv = null;
  }
  try {
    const tokens = JSON.parse(
      cli('doppler', [
        'configs',
        'tokens',
        '-p',
        'jovie-web',
        '-c',
        'prd',
        '--json',
      ])
    );
    data.dopplerTokens = (tokens ?? []).map(t => ({
      name: t.name,
      createdAt: t.created_at,
      expiresAt: t.expires_at ?? null,
    }));
  } catch {
    data.dopplerTokens = null;
  }
  return data;
}

const fixtureIdx = process.argv.indexOf('--fixture');
const data =
  fixtureIdx > -1
    ? JSON.parse(readFileSync(process.argv[fixtureIdx + 1], 'utf8'))
    : collectLive();

const findings = [];
for (const [project, records] of Object.entries(data.vercel)) {
  if (records === null) {
    console.log(`UNREADABLE vercel:${project}`);
    continue;
  }
  findings.push(
    ...lintVercelEnv(records, {
      project,
      baselinePublicSecretKeys: baseline.publicSecretKeys[project] ?? [],
    })
  );
}
if (data.githubEnv) findings.push(...lintGithubEnvironment(data.githubEnv));
else console.log('UNREADABLE github-environment');
if (data.dopplerTokens) {
  findings.push(
    ...lintTokenAges(data.dopplerTokens, {
      nowMs: Date.now(),
      subjectPrefix: 'doppler-token',
    })
  );
} else console.log('UNREADABLE doppler-tokens');

for (const f of findings)
  console.log(
    `${f.severity.toUpperCase()} ${f.rule} ${f.subject}: ${f.message}`
  );
const { errors, warnings } = summarize(findings);
console.log(
  `secrets-metadata-lint: ${errors} error(s), ${warnings} warning(s)`
);
process.exit(errors > 0 ? 1 : 0);
