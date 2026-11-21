import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

const root = path.resolve(import.meta.dirname, '..');
const pin = path.join(root, '.github/scripts/pin-xcode-27.sh');
const developerDir = '/Applications/Xcode_27.1.app/Contents/Developer';

function runPin(t, { present = true, sdk = '27.1' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jovie-xcode-pin-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envFile = path.join(dir, 'github-env');
  const harness = path.join(dir, 'harness.sh');
  writeFileSync(envFile, '');
  // Fake only the app-presence probe and Apple commands, without installing
  // anything in /Applications or changing the production script's pin.
  writeFileSync(
    harness,
    `
function [() {
  if builtin [ "$#" -eq 4 ] && builtin [ "$1" = '!' ] && builtin [ "$2" = '-d' ] && builtin [ "$3" = '/Applications/Xcode_27.1.app' ]; then
    builtin [ "$PIN_PRESENT" != 'true' ]; return
  fi
  builtin [ "$@"
}
xcode-select() { echo /Applications/Xcode.app/Contents/Developer; }
xcodebuild() {
  echo "developer=$DEVELOPER_DIR args=$*"
  if builtin [ "$1" = '-version' ]; then echo 'Xcode 27.1'; fi
  if builtin [ "$1" = '-showsdks' ]; then echo "iOS $PIN_SDK -sdk iphoneos$PIN_SDK"; fi
}
xcrun() {
  case "$*" in
    '--sdk iphoneos --show-sdk-version') echo "$PIN_SDK" ;;
    '--sdk iphoneos --show-sdk-path') echo "$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS$PIN_SDK.sdk" ;;
    *) return 1 ;;
  esac
}
`
  );
  const result = spawnSync('bash', [pin], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      BASH_ENV: harness,
      GITHUB_ENV: envFile,
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
      PIN_PRESENT: String(present),
      PIN_SDK: sdk,
    },
  });
  return {
    ...result,
    output: result.stdout + result.stderr,
    persisted: readFileSync(envFile, 'utf8'),
  };
}

test('pins exactly Xcode 27.1 for current and subsequent steps', t => {
  const result = runPin(t);
  assert.equal(result.status, 0, result.output);
  assert.equal(result.persisted, `DEVELOPER_DIR=${developerDir}\n`);
  assert.match(result.output, /Xcode 27\.1/);
  assert.match(result.output, /-showsdks/);
  assert.match(result.output, /iphoneos27\.1/);
  assert.match(result.output, new RegExp(`developer=${developerDir}`));
});

test('missing Xcode fails with diagnostics and never persists a fallback', t => {
  const result = runPin(t, { present: false });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /::error::.*Xcode_27\.1/);
  assert.match(result.output, /Available Xcode/);
  assert.match(result.output, /DEVELOPER_DIR=/);
  assert.match(result.output, /xcode-select/);
  assert.match(result.output, /runs-on.*unchanged/);
  assert.equal(result.persisted, '');
});

for (const sdk of ['26.5', '28.0', 'unavailable']) {
  test(`rejects selected iPhone OS SDK ${sdk}`, t => {
    const result = runPin(t, { sdk });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /::error::.*27\.x/);
    assert.equal(result.persisted, '');
  });
}

test('all four iOS jobs pin after checkout and before toolchain use', () => {
  for (const [file, job] of [
    ['ios-testflight.yml', 'beta'],
    ['ios-ci.yml', 'test'],
    ['ios-app-store-graphics.yml', 'graphics'],
    ['ios-signing-bootstrap.yml', 'bootstrap'],
  ]) {
    const workflow = readFileSync(
      path.join(root, '.github/workflows', file),
      'utf8'
    );
    const source = workflow.split(`\n  ${job}:`)[1].split(/\n  [\w-]+:/)[0];
    const pin = source.indexOf(
      '- name: Pin Xcode 27.1\n        run: bash .github/scripts/pin-xcode-27.sh'
    );
    const checkout = source.search(/actions\/checkout@/);
    assert.ok(checkout >= 0 && pin > checkout, file);
    // ios-ci runs lint and node tests first so those stay runnable on
    // macos-26, where the pin itself is expected to fail today.
    if (file !== 'ios-ci.yml') {
      assert.match(
        source,
        /actions\/checkout@[\s\S]*?\n\n      - name: Pin Xcode 27\.1\n        run: bash \.github\/scripts\/pin-xcode-27\.sh/,
        file
      );
    } else {
      assert.match(
        source,
        /Test iOS release configuration scripts[\s\S]*Pin Xcode 27\.1[\s\S]*Show Xcode version/
      );
    }
    const firstToolUse = source.search(
      /xcodebuild -|bundle exec fastlane|xcrun simctl|Restore Swift package cache/
    );
    assert.ok(
      firstToolUse < 0 || source.indexOf('pin-xcode-27.sh') < firstToolUse,
      file
    );
  }
});

