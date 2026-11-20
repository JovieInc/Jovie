import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectMainActorTypes,
  compare,
  main,
  scanProjectSettings,
  scanSwiftSource,
  tightenedBaseline,
} from './guard.mjs';

const rulesOf = (source, options) =>
  scanSwiftSource(source, options).map(finding => finding.rule);

test('flags JSON decoding inside a @MainActor class but not inside an actor', () => {
  const source = [
    '@MainActor',
    '@Observable',
    'final class Store {',
    '  func load(_ data: Data) {',
    '    let value = try? JSONDecoder().decode(Item.self, from: data)',
    '  }',
    '}',
    'actor Cache {',
    '  func load(_ data: Data) {',
    '    let value = try? JSONDecoder().decode(Item.self, from: data)',
    '  }',
    '}',
  ].join('\n');
  const findings = scanSwiftSource(source);
  assert.deepEqual(
    findings.map(finding => [finding.rule, finding.line]),
    [['main-actor-json-codec', 5]]
  );
});

test('SwiftUI views are main-actor; nonisolated and Task.detached scopes are not', () => {
  const source = [
    'struct Row: View {',
    '  var body: some View {',
    '    let image = UIImage(data: data)',
    '    Text("")',
    '  }',
    '  nonisolated func decode(_ data: Data) -> UIImage? {',
    '    UIImage(data: data)',
    '  }',
    '  func later() {',
    '    Task.detached {',
    '      let image = UIImage(data: data)',
    '    }',
    '  }',
    '}',
  ].join('\n');
  const findings = scanSwiftSource(source);
  assert.deepEqual(
    findings.map(finding => [finding.rule, finding.line]),
    [['main-actor-image-decode', 3]]
  );
});

test('nested types do not inherit the outer main actor; extensions of main types do', () => {
  const mainTypes = collectMainActorTypes([
    '@MainActor\nfinal class Model {\n}\n',
  ]);
  assert.ok(mainTypes.has('Model'));
  const source = [
    '@MainActor final class Outer {',
    '  struct Inner {',
    '    func f() { _ = FileManager.default.fileExists(atPath: "") }',
    '  }',
    '}',
    'extension Model {',
    '  func g() { _ = FileManager.default.fileExists(atPath: "") }',
    '}',
  ].join('\n');
  assert.deepEqual(
    scanSwiftSource(source, { mainActorTypes: mainTypes }).map(
      finding => finding.line
    ),
    [7]
  );
});

test('hoisted static formatters pass; per-call formatters and regexes fail', () => {
  const source = [
    'enum Fmt {',
    '  static let shared: NumberFormatter = {',
    '    let formatter = NumberFormatter()',
    '    return formatter',
    '  }()',
    '  static let iso = ISO8601DateFormatter()',
    '  static func f() -> String {',
    '    let regex = try? NSRegularExpression(pattern: "a")',
    '    return ISO8601DateFormatter().string(from: Date())',
    '  }',
    '}',
  ].join('\n');
  assert.deepEqual(
    scanSwiftSource(source).map(finding => [finding.rule, finding.line]),
    [
      ['per-call-formatter-or-regex', 8],
      ['per-call-formatter-or-regex', 9],
    ]
  );
});

test('ignores comments, string literals and #if DEBUG blocks', () => {
  const source = [
    '@MainActor final class A {',
    '  // let x = JSONDecoder()',
    '  let label = "JSONDecoder() in a string"',
    '#if DEBUG',
    '  func debugOnly() { _ = try? JSONDecoder().decode(X.self, from: d) }',
    '#endif',
    '}',
  ].join('\n');
  assert.deepEqual(rulesOf(source), []);
});

test('flags ObservableObject types and Combine observation wrappers anywhere', () => {
  const source = [
    'final class VM: NSObject, ObservableObject {',
    '  @Published var name = ""',
    '}',
    'struct V: View { @StateObject var vm = VM(); var body: some View { EmptyView() } }',
  ].join('\n');
  assert.deepEqual(rulesOf(source), [
    'observable-object-type',
    'combine-observation-wrapper',
    'combine-observation-wrapper',
  ]);
});

test('configured blocking calls only count on the main actor', () => {
  const options = { extraMainActorCalls: ['\\bTokenStore\\.load\\('] };
  const source = [
    'struct Root: View {',
    '  var body: some View { EmptyView() }',
    '  var signedIn: Bool { TokenStore.load() != nil }',
    '}',
    'enum Background {',
    '  static func f() { _ = TokenStore.load() }',
    '}',
  ].join('\n');
  assert.deepEqual(
    scanSwiftSource(source, options).map(finding => [
      finding.rule,
      finding.line,
    ]),
    [['main-actor-blocking-call', 3]]
  );
});

