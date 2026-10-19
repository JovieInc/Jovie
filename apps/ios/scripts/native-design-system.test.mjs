import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { selectSourceGuards } from '../../../scripts/ci-fast-lanes.mjs';
import {
  checkConcentric,
  checkNativeDesign,
  contrastRatio,
  END,
  exemptPaint,
  geometryTokens,
  MANIFEST,
  maskSwift,
  nativeSpacing,
  paintRatchet,
  projectedColors,
  ROOT,
  rawColors,
  replaceProjection,
  resolveSemantic,
  START,
  scanConcentricSwift,
  semanticDeclarations,
  swiftColor,
} from './native-design-system.mjs';

const manifest = JSON.parse(readFileSync(resolve(ROOT, MANIFEST), 'utf8'));
const palette = JSON.parse(
  readFileSync(resolve(ROOT, manifest.palette), 'utf8')
);
const css = readFileSync(resolve(ROOT, manifest.semantics), 'utf8');
const copy = value => structuredClone(value);
const project = (mapping = manifest, colors = palette) =>
  projectedColors(mapping, colors, css);

test('all canonical roles resolve once; values come from JSON and semantic emitter', () => {
  const output = project();
  for (const role of palette.elevations.roles)
    assert.ok(output.includes(`elevations.dark.${role}`));
  for (const role of palette.accents.roles)
    assert.ok(output.includes(`accents.hex.${role}`));
  assert.equal(
    (output.match(/static let /g) || []).length,
    manifest.bindings.length
  );
  const changed = copy(palette);
  changed.accents.hex.ion = '#123456';
  assert.notEqual(project(manifest, changed), output);
});

test('missing, duplicate, ambiguous or invalid mappings fail closed', () => {
  const missing = copy(manifest);
  missing.bindings = missing.bindings.filter(
    row => row.json?.join('.') !== 'accents.hex.mint'
  );
  assert.throws(() => project(missing), /Unmapped canonical/);
  const duplicate = copy(manifest);
  duplicate.bindings.push(copy(duplicate.bindings[0]));
  assert.throws(() => project(duplicate), /Duplicate/);
  duplicate.bindings.at(-1).name = 'anotherCanvas';
  assert.throws(() => project(duplicate), /Duplicate palette/);
  const ambiguous = copy(manifest);
  ambiguous.bindings[0].css = '--color-text-primary-token';
  assert.throws(() => project(ambiguous), /Ambiguous/);
  const absent = copy(palette);
  delete absent.accents.hex.red;
  assert.throws(() => project(manifest, absent), /Missing palette/);
  const invalid = copy(palette);
  invalid.accents.count++;
  assert.throws(() => project(manifest, invalid), /Invalid canonical/);
  assert.throws(() => project({ ...manifest, schema: 'other' }), /Unknown/);
});

test('semantic emitter aliases resolve; duplicate, absent and cyclic definitions reject', () => {
  const values = semanticDeclarations(css);
  assert.equal(
    resolveSemantic('--color-text-primary-token', values),
    resolveSemantic('--noir-ion-text-primary', values)
  );
  assert.throws(
    () =>
      semanticDeclarations(
        css + '\n:root.dark { --noir-ion-canvas: #000000; }'
      ),
    /exactly one/
  );
  assert.throws(
    () =>
      semanticDeclarations(
        ':root.dark { --noir-ion-canvas: #000000; --x: #000000; --x: #ffffff; }'
      ),
    /Duplicate/
  );
  assert.throws(() => resolveSemantic('--absent', values), /Missing/);
  assert.throws(
    () =>
      resolveSemantic(
        '--a',
        new Map([
          ['--a', 'var(--b)'],
          ['--b', 'var(--a)'],
        ])
      ),
    /Cyclic/
  );
  assert.throws(() => swiftColor('rgba(256, 0, 0, 0.2)'), /Unsupported/);
  assert.throws(() => swiftColor('invented(1 2 3)'), /Unsupported/);
  assert.equal(swiftColor('#123abc'), 'Color(hex: 0x123ABC)');
  assert.equal(
    swiftColor('rgba(1, 2, 3, 0.25)'),
    'Color(hex: 0x010203).opacity(0.25)'
  );
});

test('projection requires exactly one boundary and catches deliberately wrong native values', () => {
  const projection = project();
  const source = `enum Test {\n${START}\n  stale\n${END}\n}`;
  const green = replaceProjection(source, projection);
  assert.notEqual(source, green);
  assert.equal(replaceProjection(green, projection), green);
  assert.throws(
    () => replaceProjection(source + START, projection),
    /boundary/
  );
  assert.throws(() => replaceProjection('no boundary', projection), /boundary/);
  assert.notEqual(
    replaceProjection(green.replace('0x11AFFF', '0x000001'), projection),
    green.replace('0x11AFFF', '0x000001')
  );
});

