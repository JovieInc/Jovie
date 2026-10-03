import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PROPOSED_SLUGS = [
  'JOV-INV-013',
  'JOV-INV-014',
  'JOV-INV-015',
  'JOV-INV-016',
];
const REPORT_PATH = 'docs/macos/swift-control-invariants.md';
const RULE_PATH = '.claude/rules/macos.md';
const ADR_PATH = 'docs/macos/ADR-swift-native-mac.md';
const ALLOWED_IOS_WKWEBVIEW = new Set([
  'apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift',
]);

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function walkFiles(relDir, predicate) {
  const absDir = join(ROOT, relDir);
  if (!existsSync(absDir)) return [];
  const found = [];
  const stack = [absDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '.build' ||
          entry.name === 'DerivedData' ||
          entry.name === 'node_modules'
        ) {
          continue;
        }
        stack.push(abs);
        continue;
      }
      if (entry.isFile() && predicate(abs)) {
        found.push(relative(ROOT, abs).split('\\').join('/'));
      }
    }
  }
  return found.sort();
}

function macosTopLevelDirs() {
  return readdirSync(join(ROOT, 'apps/macos'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
}

describe('Mac Swift-control invariants (Swift-native ADR, supersedes JOV-5359)', () => {
  it('names the proposed slugs without adopting them and records the supersession', () => {
    const report = read(REPORT_PATH);
    const rule = read(RULE_PATH);
    const adr = read(ADR_PATH);
    const registry = read('canon/invariants.jsonl');
    for (const slug of PROPOSED_SLUGS) {
      assert.match(report, new RegExp(`\\b${slug}\\b`));
      assert.doesNotMatch(registry, new RegExp(`"id":"${slug}"`));
    }
    assert.match(report, /`JOV-INV-013` \| \*\*Superseded\*\*/);
    assert.match(report, /Transition plan/i);
    assert.match(report, /\*\*Swift-native, phased\.\*\*/);
    assert.match(rule, /ADR-swift-native-mac\.md/);
    assert.match(adr, /EVENT: permanent direction set by Tim 2026-09-27/);
    assert.match(adr, /Supersedes:/);
  });

  it('keeps the shipped Mac app on Electron BrowserWindow until parity', () => {
    const desktopPkg = JSON.parse(read('apps/desktop/package.json'));
    assert.equal(desktopPkg.devDependencies?.electron !== undefined, true);
    const main = read('apps/desktop/src/main.ts');
    assert.match(main, /from 'electron'/);
    assert.match(main, /\bBrowserWindow\b/);
    assert.doesNotMatch(main, /WKWebView/);
    const ovieDoor = read('apps/desktop/src/ovie-door.ts');
    assert.match(ovieDoor, /OVIE_OPERATOR_OPS_ROUTE = '\/hud'/);
    assert.match(ovieDoor, /OVIE_OPERATOR_OPS_SEARCH = 'ovie=mac'/);
  });

  it('keeps MenuMonitor as the only apps/macos Swift target and without a webview', () => {
    assert.deepEqual(macosTopLevelDirs(), ['MenuMonitor']);
    const macosSwift = walkFiles(
      'apps/macos',
      abs => abs.endsWith('.swift') && !abs.includes('/.build/')
    );
    assert.equal(
      macosSwift.every(file => file.startsWith('apps/macos/MenuMonitor/')),
      true
    );
    for (const file of macosSwift) {
      const source = read(file);
      assert.doesNotMatch(source, /\bWKWebView\b/);
      assert.doesNotMatch(source, /^import WebKit$/m);
    }
    const pkg = read('apps/macos/MenuMonitor/Package.swift');
    assert.match(pkg, /executable\(name: "MenuMonitor"/);
    assert.match(pkg, /\.macOS\(\.v14\)/);
  });

  it('builds the native Mac app as one JovieMac target sharing iOS sources', () => {
    const generator = read('apps/ios/scripts/generate-mac-project.rb');
    assert.match(generator, /Jovie\/DesignSystem\/JovieTheme\.swift/);
    assert.match(generator, /'PRODUCT_BUNDLE_IDENTIFIER' => 'ie\.jov\.Jovie'/);
    const pbxproj = read('apps/ios/JovieMac.xcodeproj/project.pbxproj');
    assert.match(pbxproj, /JovieTheme\.swift in Sources/);
    const entitlements = read('apps/ios/JovieMac/JovieMac.entitlements');
    assert.match(entitlements, /webcredentials:jov\.ie/);
    // No unregistered WKWebView bridge: the ADR bridge register is empty.
    const macSwift = walkFiles('apps/ios/JovieMac', abs =>
      abs.endsWith('.swift')
    );
    assert.ok(macSwift.length > 0);
    for (const file of macSwift) {
      assert.doesNotMatch(read(file), /\bWKWebView\b/);
    }
  });

  it('confines iOS WKWebView to the public-profile browser', () => {
    const iosSwift = walkFiles('apps/ios/Jovie', abs => abs.endsWith('.swift'));
    const wkwebviewFiles = iosSwift.filter(file =>
      /\bWKWebView\b/.test(read(file))
    );
    assert.deepEqual(wkwebviewFiles, [...ALLOWED_IOS_WKWEBVIEW]);
  });
});
