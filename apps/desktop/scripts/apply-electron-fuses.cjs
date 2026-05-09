const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function getElectronBinaryPath(context) {
  const productFilename = context.packager.appInfo.productFilename;

  switch (context.electronPlatformName) {
    case 'darwin':
      return path.join(
        context.appOutDir,
        `${productFilename}.app`,
        'Contents',
        'MacOS',
        productFilename
      );
    case 'win32':
      return path.join(context.appOutDir, `${productFilename}.exe`);
    default:
      return path.join(context.appOutDir, productFilename);
  }
}

async function removeCodeSignatureDirectories(root) {
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch(() => []);

  await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(root, entry.name);
      if (!entry.isDirectory()) return;

      if (entry.name === '_CodeSignature') {
        await fs.rm(entryPath, { recursive: true, force: true });
        return;
      }

      await removeCodeSignatureDirectories(entryPath);
    })
  );
}

async function updateMacInfoPlist(context) {
  const productFilename = context.packager.appInfo.productFilename;
  const infoPlistPath = path.join(
    context.appOutDir,
    `${productFilename}.app`,
    'Contents',
    'Info.plist'
  );

  await execFileAsync('/usr/libexec/PlistBuddy', [
    '-c',
    'Set :NSAppTransportSecurity:NSAllowsArbitraryLoads false',
    infoPlistPath,
  ]);
  await execFileAsync('/usr/libexec/PlistBuddy', [
    '-c',
    'Set :NSAppTransportSecurity:NSAllowsLocalNetworking false',
    infoPlistPath,
  ]);
  await execFileAsync('/usr/libexec/PlistBuddy', [
    '-c',
    'Delete :NSAppTransportSecurity:NSExceptionDomains',
    infoPlistPath,
  ]).catch(() => undefined);
}

module.exports = async function applyElectronFuses(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import(
    '@electron/fuses'
  );

  await flipFuses(getElectronBinaryPath(context), {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: true,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  });

  if (context.electronPlatformName === 'darwin') {
    await updateMacInfoPlist(context);
    await removeCodeSignatureDirectories(context.appOutDir);
  }
};