test('Swift raw-color detector rejects multiline constructors, aliases and shorthand', () => {
  for (const source of [
    'let paint = Color.white',
    'let paint = Color(\n hex: 0x123456\n)',
    'typealias Paint = Color\ntypealias Ink = Paint\nlet c = Ink.red',
    '.foregroundStyle(\n .white\n)',
    'let c: Color = .init(red: 1, green: 0, blue: 0)',
    'let c: Color = .blue',
    'let c = Color(.sRGB, red: 1, green: 1, blue: 0)',
    'UIColor(displayP3Red: 1, green: 0, blue: 0, alpha: 1)',
  ])
    assert.ok(rawColors(source).length > 0, source);
});

test('semantic usage, transparent paint, comments and strings remain valid controls', () => {
  for (const source of [
    '.foregroundStyle(JovieColor.textPrimary)',
    'Color.clear',
    '.foregroundStyle(.primary)',
    '// Color.white\n/* Color.red /* nested Color.blue */ */',
    'Text("Color.white")',
    'let text = #"Color.red"#',
    'let text = """\nColor.blue\n"""',
  ])
    assert.deepEqual(rawColors(source), [], source);
  const source = '// Color.white\nlet x = Color.red';
  assert.equal(maskSwift(source).length, source.length);
  assert.equal(rawColors(source)[0].line, 2);
});

test('QR exception is exact, bounded and restricted to the canonical owner', () => {
  const exceptions = manifest.exceptions;
  const path = manifest.theme;
  const allowed = 'enum JovieColor {\nstatic let qrSurface = Color.white\n}';
  const check = (source = allowed, file = path) =>
    exemptPaint(source, file, exceptions);
  assert.deepEqual(check(), { rows: [], issues: [] });
  assert.equal(
    check(allowed.replace('qrSurface', 'arbitrarySurface')).rows.length,
    1
  );
  assert.equal(check(allowed.replace('JovieColor', 'Feature')).rows.length, 1);
  assert.equal(check(allowed, 'feature.swift').rows.length, 1);
  assert.ok(
    check(allowed.replace('\n}', '\nstatic let qrSurface = Color.white\n}'))
      .issues.length
  );
  assert.throws(
    () => exemptPaint(allowed, path, [{ ...exceptions[0], reason: '' }]),
    /reason/
  );
});

test('raw paint debt permits neither growth nor silent failure to lower the floor', () => {
  assert.deepEqual(paintRatchet({ known: 1 }, { known: 1 }), []);
  assert.ok(paintRatchet({ known: 2 }, { known: 1 }).length);
  assert.ok(paintRatchet({ other: 1 }, { known: 1 }).length);
  assert.ok(paintRatchet({}, { known: 1 }).length);
  assert.deepEqual(paintRatchet({}, {}), []);
});

test('painted text and pressed CTA pairs clear their actual contrast floor', () => {
  const values = semanticDeclarations(css);
  for (const role of [
    '--color-text-primary-token',
    '--color-text-secondary-token',
    '--color-text-tertiary-token',
  ]) {
    for (const surface of Object.values(palette.elevations.dark))
      assert.ok(contrastRatio(resolveSemantic(role, values), surface) >= 4.5);
  }
  const foreground = resolveSemantic('--noir-ion-text-inverse', values);
  const background = resolveSemantic('--color-btn-primary-bg', values);
  assert.ok(contrastRatio(foreground, background) >= 4.5);
  assert.ok(contrastRatio('#FFFFFF', '#000000', 0.8) >= 4.5);
  assert.ok(contrastRatio('#FFFFFF', '#000000', 0.1) < 4.5);
  // This deliberate negative prevents equating a status accent with readable body ink.
  assert.ok(
    contrastRatio(palette.accents.hex.red, palette.elevations.dark.floating) <
      4.5
  );
});

test('native concentric geometry uses named tokens and excludes pills/circles', () => {
  const geometry = {
    shape: 'rounded',
    outer: 'outer',
    inner: 'inner',
    inset: 'inset',
    tokens: { outer: 16, inner: 12, inset: 4 },
  };
  assert.deepEqual(checkConcentric(geometry), []);
  assert.deepEqual(
    checkConcentric({ ...geometry, tokens: { ...geometry.tokens, outer: 12 } }),
    ['outer must equal inner + inset']
  );
  assert.deepEqual(checkConcentric({ ...geometry, outer: '16' }), [
    'Nested geometry must resolve named tokens',
  ]);
  assert.ok(
    checkConcentric({
      ...geometry,
      tokens: { outer: 16, inner: 20, inset: -4 },
    }).length
  );
  for (const shape of ['pill', 'circle', 'unrelated'])
    assert.deepEqual(checkConcentric({ shape }), []);
  assert.ok(checkConcentric({ shape: 'unknown' }).length);
});

test('native spacing reuses existing scanner/tiering; comments and strings are not code', () => {
  assert.deepEqual(nativeSpacing('.padding(16)\nVStack(spacing: 8) {}'), []);
  assert.deepEqual(
    nativeSpacing('.padding(.horizontal, 14)\nVStack(spacing: 10) {}'),
    [14, 10]
  );
  assert.deepEqual(nativeSpacing('// .padding(14)\nText("spacing: 10")'), []);
});

