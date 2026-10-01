import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRegistryManifest,
  verifyAndStageRegistry,
  verifyPublishedPackage,
  verifyRegistryReadback,
} from './verify-published-package.mjs';

const version = '26.9.16';
const bytes = Buffer.from('the exact tested npm archive');
function metadata() {
  return {
    name: '@jovie/cli',
    version,
    mcpName: 'io.github.JovieInc/jovie',
    repository: {
      url: 'git+https://github.com/JovieInc/Jovie.git',
      directory: 'packages/jovie-cli',
    },
    dist: {
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      attestations: {
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    },
  };
}
function template() {
  return JSON.parse(
    readFileSync(new URL('../server.json', import.meta.url), 'utf8')
  );
}

describe('published artifact and registry identity', () => {
  it('accepts only byte-identical tested archive and stamps an immutable template copy', () => {
    expect(() =>
      verifyPublishedPackage(metadata(), bytes, version)
    ).not.toThrow();
    const original = template();
    const manifest = createRegistryManifest(original, version);
    expect(original.version).toBe('0.0.0');
    expect(manifest.version).toBe(version);
    expect(manifest.packages[0].version).toBe(version);
    expect(manifest.$schema).toContain('/2025-12-11/');
  });
  it.each(['name', 'version', 'mcpName', 'repository', 'dist'])(
    'rejects missing/wrong publication %s',
    field => {
      const value = metadata();
      delete value[field];
      expect(() => verifyPublishedPackage(value, bytes, version)).toThrow();
    }
  );
  it.each([
    value => {
      value.repository.url = 'git+https://github.com/attacker/Jovie.git';
    },
    value => {
      value.repository.directory = 'another-package';
    },
    value => {
      value.dist.attestations.provenance.predicateType = 'unverified';
    },
    value => {
      value.dist.integrity = 'sha512-forged';
    },
  ])('rejects mismatched provenance or digest', change => {
    const value = metadata();
    change(value);
    expect(() => verifyPublishedPackage(value, bytes, version)).toThrow();
  });
  it('rejects a tested source change after the npm release', () => {
    expect(() =>
      verifyPublishedPackage(
        metadata(),
        Buffer.from('different build'),
        version
      )
    ).toThrow(/bytes differ/);
  });
  it.each(['', '0.0.0-dev', '../26.9.16'])(
    'rejects invalid version %s in both boundaries',
    invalid => {
      expect(() => verifyPublishedPackage(metadata(), bytes, invalid)).toThrow(
        /version/
      );
      expect(() => createRegistryManifest(template(), invalid)).toThrow(
        /version/
      );
    }
  );
  it.each([
    value => {
      value.name = 'io.github.other/jovie';
    },
    value => {
      value.repository.url = 'https://github.com/other/Jovie';
    },
    value => {
      value.packages.push(structuredClone(value.packages[0]));
    },
    value => {
      value.packages[0].registryType = 'pypi';
    },
    value => {
      value.packages[0].identifier = '@other/cli';
    },
    value => {
      value.packages[0].transport.type = 'streamable-http';
    },
    value => {
      value.packages[0].packageArguments = [];
    },
    value => {
      value.packages[0].packageArguments[0].type = 'named';
    },
    value => {
      value.packages[0].packageArguments[0].value = 'profile';
    },
  ])('rejects any destination/transport/executable change', change => {
    const value = template();
    change(value);
    expect(() => createRegistryManifest(value, version)).toThrow(/destination/);
  });
});

describe('real staged archive receipts', () => {
  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-mcp-receipt-'));
    const options = {
      metadataPath: join(dir, 'metadata.json'),
      packPath: join(dir, 'pack.json'),
      stagingDir: dir,
      templatePath: join(dir, 'template.json'),
      outputPath: join(dir, 'registry.json'),
      version,
    };
    writeFileSync(options.metadataPath, JSON.stringify(metadata()));
    writeFileSync(options.templatePath, JSON.stringify(template()));
    writeFileSync(join(dir, 'cli.tgz'), bytes);
    writeFileSync(
      options.packPath,
      JSON.stringify([{ name: '@jovie/cli', version, filename: 'cli.tgz' }])
    );
    return options;
  }
  it('reads actual archive bytes and writes only the verified manifest', () => {
    const options = fixture();
    verifyAndStageRegistry(options);
    expect(JSON.parse(readFileSync(options.outputPath, 'utf8')).version).toBe(
      version
    );
  });
  it.each([
    null,
    [],
    {},
    [{ name: '@other/cli', version, filename: 'cli.tgz' }],
    [{ name: '@jovie/cli', version: '26.9.15', filename: 'cli.tgz' }],
    [{ name: '@jovie/cli', version, filename: '../cli.tgz' }],
    [{ name: '@jovie/cli', version, filename: 'cli.txt' }],
    [{ name: '@jovie/cli', version }],
    [{ name: '@jovie/cli', version, filename: 'cli.tgz' }, {}],
  ])('rejects malformed or escaped pack receipts', receipt => {
    const options = fixture();
    writeFileSync(options.packPath, JSON.stringify(receipt));
    expect(() => verifyAndStageRegistry(options)).toThrow(/archive receipt/);
  });
});

describe('official registry readback', () => {
  it('verifies the actual executable, transport and repository while allowing registry metadata', () => {
    const expected = createRegistryManifest(template(), version);
    expect(() =>
      verifyRegistryReadback(
        { server: structuredClone(expected), _meta: { status: 'active' } },
        expected
      )
    ).not.toThrow();
  });
  it.each([
    actual => {
      actual.name = 'io.github.other/jovie';
    },
    actual => {
      actual.version = '26.9.15';
    },
    actual => {
      actual.repository.url = 'https://github.com/other/Jovie';
    },
    actual => {
      actual.packages[0].identifier = '@other/cli';
    },
    actual => {
      actual.packages[0].version = '26.9.15';
    },
    actual => {
      actual.packages[0].transport.type = 'streamable-http';
    },
    actual => {
      actual.packages[0].packageArguments[0].value = 'report';
    },
    actual => {
      actual.packages.push(structuredClone(actual.packages[0]));
    },
  ])('rejects mismatched public listing fields', change => {
    const expected = createRegistryManifest(template(), version);
    const actual = structuredClone(expected);
    change(actual);
    expect(() => verifyRegistryReadback({ server: actual }, expected)).toThrow(
      /exact published identity/
    );
  });
  it('rejects missing server readback', () => {
    expect(() =>
      verifyRegistryReadback({}, createRegistryManifest(template(), version))
    ).toThrow();
  });
});
