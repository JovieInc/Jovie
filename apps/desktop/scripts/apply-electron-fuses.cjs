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
  // Do NOT touch NSAllowsLocalNetworking or NSExceptionDomains here.
  // electron-builder injects localhost ATS allowances into Info.plist for
  // non-MAS builds because electron-updater's MacUpdater serves the
  // downloaded update to Squirrel.Mac over a loopback HTTP server
  // (http://127.0.0.1:<port>), and Squirrel's NSURLSession download is
  // subject to ATS. Hardening those keys away makes the install handoff
  // fail with ATS error -1022 — they are load-bearing for auto-update.
}

module.exports = async function applyElectronFuses(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import(
    '@electron/fuses'
  );

  // The `dir` target (local + staging test builds) does not inject the
  // `ElectronAsarIntegrity` hash into Info.plist the way the signed dmg/zip
  // release targets do. With asar-integrity validation enabled the packaged
  // app then fails its sandbox bootstrap ("sandboxed_renderer.bundle.js script
  // failed to run") and renders blank. Disable ONLY that fuse for dir-only
  // test builds; the published dmg/zip release builds keep the full hardened
  // fuse set. (JOV-3835)
  const targets = context.targets || [];
  const isDirOnlyTestBuild =
    targets.length > 0 && targets.every(target => target.name === 'dir');

  await flipFuses(getElectronBinaryPath(context), {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: true,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: !isDirOnlyTestBuild,
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
