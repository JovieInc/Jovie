#!/usr/bin/env node
// JOV-13089 - App Store minimum-SDK guard (ITMS-90725).
//
// Deterministic, dependency-free, NO network. Verifies that the SDK a built
// iOS app was produced with meets Apple's App Store Connect minimum-SDK
// requirement for today's date, and warns (exit 0, GitHub Actions annotation)
// inside a configurable pre-deadline window before the next requirement
// takes effect.
//
// The requirement table (with Apple source URLs per row) lives in
// apps/ios/config/app-store-min-sdk.json. A future Apple bump is handled by
// adding one row - never by editing this script.
//
// Inputs (mutually compatible, checked in this order):
//   --dtsdkname <value>         explicit DTSDKName (e.g. iphoneos26.5)
//   --dtplatformversion <v>     explicit DTPlatformVersion (e.g. 26.5)
//   --info-plist <path>         built app's Info.plist (XML; convert binary
//                               plists with `plutil -convert xml1` first)
//   --showsdks <file>           captured `xcodebuild -showsdks` output file;
//                               the iOS line's -sdk value is used
//
//   --config <path>             requirement table (default: config next to
//                               apps/ios/config/app-store-min-sdk.json)
//   --today <YYYY-MM-DD>        override today's date (tests; stable runs)
//   --warn-window-days <n>      override the pre-deadline warn window
//
// Exit codes: 0 = pass (warn window emits ::warning), 1 = fail. Fail closed
// on anything it cannot prove: missing/unreadable inputs, unparseable SDK
// versions, or an invalid requirement table.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONFIG = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../config/app-store-min-sdk.json'
);

const ANNOTATION_TITLE = 'App Store minimum-SDK guard (JOV-13089)';

function emitError(message) {
  console.log(`::error title=${ANNOTATION_TITLE}::${message}`);
  console.error(`ERROR: ${message}`);
}

function emitWarning(message) {
  console.log(`::warning title=${ANNOTATION_TITLE}::${message}`);
  console.error(`WARN: ${message}`);
}

function emitPass(message) {
  console.log(`OK: ${message}`);
}

// --- parsing helpers -------------------------------------------------------

export function parseSdkMajor(value) {
  if (typeof value !== 'string') return null;
  // Matches "iphoneos26.5", "iphonesimulator26.5", "26.5", "27" etc.
  const match = value.match(/(?:iphoneos|iphonesimulator)?(\d+)(?:\.\d+)?$/);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isInteger(major) && major >= 0 ? major : null;
}

export function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject overflow dates like 2027-02-31 (Date rolls them over).
  return parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function readPlistStrings(plistPath) {
  if (!existsSync(plistPath)) {
    throw new Error(`Info.plist not found: ${plistPath}`);
  }
  const raw = readFileSync(plistPath, 'utf8');
  if (raw.startsWith('bplist00')) {
    throw new Error(
      `Binary plist at ${plistPath} is not parseable without macOS tooling. ` +
        'Re-export it with: plutil -convert xml1 -o Info.plist Info.plist'
    );
  }
  const readKey = key => {
    const match = raw.match(
      new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)
    );
    return match ? match[1] : null;
  };
  return {
    DTSDKName: readKey('DTSDKName'),
    DTPlatformVersion: readKey('DTPlatformVersion'),
  };
}

export function parseShowSdks(showSdksText) {
  // Match the "-sdk iphoneos<version>" value from the iOS SDK line, e.g.
  // "iOS 26.5                       -sdk iphoneos26.5"
  const match = showSdksText.match(
    /-sdk\s+(?:iphoneos|iphonesimulator)(\d+(?:\.\d+)?)/
  );
  return match ? { DTSDKName: `iphoneos${match[1]}` } : {};
}

// --- config ----------------------------------------------------------------

export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return 'config must be a JSON object';
  }
  if (!Array.isArray(config.rows) || config.rows.length === 0) {
    return 'config.rows must be a non-empty array';
  }
  for (const [index, row] of config.rows.entries()) {
    if (!parseIsoDate(row.effectiveDate)) {
      return `rows[${index}].effectiveDate must be a valid YYYY-MM-DD date`;
    }
    if (!Number.isInteger(row.minSdkMajor) || row.minSdkMajor < 1) {
      return `rows[${index}].minSdkMajor must be a positive integer`;
    }
    if (typeof row.sourceUrl !== 'string' || row.sourceUrl.length === 0) {
      return `rows[${index}].sourceUrl is required (cite Apple's page; never invent dates)`;
    }
  }
  if (
    config.warnWindowDays !== undefined &&
    (!Number.isInteger(config.warnWindowDays) || config.warnWindowDays < 0)
  ) {
    return 'config.warnWindowDays must be a non-negative integer';
  }
  return null;
}

