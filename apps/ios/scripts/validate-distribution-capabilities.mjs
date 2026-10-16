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

/** Xcode 16+ installs into UserData. Older match/Xcode copies use MobileDevice. */
export const PROVISIONING_PROFILE_DIRECTORY_SUFFIXES = [
  'Library/Developer/Xcode/UserData/Provisioning Profiles',
  'Library/MobileDevice/Provisioning Profiles',
];

const PROFILE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      return Number(parseTaggedText('integer'));
    }
    if (source.startsWith('<real', index))
      return Number(parseTaggedText('real'));
    // Decoded .mobileprovision files carry CreationDate/ExpirationDate and
    // DeveloperCertificates before Name. Skipping those types drops the profile.
    if (source.startsWith('<date', index)) return parseTaggedText('date');
    if (source.startsWith('<data', index)) return parseTaggedText('data');
    throw new Error(
      `Unsupported plist value near ${JSON.stringify(source.slice(index, index + 48))}`
    );
  }

  function parseTaggedText(tag) {
    if (
      source.startsWith(`<${tag}/>`, index) ||
      source.startsWith(`<${tag} />`, index)
    ) {
      index = source.indexOf('>', index) + 1;
      return '';
    }
    const open = source.indexOf('>', index);
    const close = source.indexOf(`</${tag}>`, open + 1);
    if (open < 0 || close < 0) throw new Error(`Unclosed plist ${tag}`);
    const value = decodeXml(source.slice(open + 1, close)).trim();
    index = close + `</${tag}>`.length;
    return value;
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
    if (
      source.startsWith('<dict/>', index) ||
      source.startsWith('<dict />', index)
    ) {
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
    if (
      source.startsWith('<array/>', index) ||
      source.startsWith('<array />', index)
    ) {
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

function plistText(bytes) {
  return bytes
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
}

export function provisioningProfileDirectories(home = process.env.HOME ?? '') {
  return PROVISIONING_PROFILE_DIRECTORY_SUFFIXES.map(suffix =>
    path.join(home, suffix)
  );
}

export function readPlist(filePath) {
  const bytes = readFileSync(filePath);
  const head = plistText(bytes.subarray(0, 256));
  const textual =
    head.startsWith('<?xml') ||
    head.startsWith('<plist') ||
    head.startsWith('<dict') ||
    head.startsWith('{');
  if (filePath.endsWith('.mobileprovision') && !textual) {
    let decoded;
    try {
      decoded = execFileSync('security', ['cms', '-D', '-i', filePath], {
        encoding: 'utf8',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not decode provisioning profile ${filePath}. ${detail}`
      );
    }
    return parsePlist(decoded);
  }
  const text = bytes.toString('utf8');
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
    const read = key => {
      const match = settings.match(new RegExp(`${key} = "?([^";]+)"?;`));
      return match ? match[1].trim() : null;
    };
    return {
      entitlements: read('CODE_SIGN_ENTITLEMENTS'),
      pushWallet: read('JOVIE_DISTRIBUTION_PUSH_WALLET'),
    };
  }
  throw new Error(`Missing ${configurationName} build settings for ${APP_ID}`);
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
      profileEntitlements[PUSH_ENTITLEMENT] !==
      appEntitlements[PUSH_ENTITLEMENT]
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
      id =>
        !allowed.some(
          candidate =>
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
  const passTypes = asList(entitlements[WALLET_ENTITLEMENT]).map(
    normalizePassType
  );
  return (
    Object.hasOwn(entitlements, PUSH_ENTITLEMENT) &&
    passTypes.includes(PASS_TYPE_ID)
  );
}

function profileEnvironment(options) {
  return options.env ?? process.env;
}

function explicitProfilePath(options) {
  if (options.profilePath) return options.profilePath;
  const env = profileEnvironment(options);
  return env.JOVIE_PROVISIONING_PROFILE || null;
}

function sighProfilePaths(env, profileName) {
  const named = [];
  const other = [];
  for (const [key, value] of Object.entries(env)) {
    if (!value || !key.startsWith('sigh_') || !key.endsWith('_profile-path')) {
      continue;
    }
    const nameKey = `${key.slice(0, -'_profile-path'.length)}_profile-name`;
    const entry = { path: value, name: env[nameKey] ?? null };
    if (entry.name === profileName) named.push(entry);
    else other.push(entry);
  }
  return [...named, ...other];
}

function sighProfileUuids(env) {
  const uuids = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('sigh_') || !value) continue;
    if (
      key.includes('_profile-') ||
      key.endsWith('_team-id') ||
      key.endsWith('_certificate-name')
    ) {
      continue;
    }
    if (PROFILE_UUID.test(value)) uuids.push(value);
  }
  return uuids;
}

function searchDirectories(options) {
  if (options.profileDirectory) return [options.profileDirectory];
  const env = profileEnvironment(options);
  return provisioningProfileDirectories(options.home ?? env.HOME ?? '');
}

/**
 * @param {string} directory
 * @param {string} name
 * @param {{ seen: number, decoded: number, failures: string[] }} report
 */
function findProfiles(directory, name, report) {
  if (!existsSync(directory)) return [];
  const matches = [];
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.mobileprovision')) continue;
    report.seen += 1;
    const fullPath = path.join(directory, entry);
    try {
      const plist = readPlist(fullPath);
      report.decoded += 1;
      if (plist?.Name === name) matches.push({ path: fullPath, plist });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      report.failures.push(`${fullPath}: ${detail}`);
    }
  }
  return matches;
}

function resolveProfile(options) {
  const explicit = explicitProfilePath(options);
  if (explicit) {
    return { path: explicit, plist: readPlist(explicit) };
  }
  if (!options.requireProfile) return null;

  const env = profileEnvironment(options);
  const name = options.profileName ?? PROFILE_NAME;
  const directories = searchDirectories(options);
  const installedSigh = sighProfilePaths(env, name).filter(entry =>
    existsSync(entry.path)
  );
  if (installedSigh.length > 1) {
    throw new Error(
      `Capability mismatch: match exported ${installedSigh.length} provisioning profile paths. Archive was not started.`
    );
  }
  if (installedSigh.length === 1) {
    return {
      path: installedSigh[0].path,
      plist: readPlist(installedSigh[0].path),
    };
  }

  for (const uuid of sighProfileUuids(env)) {
    for (const directory of directories) {
      const fullPath = path.join(directory, `${uuid}.mobileprovision`);
      if (!existsSync(fullPath)) continue;
      return { path: fullPath, plist: readPlist(fullPath) };
    }
  }

  const report = { seen: 0, decoded: 0, failures: [] };
  const matches = [];
  for (const directory of directories) {
    matches.push(...findProfiles(directory, name, report));
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Capability mismatch: found ${matches.length} provisioning profiles named "${name}". Archive was not started.`
    );
  }
  if (report.decoded === 0 && report.failures.length > 0) {
    throw new Error(
      `Capability mismatch: provisioning profile "${name}" is installed but could not be decoded, so entitlements cannot be compared before archive. ${report.failures.join(' ')}`
    );
  }
  const searched = directories.join(', ');
  throw new Error(
    `Capability mismatch: provisioning profile "${name}" is not installed, so entitlements cannot be compared before archive. Searched ${searched}.`
  );
}

function mustContain(entitlements, label) {
  const problems = [];
  if (
    entitlements[PUSH_ENTITLEMENT] !== 'production' &&
    label.includes('Capabilities')
  ) {
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
  const passTypes = asList(entitlements[WALLET_ENTITLEMENT]).map(
    normalizePassType
  );
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
 *   home?: string,
 *   env?: Record<string, string | undefined>,
 *   requireProfile?: boolean,
 *   profileName?: string,
 * }} [options]
 */
export function evaluateDistributionCapabilities(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const projectPath = path.join(
    repoRoot,
    'apps/ios/Jovie.xcodeproj/project.pbxproj'
  );
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
    problems.push(
      `Debug entitlements must include Pass Type ID ${PASS_TYPE_ID}.`
    );
  }

  problems.push(
    ...mustContain(capabilityEntitlements, CAPABILITY_ENTITLEMENTS)
  );

  const releaseRequestsPush = Object.hasOwn(
    releaseEntitlements,
    PUSH_ENTITLEMENT
  );
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
      ...mustContain(
        releaseEntitlements,
        release.entitlements ?? 'Release entitlements'
      )
    );
  }

  let profile = null;
  try {
    profile = resolveProfile(options);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (profile) {
    if (
      profile.plist.Name &&
      profile.plist.Name !== (options.profileName ?? PROFILE_NAME)
    ) {
      problems.push(
        `Capability mismatch: expected provisioning profile "${options.profileName ?? PROFILE_NAME}" but decoded "${profile.plist.Name}".`
      );
    }
    const compared = compareEntitlementsToProfile(
      releaseEntitlements,
      profile.plist
    );
    if (compared.problems.length > 0) {
      const profileLabel =
        profile.plist.Name ?? options.profileName ?? PROFILE_NAME;
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
