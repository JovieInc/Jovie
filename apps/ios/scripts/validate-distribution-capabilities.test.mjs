import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compareEntitlementsToProfile,
  evaluateDistributionCapabilities,
  PASS_TYPE_ID,
  PROFILE_NAME,
  PUSH_ENTITLEMENT,
  parsePlist,
  TIM_PORTAL_STEP,
  WALLET_ENTITLEMENT,
} from './validate-distribution-capabilities.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

function copyFixtureRepo(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'distribution-capabilities-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const ios = path.join(root, 'apps/ios');
  mkdirSync(path.join(ios, 'Jovie.xcodeproj'), { recursive: true });
  mkdirSync(path.join(ios, 'Jovie'), { recursive: true });
  cpSync(
    path.join(repoRoot, 'apps/ios/Jovie.xcodeproj/project.pbxproj'),
    path.join(ios, 'Jovie.xcodeproj/project.pbxproj')
  );
  for (const file of [
    'Info.plist',
    'Jovie.entitlements',
    'JovieDistribution.entitlements',
    'JovieDistributionCapabilities.entitlements',
  ]) {
    cpSync(
      path.join(repoRoot, 'apps/ios/Jovie', file),
      path.join(ios, 'Jovie', file)
    );
  }
  return root;
}

function writeProfile(root, entitlements) {
  const profilePath = path.join(root, 'profile.plist');
  const keys = Object.entries(entitlements)
    .map(([key, value]) => {
      const body = Array.isArray(value)
        ? `<array>${value.map(item => `<string>${item}</string>`).join('')}</array>`
        : `<string>${value}</string>`;
      return `<key>${key}</key>${body}`;
    })
    .join('');
  writeFileSync(
    profilePath,
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Name</key><string>${PROFILE_NAME}</string>
<key>Entitlements</key><dict>${keys}</dict>
</dict></plist>`
  );
  return profilePath;
}

const capableProfile = {
  [PUSH_ENTITLEMENT]: 'production',
  [WALLET_ENTITLEMENT]: [`TEAMID1234.${PASS_TYPE_ID}`],
};

test('parses an empty distribution entitlements dict', () => {
  const parsed = parsePlist(
    readFileSync(
      path.join(repoRoot, 'apps/ios/Jovie/JovieDistribution.entitlements'),
      'utf8'
    )
  );
  assert.deepEqual(parsed, {});
});

test('current Release gate matches a profile without Push or Wallet', () => {
  const result = evaluateDistributionCapabilities({
    repoRoot,
    profilePath: writeProfile(mkdtempSync(path.join(tmpdir(), 'profile-ok-')), {
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    }),
  });
  assert.equal(result.ok, true, result.lines.join('\n'));
  assert.match(result.lines.join('\n'), /JOVIE_DISTRIBUTION_PUSH_WALLET=NO/);
  assert.match(
    result.lines.join('\n'),
    new RegExp(TIM_PORTAL_STEP.replace(/[.]/g, '\\.'))
  );
});

test('fails when Release entitlements still request Push and Wallet', t => {
  const root = copyFixtureRepo(t);
  cpSync(
    path.join(root, 'apps/ios/Jovie/Jovie.entitlements'),
    path.join(root, 'apps/ios/Jovie/JovieDistribution.entitlements')
  );
  const result = evaluateDistributionCapabilities({
    repoRoot: root,
    profilePath: writeProfile(root, {
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    }),
  });
  const output = result.lines.join('\n');
  assert.equal(result.ok, false);
  assert.match(output, /Capability mismatch/);
  assert.match(output, new RegExp(PUSH_ENTITLEMENT));
  assert.match(output, new RegExp(WALLET_ENTITLEMENT));
  assert.match(output, new RegExp(PASS_TYPE_ID));
  assert.match(output, /Push Notifications and Wallet/);
  assert.match(output, new RegExp(PROFILE_NAME));
  assert.match(
    output,
    /Tim must enable Push Notifications and Wallet on App ID ie\.jov\.Jovie/
  );
});

test('fails when the re-enabled Release entitlements exceed the profile', t => {
  const root = copyFixtureRepo(t);
  const projectPath = path.join(
    root,
    'apps/ios/Jovie.xcodeproj/project.pbxproj'
  );
  const project = readFileSync(projectPath, 'utf8')
    .replace(
      'CODE_SIGN_ENTITLEMENTS = Jovie/JovieDistribution.entitlements;',
      'CODE_SIGN_ENTITLEMENTS = Jovie/JovieDistributionCapabilities.entitlements;'
    )
    .replace(
      'JOVIE_DISTRIBUTION_PUSH_WALLET = NO;',
      'JOVIE_DISTRIBUTION_PUSH_WALLET = YES;'
    );
  writeFileSync(projectPath, project);
  const result = evaluateDistributionCapabilities({
    repoRoot: root,
    profilePath: writeProfile(root, {
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    }),
  });
  const output = result.lines.join('\n');
  assert.equal(result.ok, false);
  assert.match(
    output,
    /Capability mismatch: provisioning profile "match AppStore ie\.jov\.Jovie"/
  );
  assert.match(
    output,
    /Missing profile entitlements: aps-environment, com\.apple\.developer\.pass-type-identifiers/
  );
  assert.match(output, /does not support Pass Type ID pass\.ie\.jov\.profile/);
  assert.match(output, /lacks the Push Notifications capability/);
  assert.match(output, /lacks the Wallet capability/);
  assert.match(output, /Tim must enable Push Notifications and Wallet/);
});

test('accepts a profile that covers production Push and Wallet', t => {
  const root = copyFixtureRepo(t);
  const projectPath = path.join(
    root,
    'apps/ios/Jovie.xcodeproj/project.pbxproj'
  );
  writeFileSync(
    projectPath,
    readFileSync(projectPath, 'utf8')
      .replace(
        'CODE_SIGN_ENTITLEMENTS = Jovie/JovieDistribution.entitlements;',
        'CODE_SIGN_ENTITLEMENTS = Jovie/JovieDistributionCapabilities.entitlements;'
      )
      .replace(
        'JOVIE_DISTRIBUTION_PUSH_WALLET = NO;',
        'JOVIE_DISTRIBUTION_PUSH_WALLET = YES;'
      )
  );
  const result = evaluateDistributionCapabilities({
    repoRoot: root,
    profilePath: writeProfile(root, capableProfile),
  });
  assert.equal(result.ok, true, result.lines.join('\n'));
  assert.match(
    result.lines.join('\n'),
    /covers the Release Push and Wallet entitlements/
  );
});

test('rejects a development aps-environment against a production profile', () => {
  const compared = compareEntitlementsToProfile(
    {
      [PUSH_ENTITLEMENT]: 'development',
      [WALLET_ENTITLEMENT]: [`$(TeamIdentifierPrefix)${PASS_TYPE_ID}`],
    },
    {
      Name: PROFILE_NAME,
      Entitlements: capableProfile,
    }
  );
  assert.match(
    compared.problems.join('\n'),
    /aps-environment is "development"/
  );
});

test('beta lane runs the preflight after match and before gym', () => {
  const fastfile = readFileSync(
    path.join(repoRoot, 'fastlane/Fastfile'),
    'utf8'
  );
  const beta = fastfile.slice(fastfile.indexOf('lane :beta do'));
  const matchAt = beta.indexOf('match(');
  const preflightAt = beta.indexOf('validate-distribution-capabilities.sh');
  const gymAt = beta.indexOf('gym(');
  assert.ok(matchAt > 0 && preflightAt > matchAt && gymAt > preflightAt);
  assert.match(beta, /JOVIE_REQUIRE_DISTRIBUTION_PROFILE=1/);
});

test('cli fails closed when the required profile is not installed', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'empty-home-'));
  try {
    execFileSync(
      'bash',
      [
        'apps/ios/scripts/validate-distribution-capabilities.sh',
        '--require-profile',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HOME: home,
          JOVIE_REQUIRE_DISTRIBUTION_PROFILE: '1',
        },
      }
    );
    assert.fail('preflight exited 0 without a profile');
  } catch (error) {
    if (error && error.code === 'ERR_ASSERTION') throw error;
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    assert.match(output, /Capability mismatch/);
    assert.match(output, /not installed/);
    assert.match(output, /match AppStore ie\.jov\.Jovie/);
  }
});
