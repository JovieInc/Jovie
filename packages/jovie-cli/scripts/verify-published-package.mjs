import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const NAME = '@jovie/cli';
const MCP_NAME = 'io.github.JovieInc/jovie';

// Resuming registry publication never permits rebuilding a different npm release.
export function verifyPublishedPackage(metadata, archive, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid release version');
  if (
    metadata?.name !== NAME ||
    metadata.version !== version ||
    metadata.mcpName !== MCP_NAME ||
    metadata.repository?.url !== 'git+https://github.com/JovieInc/Jovie.git' ||
    metadata.repository.directory !== 'packages/jovie-cli' ||
    metadata.dist?.attestations?.provenance?.predicateType !==
      'https://slsa.dev/provenance/v1'
  ) {
    throw new Error('Published package identity/provenance does not match');
  }
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  if (metadata.dist.integrity !== integrity) {
    throw new Error(
      'Published package bytes differ from the tested staged package'
    );
  }
}

export function createRegistryManifest(template, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid release version');
  const entry = template?.packages?.[0];
  if (
    template?.name !== MCP_NAME ||
    template.repository?.url !== 'https://github.com/JovieInc/Jovie' ||
    template.packages.length !== 1 ||
    entry?.registryType !== 'npm' ||
    entry.identifier !== NAME ||
    entry.transport?.type !== 'stdio' ||
    entry.packageArguments?.length !== 1 ||
    entry.packageArguments[0]?.type !== 'positional' ||
    entry.packageArguments[0]?.value !== 'mcp'
  ) {
    throw new Error('Registry destination or executable does not match');
  }
  const manifest = structuredClone(template);
  manifest.$schema =
    'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
  manifest.version = version;
  manifest.packages[0].version = version;
  return manifest;
}

export function verifyRegistryReadback(result, expected) {
  const actual = result?.server;
  if (
    actual?.name !== expected.name ||
    actual.version !== expected.version ||
    !isDeepStrictEqual(actual.repository, expected.repository) ||
    !isDeepStrictEqual(actual.packages, expected.packages)
  ) {
    throw new Error(
      'Official MCP registry did not read back the exact published identity.'
    );
  }
}

export function verifyAndStageRegistry({
  metadataPath,
  packPath,
  stagingDir,
  templatePath,
  outputPath,
  version,
}) {
  const packs = JSON.parse(readFileSync(packPath, 'utf8'));
  const pack = packs?.[0];
  if (
    !Array.isArray(packs) ||
    packs.length !== 1 ||
    pack?.name !== NAME ||
    pack.version !== version ||
    typeof pack.filename !== 'string' ||
    basename(pack.filename) !== pack.filename ||
    !pack.filename.endsWith('.tgz')
  )
    throw new Error('Invalid staged npm archive receipt');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  verifyPublishedPackage(
    metadata,
    readFileSync(resolve(stagingDir, pack.filename)),
    version
  );
  const manifest = createRegistryManifest(
    JSON.parse(readFileSync(templatePath, 'utf8')),
    version
  );
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  verifyAndStageRegistry({
    metadataPath: process.env.METADATA_PATH,
    packPath: process.env.MCP_PACK_PATH,
    stagingDir: process.env.STAGING_DIR,
    templatePath: 'packages/jovie-cli/server.json',
    outputPath: process.env.MCP_MANIFEST_PATH,
    version: process.env.RELEASE_VERSION,
  });
}
