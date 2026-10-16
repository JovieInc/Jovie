#!/usr/bin/env node
/**
 * Compare the iOS Release entitlements with the match AppStore profile
 * before gym. A capability the entitlements request and the profile lacks
 * fails here, with the portal step required to sign Push and Wallet.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ID = 'ie.jov.Jovie';
export const PROFILE_NAME = 'match AppStore ie.jov.Jovie';
export const PASS_TYPE_ID = 'pass.ie.jov.profile';
export const PUSH_ENTITLEMENT = 'aps-environment';
export const WALLET_ENTITLEMENT = 'com.apple.developer.pass-type-identifiers';
export const DISTRIBUTION_ENTITLEMENTS = 'Jovie/JovieDistribution.entitlements';
export const CAPABILITY_ENTITLEMENTS =
  'Jovie/JovieDistributionCapabilities.entitlements';
export const DEBUG_ENTITLEMENTS = 'Jovie/Jovie.entitlements';
export const TIM_PORTAL_STEP =
  'Tim must enable Push Notifications and Wallet on App ID ie.jov.Jovie, associate Pass Type ID pass.ie.jov.profile, and regenerate the match AppStore profile.';

const PROFILE_DIRECTORY = path.join(
  process.env.HOME ?? '',
  'Library/Developer/Xcode/UserData/Provisioning Profiles'
);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, '../../..');

function skipWhitespaceAndComments(source, index) {
  let cursor = index;
  for (;;) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (!source.startsWith('<!--', cursor)) return cursor;
    const end = source.indexOf('-->', cursor + 4);
    if (end < 0) throw new Error('Unclosed plist comment');
    cursor = end + 3;
  }
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/**
 * Parse the small plist subset used by entitlements and decoded profiles.
 * @param {string} xml
 */
export function parsePlist(xml) {
  const source = xml.replace(/^\uFEFF/, '');
  let index = source.indexOf('<plist');
  if (index < 0) throw new Error('Plist is missing a plist root');
  index = source.indexOf('>', index) + 1;

  function parseValue() {
    index = skipWhitespaceAndComments(source, index);
    if (source.startsWith('<dict', index)) return parseDict();
    if (source.startsWith('<array', index)) return parseArray();
    if (source.startsWith('<string', index)) return parseString();
    if (source.startsWith('<true', index)) {
      index = source.indexOf('>', index) + 1;
      return true;
    }
    if (source.startsWith('<false', index)) {
      index = source.indexOf('>', index) + 1;
      return false;
    }
    if (source.startsWith('<integer>', index)) {
      const end = source.indexOf('</integer>', index);
      const value = Number(source.slice(index + '<integer>'.length, end));
      index = end + '</integer>'.length;
      return value;
    }
    throw new Error(
      `Unsupported plist value near ${JSON.stringify(source.slice(index, index + 48))}`
    );
  }

  function parseString() {
    const open = source.indexOf('>', index);
    const close = source.indexOf('</string>', open + 1);
    if (open < 0 || close < 0) throw new Error('Unclosed plist string');
    const value = decodeXml(source.slice(open + 1, close));
    index = close + '</string>'.length;
    return value;
  }

  function parseDict() {
    if (source.startsWith('<dict/>', index) || source.startsWith('<dict />', index)) {
      index = source.indexOf('>', index) + 1;
      return {};
    }
    index += '<dict>'.length;
    /** @type {Record<string, unknown>} */
    const result = {};
    for (;;) {
      index = skipWhitespaceAndComments(source, index);
      if (source.startsWith('</dict>', index)) {
        index += '</dict>'.length;
        return result;
      }
      if (!source.startsWith('<key>', index)) {
        throw new Error('Expected plist key');
      }
      const keyEnd = source.indexOf('</key>', index + 5);
      const key = source.slice(index + '<key>'.length, keyEnd);
      index = keyEnd + '</key>'.length;
      result[key] = parseValue();
    }
  }

  function parseArray() {
    if (source.startsWith('<array/>', index) || source.startsWith('<array />', index)) {
      index = source.indexOf('>', index) + 1;
      return [];
    }
    index += '<array>'.length;
    const result = [];
    for (;;) {
      index = skipWhitespaceAndComments(source, index);
      if (source.startsWith('</array>', index)) {
        index += '</array>'.length;
        return result;
      }
      result.push(parseValue());
    }
  }

  return parseValue();
}

export function readPlist(filePath) {
  if (filePath.endsWith('.mobileprovision')) {
    const decoded = execFileSync('security', ['cms', '-D', '-i', filePath], {
      encoding: 'utf8',
    });
    return parsePlist(decoded);
  }
  const text = readFileSync(filePath, 'utf8');
  if (text.trimStart().startsWith('{')) return JSON.parse(text);
  return parsePlist(text);
}

