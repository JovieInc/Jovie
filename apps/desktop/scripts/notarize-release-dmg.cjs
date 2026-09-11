const { execFile } = require('node:child_process');
const { createRequire } = require('node:module');

function loadBlockMapBuilder() {
  const electronBuilderPackage = require.resolve(
    'electron-builder/package.json'
  );
  const electronBuilderRequire = createRequire(electronBuilderPackage);
  const appBuilderPackage = electronBuilderRequire.resolve(
    'app-builder-lib/package.json'
  );
  const appBuilderRequire = createRequire(appBuilderPackage);
  return appBuilderRequire('app-builder-lib/out/targets/blockmap/blockmap')
    .buildBlockMap;
}

function runXcrun(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'xcrun',
      args,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stderr, stdout });
      }
    );
  });
}

function runCodesign(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'codesign',
      args,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stderr, stdout });
      }
    );
  });
}

async function notarizeReleaseDmg(
  event,
  {
    buildBlockMap = loadBlockMapBuilder(),
    environment = process.env,
    executeCodesign = runCodesign,
    executeXcrun = runXcrun,
  } = {}
) {
  if (!event?.file?.endsWith('.dmg')) return;
  if (environment.JOVIE_RELEASE_DMG !== 'true') return;
  if (!event.updateInfo) {
    throw new Error(
      'Release DMG update metadata is missing before notarization.'
    );
  }

  const credentials = {
    issuer: environment.APPLE_API_ISSUER,
    key: environment.APPLE_API_KEY,
    keyId: environment.APPLE_API_KEY_ID,
    signingIdentity: environment.JOVIE_MAC_SIGNING_IDENTITY,
  };
  for (const [name, value] of Object.entries(credentials)) {
    if (!value) {
      throw new Error(
        `Release DMG notarization credential is missing: ${name}.`
      );
    }
  }

  await executeCodesign([
    '--force',
    '--timestamp',
    '--sign',
    credentials.signingIdentity,
    event.file,
  ]);
  await executeCodesign(['--verify', '--verbose=2', event.file]);

  const result = await executeXcrun([
    'notarytool',
    'submit',
    event.file,
    '--key',
    credentials.key,
    '--key-id',
    credentials.keyId,
    '--issuer',
    credentials.issuer,
    '--wait',
    '--timeout',
    '20m',
    '--output-format',
    'json',
  ]);
  let notarization;
  try {
    notarization = JSON.parse(result.stdout);
  } catch {
    throw new Error('Apple notarization response was not valid JSON.');
  }
  if (
    notarization?.status !== 'Accepted' ||
    typeof notarization.id !== 'string' ||
    notarization.id.length === 0
  ) {
    throw new Error('Apple did not accept the release desktop image.');
  }

  await executeXcrun(['stapler', 'staple', event.file]);
  await executeXcrun(['stapler', 'validate', event.file]);

  const updateInfo = await buildBlockMap(
    event.file,
    'gzip',
    `${event.file}.blockmap`
  );
  if (
    !Number.isInteger(updateInfo?.size) ||
    updateInfo.size <= 0 ||
    typeof updateInfo.sha512 !== 'string' ||
    updateInfo.sha512.length === 0
  ) {
    throw new Error('Final release DMG update metadata is malformed.');
  }
  Object.assign(event.updateInfo, updateInfo);
}

module.exports = notarizeReleaseDmg;
module.exports.notarizeReleaseDmg = notarizeReleaseDmg;