test('real nested Swift modifier anatomy rejects mismatches and numeric token bypass', () => {
  const tokens = geometryTokens(
    readFileSync(resolve(ROOT, manifest.theme), 'utf8')
  );
  const source =
    '.clipShape(RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))\n.padding(JovieSpacing.xSmall)\n.background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.xLarge))';
  assert.deepEqual(scanConcentricSwift(source, tokens), []);
  assert.ok(
    scanConcentricSwift(
      source.replace('JovieRadius.xLarge', 'JovieRadius.large'),
      tokens
    ).length
  );
  assert.ok(
    scanConcentricSwift(source.replace('JovieSpacing.xSmall', '4'), tokens)
      .length
  );
  assert.deepEqual(
    scanConcentricSwift(
      source.replace('JovieRadius.large', 'JovieRadius.pill'),
      tokens
    ),
    []
  );
  assert.deepEqual(
    scanConcentricSwift('Circle().padding(4).background(Circle())', tokens),
    []
  );
  assert.throws(() => geometryTokens('no token owners'), /Missing/);
});

test('actual native palette and production test mount conform', () => {
  assert.deepEqual(checkNativeDesign(), []);
});

test('the selected source gate goes red on wrong native paint/token bypass and green after repair', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-native-design-fixture-'));
  function copyFile(path) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    copyFileSync(resolve(ROOT, path), resolve(root, path));
  }
  function copySwift(directory) {
    for (const entry of readdirSync(resolve(ROOT, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) copySwift(path);
      else if (path.endsWith('.swift')) copyFile(path);
    }
  }
  try {
    copySwift('apps/ios/Jovie');
    for (const path of [
      MANIFEST,
      manifest.palette,
      manifest.semantics,
      manifest.paintDebt,
    ])
      copyFile(path);
    const git = args => {
      const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(result.status, 0, result.stderr);
    };
    git(['init', '-q']);
    git(['add', '.']);
    git([
      '-c',
      'user.name=Native fixture',
      '-c',
      'user.email=fixture@invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'immutable native fixture base',
    ]);
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const themePath = resolve(root, manifest.theme);
    const theme = readFileSync(themePath, 'utf8');
    const viewPath = resolve(root, manifest.strictSources[0]);
    const view = readFileSync(viewPath, 'utf8');
    for (const path of [
      manifest.theme,
      manifest.palette,
      manifest.semantics,
      MANIFEST,
    ]) {
      for (const event of ['pull_request', 'merge_group', 'push']) {
        const selected = selectSourceGuards(event, [path]).find(
          guard => guard.id === 'native-design-system'
        );
        assert.ok(selected, `${event} ${path}`);
        if (
          event !== 'pull_request' ||
          [manifest.semantics, MANIFEST].includes(path)
        )
          continue;
        const script = selected.command.split(' && ')[0].split(' ')[1];
        const run = extra =>
          spawnSync(
            process.execPath,
            [resolve(ROOT, script), '--root', root, ...extra],
            { encoding: 'utf8', timeout: 10000 }
          );
        assert.equal(run([]).status, 0);
        writeFileSync(themePath, theme.replace('0x11AFFF', '0x000001'));
        assert.equal(run([]).status, 1);
        assert.equal(run(['--write']).status, 0);
        assert.equal(readFileSync(themePath, 'utf8'), theme);
      }
    }
    writeFileSync(
      viewPath,
      view.replace(
        'changelogWhatsNew = WhatsNewUITestFixture.unseen()',
        'showWhatsNew = true'
      )
    );
    assert.ok(
      checkNativeDesign(root).some(issue =>
        issue.includes('production changelog')
      )
    );
    const production = view.indexOf('struct JovieChangelogWhatsNewView: View');
    writeFileSync(
      viewPath,
      view.slice(0, production) +
        view
          .slice(production)
          .replace(
            '.foregroundStyle(JovieColor.textTertiary)',
            '.foregroundStyle(JovieColor.accentBlue)'
          )
    );
    assert.ok(
      checkNativeDesign(root).some(issue => issue.includes('neutral semantic'))
    );
    writeFileSync(
      viewPath,
      view + '\nlet added = Color(\n red: 1, green: 0, blue: 0)\n.padding(14)'
    );
    const failures = checkNativeDesign(root);
    assert.ok(failures.some(issue => issue.includes('raw color')));
    assert.ok(failures.some(issue => issue.includes('off-grid spacing')));
    writeFileSync(viewPath, view);
    const floorPath = resolve(root, manifest.paintDebt);
    const floorSource = readFileSync(floorPath, 'utf8');
    const floor = JSON.parse(floorSource);
    const key = Object.keys(floor.identities)[0];
    floor.identities[key]++;
    writeFileSync(floorPath, JSON.stringify(floor));
    assert.ok(
      checkNativeDesign(root).some(issue =>
        issue.includes('floor may not grow')
      )
    );
    writeFileSync(floorPath, floorSource);
    writeFileSync(
      themePath,
      theme.replace(
        'static let errorText = textPrimary',
        'static let errorText = statusDanger'
      )
    );
    assert.ok(
      checkNativeDesign(root).some(issue => issue.includes('semantic alias'))
    );
    writeFileSync(themePath, theme);
    assert.deepEqual(checkNativeDesign(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