test('TestFlight runs the artifact SDK guard after archive and before upload', () => {
  const workflow = readFileSync(
    path.join(root, '.github/workflows/ios-testflight.yml'),
    'utf8'
  );
  const archive = workflow.indexOf('bundle exec fastlane ios beta_archive');
  const guard = workflow.indexOf('- name: Verify archived IPA minimum SDK');
  const upload = workflow.indexOf('bundle exec fastlane ios beta_upload');
  assert.ok(archive >= 0 && guard > archive && upload > guard);
  const step = workflow.slice(
    guard,
    workflow.lastIndexOf('      - name:', upload)
  );
  assert.match(
    step,
    /unzip -p.*artifacts\/ios-build\/Jovie\.ipa.*Payload\/Jovie\.app\/Info.plist/
  );
  assert.match(step, /plutil -convert xml1/);
  assert.match(
    step,
    /bash \.github\/scripts\/run-app-store-min-sdk-guard\.sh --info-plist/
  );
  assert.doesNotMatch(
    step,
    /continue-on-error|--showsdks|--dtsdkname|\|\| true/
  );
  const wrapper = readFileSync(
    path.join(root, '.github/scripts/run-app-store-min-sdk-guard.sh'),
    'utf8'
  );
  assert.match(wrapper, /if \[ ! -f "\$script" \]/);
  assert.match(wrapper, /::error::Missing min-SDK guard/);
  assert.match(wrapper, /verify-app-store-min-sdk\.mjs/);
});

function runSdkStep(
  t,
  { missing = false, rejected = false, brokenIpa = false } = {}
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jovie-sdk-step-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const scriptDir = path.join(dir, 'apps/ios/scripts');
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(path.join(dir, '.github/scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'artifacts/ios-build'), { recursive: true });
  writeFileSync(
    path.join(dir, '.github/scripts/run-app-store-min-sdk-guard.sh'),
    readFileSync(
      path.join(root, '.github/scripts/run-app-store-min-sdk-guard.sh'),
      'utf8'
    )
  );
  mkdirSync(path.join(dir, 'Payload/Jovie.app'), { recursive: true });
  writeFileSync(
    path.join(dir, 'Payload/Jovie.app/Info.plist'),
    '<plist><dict><key>DTSDKName</key><string>iphoneos27.1</string></dict></plist>'
  );
  if (!brokenIpa) {
    const zip = spawnSync(
      'zip',
      ['-q', 'artifacts/ios-build/Jovie.ipa', 'Payload/Jovie.app/Info.plist'],
      { cwd: dir }
    );
    assert.equal(zip.status, 0);
  }
  if (!missing) {
    writeFileSync(
      path.join(scriptDir, 'verify-app-store-min-sdk.mjs'),
      `
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.argv[2], '--info-plist');
assert.match(readFileSync(process.argv[3], 'utf8'), /iphoneos27\\.1/);
console.log('guard observed the IPA plist');
process.exitCode = ${rejected ? 1 : 0};
`
    );
  }
  const workflow = readFileSync(
    path.join(root, '.github/workflows/ios-testflight.yml'),
    'utf8'
  );
  const source = workflow
    .split('      - name: Verify archived IPA minimum SDK')[1]
    .split('      - name:')[0];
  const run = source.split('        run: |\n')[1].replace(/^          /gm, '');
  const harness = path.join(dir, 'harness.sh');
  // Input fixture is already XML. The workflow's real conversion is also
  // exercised separately on this Mac with the companion guard.
  writeFileSync(harness, 'plutil() { echo "converted $*"; }\n');
  const result = spawnSync('bash', ['-c', run], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, BASH_ENV: harness, RUNNER_TEMP: dir },
  });
  return { ...result, output: result.stdout + result.stderr };
}

test('pre-upload step checks the plist extracted from the actual IPA', t => {
  const result = runSdkStep(t);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /guard observed the IPA plist/);
});

test('pre-upload step fails closed when the companion guard is absent', t => {
  const result = runSdkStep(t, { missing: true });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /::error::Missing min-SDK guard/);
});

test('pre-upload step preserves a rejecting guard exit status', t => {
  const result = runSdkStep(t, { rejected: true });
  assert.equal(result.status, 1);
  assert.match(result.output, /guard observed the IPA plist/);
});

test('pre-upload step never substitutes runner SDKs for a missing IPA', t => {
  const result = runSdkStep(t, { brokenIpa: true });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.output, /guard observed/);
});
