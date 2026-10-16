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
  PROVISIONING_PROFILE_DIRECTORY_SUFFIXES,
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

const INSTALLED_PROFILE_UUID = '20b14884-21a9-40aa-baee-72a2c9ee3abb';

function entitlementXml(entitlements) {
  return Object.entries(entitlements)
    .map(([key, value]) => {
      const body = Array.isArray(value)
        ? `<array>${value.map(item => `<string>${item}</string>`).join('')}</array>`
        : `<string>${value}</string>`;
      return `<key>${key}</key>${body}`;
    })
    .join('');
}

function installedProfileXml(entitlements) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
<key>AppIDName</key><string>Jovie</string>
<key>CreationDate</key><date>2026-10-16T19:10:56Z</date>
<key>DeveloperCertificates</key>
<array>
<data>
MIIB
</data>
</array>
<key>Entitlements</key><dict>${entitlementXml(entitlements)}</dict>
<key>ExpirationDate</key><date>2027-10-16T19:10:56Z</date>
<key>Name</key><string>${PROFILE_NAME}</string>
<key>UUID</key><string>${INSTALLED_PROFILE_UUID}</string>
<key>Version</key><integer>1</integer>
</dict>
</plist>`;
}

function installProfile(t, directorySuffix, entitlements) {
  const home = mkdtempSync(path.join(tmpdir(), 'profile-home-'));
  t.after(() => {
    rmSync(home, { recursive: true, force: true });
  });
  const directory = path.join(home, directorySuffix);
  mkdirSync(directory, { recursive: true });
  const profilePath = path.join(
    directory,
    `${INSTALLED_PROFILE_UUID}.mobileprovision`
  );
  writeFileSync(profilePath, installedProfileXml(entitlements));
  return { home, profilePath };
}

function enableReleaseCapabilities(root) {
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
}

test('parses a decoded profile that carries date and certificate data', () => {
  const parsed = parsePlist(
    installedProfileXml({
      [PUSH_ENTITLEMENT]: 'production',
      [WALLET_ENTITLEMENT]: [`TEAMID1234.${PASS_TYPE_ID}`],
    })
  );
  assert.equal(parsed.Name, PROFILE_NAME);
  assert.equal(parsed.CreationDate, '2026-10-16T19:10:56Z');
  assert.equal(parsed.Version, 1);
  assert.equal(parsed.Entitlements[PUSH_ENTITLEMENT], 'production');
  assert.deepEqual(parsed.DeveloperCertificates, ['MIIB']);
});

test('finds the match-installed profile in both provisioning directories', t => {
  for (const directorySuffix of PROVISIONING_PROFILE_DIRECTORY_SUFFIXES) {
    const { home } = installProfile(t, directorySuffix, {
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    });
    const result = evaluateDistributionCapabilities({
      repoRoot,
      home,
      requireProfile: true,
      env: {},
    });
    const output = result.lines.join('\n');
    assert.equal(result.ok, true, `${directorySuffix}\n${output}`);
    assert.match(output, new RegExp(PROFILE_NAME.replace(/[.]/g, '\\.')));
    assert.match(output, /does not include Push Notifications or Wallet/);
  }
});

test('uses the sigh profile path match exports', t => {
  const home = mkdtempSync(path.join(tmpdir(), 'empty-sigh-home-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'sigh-profile-'));
  t.after(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const profilePath = path.join(
    outside,
    `${INSTALLED_PROFILE_UUID}.mobileprovision`
  );
  writeFileSync(
    profilePath,
    installedProfileXml({
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    })
  );
  const result = evaluateDistributionCapabilities({
    repoRoot,
    home,
    requireProfile: true,
    env: {
      'sigh_ie.jov.Jovie_appstore': INSTALLED_PROFILE_UUID,
      'sigh_ie.jov.Jovie_appstore_profile-name': PROFILE_NAME,
      'sigh_ie.jov.Jovie_appstore_profile-path': profilePath,
    },
  });
  assert.equal(result.ok, true, result.lines.join('\n'));
  assert.match(
    result.lines.join('\n'),
    /does not include Push Notifications or Wallet/
  );
});

test('finds the match UUID in the legacy provisioning directory', t => {
  const { home } = installProfile(
    t,
    PROVISIONING_PROFILE_DIRECTORY_SUFFIXES[1],
    {
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    }
  );
  const result = evaluateDistributionCapabilities({
    repoRoot,
    home,
    requireProfile: true,
    env: {
      'sigh_ie.jov.Jovie_appstore': INSTALLED_PROFILE_UUID,
    },
  });
  assert.equal(result.ok, true, result.lines.join('\n'));
});

test('an installed profile still fails a real entitlement mismatch', t => {
  const root = copyFixtureRepo(t);
  enableReleaseCapabilities(root);
  const { home } = installProfile(
    t,
    PROVISIONING_PROFILE_DIRECTORY_SUFFIXES[0],
    {
      'application-identifier': 'TEAMID1234.ie.jov.Jovie',
    }
  );
  const result = evaluateDistributionCapabilities({
    repoRoot: root,
    home,
    requireProfile: true,
    env: {},
  });
  const output = result.lines.join('\n');
  assert.equal(result.ok, false);
  assert.match(output, /cannot sign the Release entitlements/);
  assert.match(output, /lacks the Push Notifications capability/);
  assert.match(output, /lacks the Wallet capability/);
  assert.match(output, /does not support Pass Type ID pass\.ie\.jov\.profile/);
  assert.match(output, /Tim must enable Push Notifications and Wallet/);
  assert.doesNotMatch(output, /not installed/);
  assert.doesNotMatch(output, /could not be decoded/);
});

test('fails loudly when an installed profile cannot be decoded', t => {
  const home = mkdtempSync(path.join(tmpdir(), 'undecodable-home-'));
  t.after(() => {
    rmSync(home, { recursive: true, force: true });
  });
  const directory = path.join(home, PROVISIONING_PROFILE_DIRECTORY_SUFFIXES[0]);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, `${INSTALLED_PROFILE_UUID}.mobileprovision`),
    Buffer.from([0x30, 0x82, 0x01, 0x00])
  );
  const result = evaluateDistributionCapabilities({
    repoRoot,
    home,
    requireProfile: true,
    env: {},
  });
  const output = result.lines.join('\n');
  assert.equal(result.ok, false);
  assert.match(output, /installed but could not be decoded/);
  assert.match(output, new RegExp(INSTALLED_PROFILE_UUID));
  assert.doesNotMatch(output, /not installed/);
});

test('cli fails closed when the required profile is not installed', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'empty-home-'));
  const env = {
    ...process.env,
    HOME: home,
    JOVIE_REQUIRE_DISTRIBUTION_PROFILE: '1',
  };
  delete env.JOVIE_PROVISIONING_PROFILE;
  for (const key of Object.keys(env)) {
    if (key.startsWith('sigh_')) delete env[key];
  }
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
        env,
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