export function loadConfig(configPath) {
  const raw = readFileSync(configPath, 'utf8');
  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON in ${configPath}: ${error.message}`);
  }
  const invalid = validateConfig(config);
  if (invalid) throw new Error(`invalid config ${configPath}: ${invalid}`);
  return config;
}

// --- evaluation ------------------------------------------------------------

// Pure: given the validated rows, today, the observed SDK major and the warn
// window, decide pass / warn / fail.
export function evaluate({ rows, today, observedMajor, warnWindowDays }) {
  const sorted = [...rows].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
  );
  const now = parseIsoDate(today);

  let current = null;
  let next = null;
  for (const row of sorted) {
    const rowDate = parseIsoDate(row.effectiveDate);
    if (rowDate.getTime() <= now.getTime()) {
      current = row;
    } else if (!next) {
      next = row;
    }
  }

  if (!current) {
    return {
      outcome: 'pass',
      warn: false,
      message: `No App Store minimum-SDK requirement is in effect yet (today ${today}, first requirement starts ${sorted[0].effectiveDate}).`,
    };
  }

  if (observedMajor < current.minSdkMajor) {
    return {
      outcome: 'fail',
      warn: false,
      current,
      message:
        `ITMS-90725 risk: observed SDK major ${observedMajor} is below the ` +
        `required minimum ${current.minSdkMajor} (in effect since ` +
        `${current.effectiveDate}). Rebuild with an SDK >= ${current.minSdkMajor} ` +
        `(Xcode whose iOS SDK major is >= ${current.minSdkMajor}). Source: ${current.sourceUrl}`,
    };
  }

  const daysUntilNext = next
    ? Math.round(
        (parseIsoDate(next.effectiveDate).getTime() - now.getTime()) / DAY_MS
      )
    : null;

  if (
    next &&
    observedMajor < next.minSdkMajor &&
    daysUntilNext <= warnWindowDays
  ) {
    return {
      outcome: 'pass',
      warn: true,
      current,
      next,
      daysUntilNext,
      message:
        `Uploads built with SDK ${observedMajor} will be REJECTED starting ` +
        `${next.effectiveDate} (minimum ${next.minSdkMajor}); ` +
        `${daysUntilNext} day(s) left. Rebuild with the iOS ${next.minSdkMajor} SDK ` +
        `(Xcode ${next.minSdkMajor} or later) before ${next.effectiveDate}. ` +
        `Source: ${next.sourceUrl}`,
    };
  }

  return {
    outcome: 'pass',
    warn: false,
    current,
    next,
    daysUntilNext,
    message: `Observed SDK major ${observedMajor} satisfies the requirement in effect (minimum ${current.minSdkMajor} since ${current.effectiveDate}).`,
  };
}

// --- observed SDK resolution ----------------------------------------------

export function resolveObservedSdkMajor(options) {
  const attempted = [];
  if (options.dtsdkname) {
    const major = parseSdkMajor(options.dtsdkname);
    if (major !== null)
      return { major, from: `--dtsdkname ${options.dtsdkname}` };
    attempted.push(`--dtsdkname ${options.dtsdkname} (unparseable)`);
  }
  if (options.dtplatformversion) {
    const major = parseSdkMajor(options.dtplatformversion);
    if (major !== null) {
      return {
        major,
        from: `--dtplatformversion ${options.dtplatformversion}`,
      };
    }
    attempted.push(
      `--dtplatformversion ${options.dtplatformversion} (unparseable)`
    );
  }
  if (options.infoPlistPath) {
    const strings = readPlistStrings(options.infoPlistPath);
    for (const [key, value] of Object.entries(strings)) {
      const major = parseSdkMajor(value);
      if (major !== null) return { major, from: `Info.plist ${key}=${value}` };
      if (value) attempted.push(`Info.plist ${key}=${value} (unparseable)`);
    }
    attempted.push('Info.plist had no DTSDKName/DTPlatformVersion string');
  }
  if (options.showsdksPath) {
    const text = readFileSync(options.showsdksPath, 'utf8');
    const parsed = parseShowSdks(text);
    for (const [key, value] of Object.entries(parsed)) {
      const major = parseSdkMajor(value);
      if (major !== null)
        return { major, from: `xcodebuild -showsdks ${key}=${value}` };
    }
    attempted.push('showsdks output had no iOS -sdk line');
  }
  throw new Error(
    'Could not determine the built SDK (fail closed). ' +
      (attempted.length > 0
        ? `Attempted: ${attempted.join('; ')}.`
        : 'No input source provided.') +
      ' Pass --dtsdkname/--dtplatformversion, --info-plist (XML) or --showsdks.'
  );
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    configPath: DEFAULT_CONFIG,
    warnWindowDays: null,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--dtsdkname':
        args.dtsdkname = value;
        break;
      case '--dtplatformversion':
        args.dtplatformversion = value;
        break;
      case '--info-plist':
        args.infoPlistPath = value;
        break;
      case '--showsdks':
        args.showsdksPath = value;
        break;
      case '--config':
        args.configPath = value;
        break;
      case '--today':
        args.today = value;
        break;
      case '--warn-window-days':
        args.warnWindowDays = Number.parseInt(value, 10);
        break;
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    emitError(error.message);
    return 1;
  }

  let config;
  try {
    config = loadConfig(args.configPath);
  } catch (error) {
    emitError(error.message);
    return 1;
  }

  const today = args.today ?? todayIso();
  if (!parseIsoDate(today)) {
    emitError(`--today must be a valid YYYY-MM-DD date, got: ${today}`);
    return 1;
  }
  const warnWindowDays = args.warnWindowDays ?? config.warnWindowDays ?? 60;
  if (!Number.isInteger(warnWindowDays) || warnWindowDays < 0) {
    emitError(
      `--warn-window-days must be a non-negative integer, got: ${warnWindowDays}`
    );
    return 1;
  }

  let observed;
  try {
    observed = resolveObservedSdkMajor(args);
  } catch (error) {
    emitError(error.message);
    return 1;
  }

  const result = evaluate({
    rows: config.rows,
    today,
    observedMajor: observed.major,
    warnWindowDays,
  });

  const context = ` (observed ${observed.from})`;
  if (result.outcome === 'fail') {
    emitError(`${result.message}${context}`);
    return 1;
  }
  if (result.warn) {
    emitWarning(`${result.message}${context}`);
    return 0;
  }
  emitPass(`${result.message}${context}`);
  return 0;
}

const isMain = (() => {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  process.exitCode = main();
}