/**
 * @param {string} pbxproj
 * @param {'Debug' | 'Release'} configurationName
 */
export function readAppBuildSettings(pbxproj, configurationName) {
  const blocks = pbxproj.split('isa = XCBuildConfiguration;');
  for (const block of blocks.slice(1)) {
    const name = block.match(/\bname = ([^;]+);/)?.[1]?.trim();
    if (name !== configurationName) continue;
    const settings = block;
    if (!settings.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${APP_ID};`)) continue;
    const read = (key) => {
      const match = settings.match(new RegExp(`${key} = "?([^";]+)"?;`));
      return match ? match[1].trim() : null;
    };
    return {
      entitlements: read('CODE_SIGN_ENTITLEMENTS'),
      pushWallet: read('JOVIE_DISTRIBUTION_PUSH_WALLET'),
    };
  }
  throw new Error(
    `Missing ${configurationName} build settings for ${APP_ID}`
  );
}

export function normalizePassType(value) {
  return String(value)
    .replaceAll('$(TeamIdentifierPrefix)', '')
    .replace(/^[A-Z0-9]{10}\./, '');
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

function entitlementKeys(entitlements) {
  return Object.keys(entitlements ?? {});
}

/**
 * @param {Record<string, unknown>} appEntitlements
 * @param {Record<string, unknown>} profile
 */
export function compareEntitlementsToProfile(appEntitlements, profile) {
  const profileEntitlements = /** @type {Record<string, unknown>} */ (
    profile.Entitlements ?? {}
  );
  const missing = [];
  const problems = [];

  if (Object.hasOwn(appEntitlements, PUSH_ENTITLEMENT)) {
    if (!Object.hasOwn(profileEntitlements, PUSH_ENTITLEMENT)) {
      missing.push(PUSH_ENTITLEMENT);
      problems.push(
        'Provisioning profile lacks the Push Notifications capability (aps-environment).'
      );
    } else if (
      profileEntitlements[PUSH_ENTITLEMENT] !== appEntitlements[PUSH_ENTITLEMENT]
    ) {
      problems.push(
        `aps-environment is "${appEntitlements[PUSH_ENTITLEMENT]}" but profile "${profile.Name ?? PROFILE_NAME}" allows "${profileEntitlements[PUSH_ENTITLEMENT]}".`
      );
    }
  }

  if (Object.hasOwn(appEntitlements, WALLET_ENTITLEMENT)) {
    const requested = asList(appEntitlements[WALLET_ENTITLEMENT]).map(
      normalizePassType
    );
    if (!Object.hasOwn(profileEntitlements, WALLET_ENTITLEMENT)) {
      missing.push(WALLET_ENTITLEMENT);
      problems.push('Provisioning profile lacks the Wallet capability.');
    }
    const allowed = asList(profileEntitlements[WALLET_ENTITLEMENT] ?? []).map(
      normalizePassType
    );
    const unsupported = requested.filter(
      (id) =>
        !allowed.some(
          (candidate) =>
            candidate === id || candidate === '*' || candidate.endsWith('.*')
        )
    );
    if (unsupported.length > 0) {
      problems.push(
        `Provisioning profile does not support Pass Type ID ${unsupported.join(', ')}.`
      );
    }
  }

  return { missing, problems };
}

function profileHasPushAndWallet(profile) {
  const entitlements = /** @type {Record<string, unknown>} */ (
    profile?.Entitlements ?? {}
  );
  const passTypes = asList(entitlements[WALLET_ENTITLEMENT]).map(normalizePassType);
  return (
    Object.hasOwn(entitlements, PUSH_ENTITLEMENT) &&
    passTypes.includes(PASS_TYPE_ID)
  );
}

function findProfiles(directory, name) {
  if (!existsSync(directory)) return [];
  const matches = [];
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.mobileprovision')) continue;
    const fullPath = path.join(directory, entry);
    try {
      const plist = readPlist(fullPath);
      if (plist?.Name === name) matches.push({ path: fullPath, plist });
    } catch {
      // Ignore profiles security cannot decode.
    }
  }
  return matches;
}