test('project settings: Swift 5 configs and v5 packages count; Swift 6 does not', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'swift-arch-proj-'));
  try {
    mkdirSync(path.join(root, 'A.xcodeproj'), { recursive: true });
    writeFileSync(
      path.join(root, 'A.xcodeproj/project.pbxproj'),
      [
        '\t\t\tbuildSettings = {',
        '\t\t\t\tSWIFT_VERSION = 5.0;',
        '\t\t\t};',
        '\t\t\tbuildSettings = {',
        '\t\t\t\tSWIFT_STRICT_CONCURRENCY = complete;',
        '\t\t\t\tSWIFT_VERSION = 5.0;',
        '\t\t\t};',
        '\t\t\tbuildSettings = {',
        '\t\t\t\tSWIFT_VERSION = 6.0;',
        '\t\t\t};',
      ].join('\n')
    );
    writeFileSync(
      path.join(root, 'Old.swift'),
      '// swift-tools-version: 6.0\nlet p = Package(swiftLanguageModes: [.v5])\n'
    );
    writeFileSync(
      path.join(root, 'New.swift'),
      '// swift-tools-version: 6.0\nlet p = Package(name: "x")\n'
    );
    mkdirSync(path.join(root, 'old'));
    mkdirSync(path.join(root, 'new'));
    writeFileSync(
      path.join(root, 'old/Package.swift'),
      readFileSync(path.join(root, 'Old.swift'))
    );
    writeFileSync(
      path.join(root, 'new/Package.swift'),
      readFileSync(path.join(root, 'New.swift'))
    );
    const findings = scanProjectSettings(root, [
      'A.xcodeproj/project.pbxproj',
      'old/Package.swift',
      'new/Package.swift',
    ]);
    assert.equal(findings.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Core Data: main-queue viewContext fetches and bindings count; background contexts do not', () => {
  const source = [
    'final class Store {',
    '  func a() { let context = viewContext }',
    '  func b() { let context = CoreDataManager.shared.viewContext }',
    '  func c() throws { _ = try viewContext.fetch(request) }',
    '  func d() { let context = container.newBackgroundContext() }',
    '}',
  ].join('\n');
  assert.deepEqual(
    scanSwiftSource(source).map(finding => [finding.rule, finding.line]),
    [
      ['main-actor-core-data', 2],
      ['main-actor-core-data', 3],
      ['main-actor-core-data', 4],
    ]
  );
});

test('compare and tighten: increases fail, decreases tighten, never loosen', () => {
  const baseline = { r: { 'a.swift': 2, 'b.swift': 1 } };
  const current = { r: { 'a.swift': 1, 'c.swift': 1 } };
  const { increases, decreases } = compare(current, baseline);
  assert.deepEqual(increases, [{ rule: 'r', file: 'c.swift', now: 1, was: 0 }]);
  assert.equal(decreases.length, 2);
  assert.deepEqual(tightenedBaseline(current, baseline), {
    r: { 'a.swift': 1 },
  });
});

test('CLI: new violation fails with fix guidance; fix requires tightening; write-baseline refuses growth', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'swift-arch-cli-'));
  try {
    mkdirSync(path.join(root, 'App'), { recursive: true });
    const file = path.join(root, 'App/Store.swift');
    writeFileSync(
      file,
      '@MainActor final class Store {\n  func f() { _ = JSONDecoder() }\n}\n'
    );
    const baselinePath = path.join(root, 'baseline.json');
    writeFileSync(
      baselinePath,
      JSON.stringify({ config: { roots: ['App'] }, counts: {} })
    );
    const logs = [];
    const sink = {
      log: line => logs.push(line),
      error: line => logs.push(line),
    };
    const args = ['--repo', root, '--baseline', baselinePath];

    assert.equal(main(args, sink), 1);
    assert.match(logs.join('\n'), /main-actor-json-codec/);
    assert.match(logs.join('\n'), /App\/Store\.swift:2/);
    assert.equal(
      main([...args, '--write-baseline'], sink),
      1,
      'must not grandfather new debt'
    );

    writeFileSync(
      baselinePath,
      JSON.stringify({
        config: { roots: ['App'] },
        counts: { 'main-actor-json-codec': { 'App/Store.swift': 1 } },
      })
    );
    assert.equal(main(args, sink), 0);

    writeFileSync(file, '@MainActor final class Store {\n  func f() {}\n}\n');
    assert.equal(main(args, sink), 1, 'stale baseline must be tightened');
    assert.equal(main([...args, '--write-baseline'], sink), 0);
    assert.deepEqual(JSON.parse(readFileSync(baselinePath, 'utf8')).counts, {});
    assert.equal(main(args, sink), 0);

    const out = path.join(root, 'metrics.json');
    assert.equal(main([...args, '--json', '--out', out], sink), 0);
    const metrics = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(metrics.schema, 'jovie.swift-arch-metrics/v1');
    assert.equal(metrics.total, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
