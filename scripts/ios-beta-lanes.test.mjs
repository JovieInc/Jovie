import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const fastfile = path.resolve(import.meta.dirname, '../fastlane/Fastfile');

// Run the actual Fastfile DSL with Apple/signing actions replaced. This proves
// the split can execute in independent processes without signing or uploading.
function runLane(t, lane, { rejectLease = false, rejectUpload = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jovie-beta-lanes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    path.join(dir, 'lease.json'),
    JSON.stringify({ sourceSha: 'certified' })
  );
  writeFileSync(path.join(dir, 'Jovie.ipa'), 'exact-ipa');
  const result = spawnSync(
    'ruby',
    [
      '-e',
      `
require 'fileutils'
$lanes = {}
$events = []
def default_platform(*); end
def opt_out_usage; end
def platform(*); yield; end
def desc(*); end
def lane(name, &block); $lanes[name] = block; end
def beta_archive(**options); $lanes.fetch(:beta_archive).call(options); end
def beta_upload(**options); $lanes.fetch(:beta_upload).call(options); end
load ARGV.fetch(0)
Object.send(:remove_const, :DEFAULT_ARTIFACT_DIR)
DEFAULT_ARTIFACT_DIR = ENV.fetch('ARTIFACT_DIR')
def app_store_api_key_from_env; 'api-key'; end
def require_env!(*); 'required'; end
def require_match_git_auth!; end
def write_ios_configuration(**); end
def sh(*); end
def setup_ci; end
def ensure_app_store_assets!(**); end
def match(**); end
def match_git_auth_options; {}; end
def distribution_certificate_name(**); 'distribution'; end
def update_code_signing_settings(**); end
def installed_match_profile_path; '/fixture/profile'; end
def gym(**options)
  $events << ['archive', options]
  File.write(File.join(DEFAULT_ARTIFACT_DIR, 'Jovie.ipa'), 'exact-ipa')
end
def verify_release_sha_is_current_main!
  $events << ['lease']
  raise 'rejected lease' if ENV['REJECT_LEASE'] == 'true'
end
def upload_to_testflight(**options)
  $events << ['upload', options]
  raise 'rejected upload' if ENV['REJECT_UPLOAD'] == 'true'
end
begin
  $lanes.fetch(ARGV.fetch(1).to_sym).call({})
rescue => error
  warn error.message
  puts JSON.generate($events)
  exit 1
end
puts JSON.generate($events)
`,
      fastfile,
      lane,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ARTIFACT_DIR: dir,
        IOS_BUILD_NUMBER: '7184',
        TESTFLIGHT_LEASE_PATH: path.join(dir, 'lease.json'),
        REJECT_LEASE: String(rejectLease),
        REJECT_UPLOAD: String(rejectUpload),
      },
      // The lease and IPA are fixtures; no real credentials or Apple call.
      input: '',
    }
  );
  return {
    ...result,
    dir,
    events: result.stdout.trim() ? JSON.parse(result.stdout.trim()) : [],
  };
}

test('archive lane signs and exports the same IPA without uploading', t => {
  const result = runLane(t, 'beta_archive');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.events.map(([event]) => event),
    ['archive', 'lease']
  );
  const options = result.events[0][1];
  assert.equal(options.output_name, 'Jovie.ipa');
  assert.equal(options.export_method, 'app-store');
  assert.equal(options.export_options.signingStyle, 'manual');
  assert.equal(
    options.export_options.provisioningProfiles['ie.jov.Jovie'],
    'match AppStore ie.jov.Jovie'
  );
});

test('upload lane rechecks the lease and never rebuilds the IPA', t => {
  const result = runLane(t, 'beta_upload', { rejectUpload: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /rejected upload/);
  assert.equal(
    existsSync(path.join(result.dir, 'testflight-upload-attestation.json')),
    false
  );
  assert.deepEqual(
    result.events.map(([event]) => event),
    ['lease', 'upload']
  );
  assert.equal(result.events[1][1].ipa, path.join(result.dir, 'Jovie.ipa'));
  assert.equal(result.events[1][1].distribute_external, false);
  assert.equal(result.events[1][1].skip_waiting_for_build_processing, false);
});

test('a rejected final lease prevents the upload action', t => {
  const result = runLane(t, 'beta_upload', { rejectLease: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /rejected lease/);
  assert.equal(
    existsSync(path.join(result.dir, 'testflight-upload-attestation.json')),
    false
  );
  assert.deepEqual(result.events, [['lease']]);
});

test('attestation is still written only after upload succeeds', () => {
  const source = readFileSync(fastfile, 'utf8');
  const upload = source.slice(source.indexOf('  lane :beta_upload do'));
  assert.ok(
    upload.indexOf('upload_to_testflight(') < upload.indexOf('File.write(')
  );
  assert.match(upload, /schema: "jovie-testflight-binary\/v1"/);
  assert.match(
    upload,
    /Digest::SHA256\.file\(File\.join\(DEFAULT_ARTIFACT_DIR, "Jovie\.ipa"\)\)/
  );
});

test('local beta wrapper preserves upload order and exact binary attestation', t => {
  const result = runLane(t, 'beta');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.events.map(([event]) => event),
    ['archive', 'lease', 'lease', 'upload']
  );
  const attestation = JSON.parse(
    readFileSync(
      path.join(result.dir, 'testflight-upload-attestation.json'),
      'utf8'
    )
  );
  assert.equal(attestation.schema, 'jovie-testflight-binary/v1');
  assert.equal(attestation.buildNumber, '7184');
  assert.deepEqual(attestation.lease, { sourceSha: 'certified' });
  assert.match(attestation.binarySha256, /^[0-9a-f]{64}$/);
});