function resolveProfile(options) {
  if (options.profilePath) {
    return { path: options.profilePath, plist: readPlist(options.profilePath) };
  }
  if (!options.requireProfile) return null;
  const directory = options.profileDirectory ?? PROFILE_DIRECTORY;
  const matches = findProfiles(directory, options.profileName ?? PROFILE_NAME);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Capability mismatch: found ${matches.length} provisioning profiles named "${options.profileName ?? PROFILE_NAME}". Archive was not started.`
    );
  }
  throw new Error(
    `Capability mismatch: provisioning profile "${options.profileName ?? PROFILE_NAME}" is not installed, so entitlements cannot be compared before archive.`
  );
}

function mustContain(entitlements, label) {
  const problems = [];
  if (entitlements[PUSH_ENTITLEMENT] !== 'production' && label.includes('Capabilities')) {
    problems.push(
      `${label} must set aps-environment to production before a TestFlight archive can request Push.`
    );
  }
  if (!Object.hasOwn(entitlements, PUSH_ENTITLEMENT)) {
    problems.push(`${label} is missing ${PUSH_ENTITLEMENT}.`);
  }
  if (!Object.hasOwn(entitlements, WALLET_ENTITLEMENT)) {
    problems.push(`${label} is missing ${WALLET_ENTITLEMENT}.`);
  }
  const passTypes = asList(entitlements[WALLET_ENTITLEMENT]).map(normalizePassType);
  if (!passTypes.includes(PASS_TYPE_ID)) {
    problems.push(`${label} must include Pass Type ID ${PASS_TYPE_ID}.`);
  }
  return problems;
}

/**
 * @param {{
 *   repoRoot?: string,
 *   profilePath?: string,
 *   profileDirectory?: string,
 *   requireProfile?: boolean,
 *   profileName?: string,
 * }} [options]
 */
export function evaluateDistributionCapabilities(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const projectPath = path.join(repoRoot, 'apps/ios/Jovie.xcodeproj/project.pbxproj');
  const infoPlistPath = path.join(repoRoot, 'apps/ios/Jovie/Info.plist');
  const lines = [];
  const problems = [];

  const project = readFileSync(projectPath, 'utf8');
  const release = readAppBuildSettings(project, 'Release');
  const debug = readAppBuildSettings(project, 'Debug');
  const infoPlist = readFileSync(infoPlistPath, 'utf8');

  if (!infoPlist.includes('$(JOVIE_DISTRIBUTION_PUSH_WALLET)')) {
    problems.push(
      'Info.plist must publish JOVIEDistributionPushWallet from $(JOVIE_DISTRIBUTION_PUSH_WALLET) so a Release build skips Push and Wallet instead of calling them without entitlements.'
    );
  }
  if (release.pushWallet !== 'YES' && release.pushWallet !== 'NO') {
    problems.push(
      `Release JOVIE_DISTRIBUTION_PUSH_WALLET must be YES or NO. Found ${release.pushWallet ?? 'nothing'}.`
    );
  }
  if (debug.pushWallet !== 'YES') {
    problems.push(
      'Debug JOVIE_DISTRIBUTION_PUSH_WALLET must stay YES so local builds keep Push and Wallet.'
    );
  }
  if (debug.entitlements !== DEBUG_ENTITLEMENTS) {
    problems.push(
      `Debug must keep signing ${DEBUG_ENTITLEMENTS}. Found ${debug.entitlements ?? 'nothing'}.`
    );
  }

  const releaseEntitlementsPath = release.entitlements
    ? path.join(repoRoot, 'apps/ios', release.entitlements)
    : '';
  const debugEntitlements = readPlist(
    path.join(repoRoot, 'apps/ios', DEBUG_ENTITLEMENTS)
  );
  const capabilityEntitlements = readPlist(
    path.join(repoRoot, 'apps/ios', CAPABILITY_ENTITLEMENTS)
  );
  const releaseEntitlements = releaseEntitlementsPath
    ? readPlist(releaseEntitlementsPath)
    : {};

  if (debugEntitlements[PUSH_ENTITLEMENT] !== 'development') {
    problems.push(
      'Debug entitlements must keep aps-environment set to development.'
    );
  }
  const debugPassTypes = asList(debugEntitlements[WALLET_ENTITLEMENT]).map(
    normalizePassType
  );
  if (!Object.hasOwn(debugEntitlements, PUSH_ENTITLEMENT)) {
    problems.push(`Debug entitlements are missing ${PUSH_ENTITLEMENT}.`);
  }
  if (!debugPassTypes.includes(PASS_TYPE_ID)) {
    problems.push(`Debug entitlements must include Pass Type ID ${PASS_TYPE_ID}.`);
  }

  problems.push(
    ...mustContain(
      capabilityEntitlements,
      CAPABILITY_ENTITLEMENTS
    )
  );

  const releaseRequestsPush = Object.hasOwn(releaseEntitlements, PUSH_ENTITLEMENT);
  const releaseRequestsWallet = Object.hasOwn(
    releaseEntitlements,
    WALLET_ENTITLEMENT
  );

  if (release.pushWallet === 'NO') {
    if (release.entitlements !== DISTRIBUTION_ENTITLEMENTS) {
      problems.push(
        `JOVIE_DISTRIBUTION_PUSH_WALLET=NO must sign ${DISTRIBUTION_ENTITLEMENTS}. Found ${release.entitlements ?? 'nothing'}.`
      );
    }
    if (releaseRequestsPush || releaseRequestsWallet) {
      const requested = [
        releaseRequestsPush ? PUSH_ENTITLEMENT : null,
        releaseRequestsWallet ? WALLET_ENTITLEMENT : null,
      ]
        .filter(Boolean)
        .join(' and ');
      problems.push(
        `Capability mismatch: Release JOVIE_DISTRIBUTION_PUSH_WALLET=NO but ${release.entitlements} still requests ${requested}. ${TIM_PORTAL_STEP}`
      );
    }
  }

  if (release.pushWallet === 'YES') {
    if (release.entitlements !== CAPABILITY_ENTITLEMENTS) {
      problems.push(
        `JOVIE_DISTRIBUTION_PUSH_WALLET=YES must sign ${CAPABILITY_ENTITLEMENTS}. Found ${release.entitlements ?? 'nothing'}.`
      );
    }
    problems.push(
      ...mustContain(releaseEntitlements, release.entitlements ?? 'Release entitlements')
    );
  }

  let profile = null;
  try {
    profile = resolveProfile(options);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (profile) {
    if (profile.plist.Name && profile.plist.Name !== (options.profileName ?? PROFILE_NAME)) {
      problems.push(
        `Capability mismatch: expected provisioning profile "${options.profileName ?? PROFILE_NAME}" but decoded "${profile.plist.Name}".`
      );
    }
    const compared = compareEntitlementsToProfile(releaseEntitlements, profile.plist);
    if (compared.problems.length > 0) {
      const profileLabel = profile.plist.Name ?? options.profileName ?? PROFILE_NAME;
      problems.push(
        `Capability mismatch: provisioning profile "${profileLabel}" cannot sign the Release entitlements.`,
        ...compared.problems
      );
      if (compared.missing.length > 0) {
        problems.push(
          `Missing profile entitlements: ${compared.missing.join(', ')}.`
        );
      }
      problems.push(TIM_PORTAL_STEP);
    }
  }

  if (problems.length > 0) {
    return { ok: false, lines: [...new Set(problems)] };
  }

  const profileLabel = profile?.plist.Name ?? PROFILE_NAME;
  if (release.pushWallet === 'NO') {
    lines.push(
      `Distribution capability preflight passed. Release JOVIE_DISTRIBUTION_PUSH_WALLET=NO and ${release.entitlements} do not request Push Notifications or Wallet.`
    );
    if (profile && !profileHasPushAndWallet(profile.plist)) {
      lines.push(
        `Provisioning profile "${profileLabel}" does not include Push Notifications or Wallet. That matches this gated archive. ${TIM_PORTAL_STEP} Only then set Release JOVIE_DISTRIBUTION_PUSH_WALLET to YES.`
      );
    } else if (profile) {
      lines.push(
        `Provisioning profile "${profileLabel}" already includes Push Notifications and Wallet. Release remains gated until JOVIE_DISTRIBUTION_PUSH_WALLET is set to YES.`
      );
    }
  } else {
    lines.push(
      `Distribution capability preflight passed. Provisioning profile "${profileLabel}" covers the Release Push and Wallet entitlements.`
    );
  }
  return { ok: true, lines };
}

function readArgs(argv) {
  /** @type {{ profilePath?: string, requireProfile: boolean, repoRoot?: string }} */
  const options = {
    requireProfile: process.env.JOVIE_REQUIRE_DISTRIBUTION_PROFILE === '1',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') {
      options.profilePath = argv[index + 1];
      index += 1;
    } else if (arg === '--repo-root') {
      options.repoRoot = argv[index + 1];
      index += 1;
    } else if (arg === '--require-profile') {
      options.requireProfile = true;
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (process.env.JOVIE_PROVISIONING_PROFILE) {
    options.profilePath = process.env.JOVIE_PROVISIONING_PROFILE;
  }
  return options;
}

function main() {
  const options = readArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      'Usage: validate-distribution-capabilities.mjs [--require-profile] [--profile <file>] [--repo-root <path>]\n'
    );
    return 0;
  }
  const result = evaluateDistributionCapabilities(options);
  const stream = result.ok ? process.stdout : process.stderr;
  for (const line of result.lines) stream.write(`${line}\n`);
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}
