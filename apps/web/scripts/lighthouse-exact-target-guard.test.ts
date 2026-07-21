import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createLighthouseArtifactSeal,
  createLighthouseUploadEnvironment,
  readRegularArtifactRecords,
  readSensitiveValues,
  uploadSealedArtifacts,
  validateExactLighthouseAssertions,
  validateExactLighthouseConfig,
  validateExactLighthouseReports,
  validateLighthouseArtifactSeal,
  validateNoSensitiveArtifactValues,
} from './lighthouse-exact-target-guard';

const BASE_URL = 'https://jovie-5sy8pmjja-jovie.vercel.app';
const HOME_URL = `${BASE_URL}/`;
const PROFILE_URL = `${BASE_URL}/tim`;

function configFixture() {
  return {
    ci: {
      collect: {
        numberOfRuns: 1,
        puppeteerScript: 'scripts/lighthouse-vercel-bypass.cjs',
        settings: { disableStorageReset: true },
        url: [HOME_URL, PROFILE_URL],
      },
      assert: {
        includePassedAssertions: true,
        assertMatrix: [
          {
            matchingUrlPattern:
              '^https://jovie-5sy8pmjja-jovie\\.vercel\\.app/$',
            assertions: {
              'categories:accessibility': ['error', { minScore: 0.9 }],
            },
          },
          {
            matchingUrlPattern:
              '^https://jovie-5sy8pmjja-jovie\\.vercel\\.app/tim$',
            assertions: {
              'categories:accessibility': ['error', { minScore: 0.9 }],
            },
          },
        ],
      },
    },
  };
}

function reportFixture(requestedUrl: string, finalUrl = requestedUrl) {
  return { requestedUrl, finalUrl };
}

describe('exact production Lighthouse evidence guard', () => {
  it('allowlists only non-credential process state for the third-party uploader', () => {
    const environment = createLighthouseUploadEnvironment({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      TMPDIR: '/safe/tmp',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'sentinel-actions-id-token',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://sentinel-actions-id.example',
      ACTIONS_RUNTIME_TOKEN: 'sentinel-actions-runtime-token',
      ACTIONS_RUNTIME_URL: 'https://sentinel-actions-runtime.example',
      GH_TOKEN: 'sentinel-gh-token',
      GITHUB_TOKEN: 'sentinel-github-token',
      GITHUB_REPOSITORY: 'sentinel/repository',
      VERCEL_TOKEN: 'sentinel-vercel-token',
      VERCEL_AUTOMATION_BYPASS_SECRET: 'sentinel-vercel-secret',
      SOME_SECRET: 'sentinel-generic-secret',
    });

    expect(environment).toEqual({
      HOME: '/safe/home',
      PATH: '/safe/bin',
      TMPDIR: '/safe/tmp',
    });
    expect(Object.keys(environment).join('\n')).not.toMatch(
      /ACTIONS_|GH_|GITHUB|VERCEL|TOKEN|SECRET/i
    );
  });

  it('fails closed when the uploader has no explicit executable PATH', () => {
    expect(() =>
      createLighthouseUploadEnvironment({
        ACTIONS_RUNTIME_TOKEN: 'sentinel-actions-runtime-token',
      })
    ).toThrow('requires an explicit executable PATH');
  });

  it('accepts complete immutable reports with assertion coverage for every route', () => {
    const config = validateExactLighthouseConfig(configFixture());
    const reports = [reportFixture(HOME_URL), reportFixture(PROFILE_URL)];
    const assertions = [
      { url: HOME_URL, passed: true },
      { url: PROFILE_URL, passed: true },
    ];

    expect(() => validateExactLighthouseReports(config, reports)).not.toThrow();
    expect(() =>
      validateExactLighthouseAssertions(config, assertions)
    ).not.toThrow();
    expect(() =>
      validateNoSensitiveArtifactValues(
        [{ name: 'lhr-1.json', contents: '{"safe":true}' }],
        ['sentinel-bypass-secret', 'sentinel-cookie-value']
      )
    ).not.toThrow();
  });

  it('rejects a successful Lighthouse report that actually audited Vercel login', () => {
    const config = validateExactLighthouseConfig(configFixture());
    const reports = [
      reportFixture(
        HOME_URL,
        'https://vercel.com/login?next=%2Fsso-api%3Furl%3Ddeployment'
      ),
      reportFixture(PROFILE_URL),
    ];

    expect(() => validateExactLighthouseReports(config, reports)).toThrow(
      'finalUrl must be a trusted Jovie deployment URL'
    );
  });

  it('rejects an exact-origin report whose final path differs from the requested route', () => {
    const config = validateExactLighthouseConfig(configFixture());
    const reports = [
      reportFixture(HOME_URL, PROFILE_URL),
      reportFixture(PROFILE_URL),
    ];

    expect(() => validateExactLighthouseReports(config, reports)).toThrow(
      'left its requested deployment origin or path'
    );
  });

  it('fails closed when the assertion matrix produces zero route results', () => {
    const config = validateExactLighthouseConfig(configFixture());
    const reports = [reportFixture(HOME_URL), reportFixture(PROFILE_URL)];

    validateExactLighthouseReports(config, reports);
    expect(() => validateExactLighthouseAssertions(config, [])).toThrow(
      'produced zero results'
    );
  });

  it('rejects a matrix that matches no requested immutable route', () => {
    const fixture = configFixture();
    fixture.ci.assert.assertMatrix[0]!.matchingUrlPattern =
      '^https://jov\\.ie/$';

    expect(() => validateExactLighthouseConfig(fixture)).toThrow(
      'must match exactly one requested route'
    );
  });

  it('rejects malformed requested URLs before collection', () => {
    const fixture = configFixture();
    fixture.ci.collect.url[0] = 'not a url';

    expect(() => validateExactLighthouseConfig(fixture)).toThrow(
      'Lighthouse requested URL 1 is malformed'
    );
  });

  it('rejects a foreign Vercel tenant before collection', () => {
    const fixture = configFixture();
    fixture.ci.collect.url[0] = 'https://jovie-5sy8pmjja-other.vercel.app/';

    expect(() => validateExactLighthouseConfig(fixture)).toThrow(
      'must be a trusted Jovie deployment URL'
    );
  });

  it('rejects collection without the origin-bound bootstrap', () => {
    const fixture = configFixture();
    fixture.ci.collect.puppeteerScript = 'scripts/other-bootstrap.cjs';

    expect(() => validateExactLighthouseConfig(fixture)).toThrow(
      'must use the origin-bound Vercel bootstrap'
    );
  });

  it.each([
    'sentinel-bypass-secret',
    'sentinel-cookie-value',
  ])('rejects artifacts containing protected probe state without echoing it', sensitiveValue => {
    expect(() =>
      validateNoSensitiveArtifactValues(
        [
          {
            name: 'lhr-1.json',
            contents: JSON.stringify({ diagnostic: sensitiveValue }),
          },
        ],
        ['sentinel-bypass-secret', 'sentinel-cookie-value']
      )
    ).toThrow('protected probe state');
    try {
      validateNoSensitiveArtifactValues(
        [{ name: 'lhr-1.json', contents: sensitiveValue }],
        [sensitiveValue]
      );
    } catch (error) {
      expect(String(error)).not.toContain(sensitiveValue);
    }
  });

  it.each([
    'symlink',
    'directory',
    'fifo',
  ])('rejects a %s anywhere in the Lighthouse upload tree', entryType => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-lhci-tree-'));
    try {
      const artifact = join(directory, 'lhr-1.json');
      writeFileSync(artifact, JSON.stringify(reportFixture(HOME_URL)));
      const unsafe = join(directory, 'unsafe-entry');
      if (entryType === 'symlink') symlinkSync(artifact, unsafe);
      else if (entryType === 'directory') mkdirSync(unsafe);
      else {
        const result = spawnSync('mkfifo', [unsafe]);
        expect(result.status).toBe(0);
      }

      expect(() => readRegularArtifactRecords(directory)).toThrow(
        'symlink or non-regular entry'
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('rejects an unsafe or upload-visible sensitive-values receipt', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-lhci-receipt-'));
    const reports = join(root, 'reports');
    const outsideReceipt = join(root, 'outside-receipt');
    const insideReceipt = join(reports, 'inside-receipt');
    const symlinkReceipt = join(root, 'symlink-receipt');
    try {
      mkdirSync(reports);
      writeFileSync(outsideReceipt, 'opaque-cookie\n', { mode: 0o644 });
      expect(() => readSensitiveValues(outsideReceipt, reports)).toThrow(
        'mode-0600 regular file'
      );

      chmodSync(outsideReceipt, 0o600);
      writeFileSync(insideReceipt, 'opaque-cookie\n', { mode: 0o600 });
      expect(() => readSensitiveValues(insideReceipt, reports)).toThrow(
        'outside the upload tree'
      );

      symlinkSync(outsideReceipt, symlinkReceipt);
      expect(() => readSensitiveValues(symlinkReceipt, reports)).toThrow(
        'mode-0600 regular file'
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('hash-seals the complete artifact set and rejects post-validation mutation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-lhci-seal-'));
    try {
      const artifact = join(directory, 'lhr-1.json');
      writeFileSync(artifact, JSON.stringify(reportFixture(HOME_URL)));
      const seal = createLighthouseArtifactSeal(
        readRegularArtifactRecords(directory)
      );

      writeFileSync(artifact, JSON.stringify(reportFixture(PROFILE_URL)));

      expect(() =>
        validateLighthouseArtifactSeal(
          seal,
          readRegularArtifactRecords(directory)
        )
      ).toThrow('changed after validation');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('uploads only the sealed set without forwarding protected-origin state', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-lhci-upload-'));
    const directory = join(root, '.lighthouseci');
    const configPath = join(root, 'lighthouserc.json');
    const artifact = join(directory, 'lhr-1.json');
    try {
      mkdirSync(directory);
      writeFileSync(configPath, JSON.stringify(configFixture()));
      writeFileSync(artifact, JSON.stringify(reportFixture(HOME_URL)));
      const sourceDirectoryMode = statSync(directory).mode & 0o777;
      const sourceArtifactMode = statSync(artifact).mode & 0o777;
      const seal = createLighthouseArtifactSeal(
        readRegularArtifactRecords(directory)
      );
      vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'sentinel-secret');
      vi.stubEnv('LIGHTHOUSE_SENSITIVE_VALUES_FILE', '/runner/sensitive');
      vi.stubEnv('VERCEL_DYNAMIC_SECRETS_FILE', '/runner/dynamic');
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'sentinel-actions-id-token');
      vi.stubEnv('ACTIONS_RUNTIME_TOKEN', 'sentinel-actions-runtime-token');
      vi.stubEnv(
        'ACTIONS_RUNTIME_URL',
        'https://sentinel-actions-runtime.example'
      );
      vi.stubEnv('GH_TOKEN', 'sentinel-gh-token');
      vi.stubEnv('GITHUB_TOKEN', 'sentinel-github-token');
      vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');
      vi.stubEnv('SOME_SECRET', 'sentinel-generic-secret');
      const spawnImpl = vi.fn((command, args, options) => {
        expect(command).toBe('pnpm');
        const uploadRoot = options.cwd as string;
        const isolatedDirectory = join(uploadRoot, '.lighthouseci');
        const isolatedConfig = join(uploadRoot, 'lighthouserc.json');
        const isolatedArtifact = join(isolatedDirectory, 'lhr-1.json');
        expect(args).toEqual([
          'exec',
          'lhci',
          'upload',
          `--config=${isolatedConfig}`,
        ]);
        expect(uploadRoot).not.toBe(realpathSync(root));
        expect(uploadRoot.startsWith(`${realpathSync(root)}/`)).toBe(true);
        expect(options.env).not.toHaveProperty(
          'VERCEL_AUTOMATION_BYPASS_SECRET'
        );
        expect(options.env).not.toHaveProperty(
          'LIGHTHOUSE_SENSITIVE_VALUES_FILE'
        );
        expect(options.env).not.toHaveProperty('VERCEL_DYNAMIC_SECRETS_FILE');
        expect(Object.keys(options.env).join('\n')).not.toMatch(
          /ACTIONS_|GH_|GITHUB|VERCEL|TOKEN|SECRET/i
        );
        expect(statSync(isolatedDirectory).mode & 0o777).toBe(0o700);
        expect(statSync(isolatedArtifact).mode & 0o777).toBe(0o400);
        expect(statSync(artifact).mode & 0o777).toBe(sourceArtifactMode);
        writeFileSync(
          join(isolatedDirectory, 'links.json'),
          JSON.stringify({
            [HOME_URL]: 'https://storage.example/home',
            [PROFILE_URL]: 'https://storage.example/profile',
          })
        );
        return { status: 0 };
      }) as unknown as typeof spawnSync;

      uploadSealedArtifacts(
        configPath,
        directory,
        seal,
        ['sentinel-secret', 'sentinel-cookie'],
        spawnImpl
      );

      expect(spawnImpl).toHaveBeenCalledOnce();
      expect(statSync(directory).mode & 0o777).toBe(sourceDirectoryMode);
      expect(statSync(artifact).mode & 0o777).toBe(sourceArtifactMode);
      expect(() => statSync(join(directory, 'links.json'))).toThrow();
      expect(() =>
        validateLighthouseArtifactSeal(
          seal,
          readRegularArtifactRecords(directory)
        )
      ).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects an upload process that mutates the sealed artifact set', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-lhci-upload-race-'));
    const directory = join(root, '.lighthouseci');
    const configPath = join(root, 'lighthouserc.json');
    const artifact = join(directory, 'lhr-1.json');
    try {
      mkdirSync(directory);
      writeFileSync(configPath, JSON.stringify(configFixture()));
      writeFileSync(artifact, JSON.stringify(reportFixture(HOME_URL)));
      const sourceDirectoryMode = statSync(directory).mode & 0o777;
      const seal = createLighthouseArtifactSeal(
        readRegularArtifactRecords(directory)
      );
      const originalContents = readFileSync(artifact);
      const spawnImpl = ((_command, _args, options) => {
        const isolatedDirectory = join(options.cwd as string, '.lighthouseci');
        const isolatedArtifact = join(isolatedDirectory, 'lhr-1.json');
        // Replace the sealed file via a new inode even when bytes are restored.
        // In-place rewrite+chmod can leave mtime/ctime unchanged on some hosts
        // (ext4 coarse timestamps / container FS), which would hide the race.
        const tmpArtifact = join(isolatedDirectory, 'lhr-1.json.tmp');
        writeFileSync(tmpArtifact, JSON.stringify(reportFixture(PROFILE_URL)));
        writeFileSync(tmpArtifact, originalContents, { mode: 0o400 });
        unlinkSync(isolatedArtifact);
        renameSync(tmpArtifact, isolatedArtifact);
        writeFileSync(
          join(isolatedDirectory, 'links.json'),
          JSON.stringify({
            [HOME_URL]: 'https://storage.example/home',
            [PROFILE_URL]: 'https://storage.example/profile',
          })
        );
        return { status: 0 };
      }) as unknown as typeof spawnSync;

      expect(() =>
        uploadSealedArtifacts(configPath, directory, seal, [], spawnImpl)
      ).toThrow('mutated during upload');
      expect(statSync(directory).mode & 0o777).toBe(sourceDirectoryMode);
      expect(readFileSync(artifact)).toEqual(originalContents);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects a same-UID uploader that mutates and restores its isolated config', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-lhci-config-race-'));
    const directory = join(root, '.lighthouseci');
    const configPath = join(root, 'lighthouserc.json');
    try {
      mkdirSync(directory);
      writeFileSync(configPath, JSON.stringify(configFixture()));
      writeFileSync(
        join(directory, 'lhr-1.json'),
        JSON.stringify(reportFixture(HOME_URL))
      );
      const seal = createLighthouseArtifactSeal(
        readRegularArtifactRecords(directory)
      );
      const originalConfig = readFileSync(configPath);
      const spawnImpl = ((_command, _args, options) => {
        const uploadRoot = options.cwd as string;
        const isolatedConfig = join(uploadRoot, 'lighthouserc.json');
        // Same-content restore via a new inode — stable on hosts where
        // in-place rewrite does not advance ctime/mtime.
        const tmpConfig = join(uploadRoot, 'lighthouserc.json.tmp');
        writeFileSync(tmpConfig, '{}');
        writeFileSync(tmpConfig, originalConfig, { mode: 0o400 });
        unlinkSync(isolatedConfig);
        renameSync(tmpConfig, isolatedConfig);
        writeFileSync(
          join(uploadRoot, '.lighthouseci', 'links.json'),
          JSON.stringify({
            [HOME_URL]: 'https://storage.example/home',
            [PROFILE_URL]: 'https://storage.example/profile',
          })
        );
        return { status: 0 };
      }) as unknown as typeof spawnSync;

      expect(() =>
        uploadSealedArtifacts(configPath, directory, seal, [], spawnImpl)
      ).toThrow('configuration was mutated during upload');
      expect(readFileSync(configPath)).toEqual(originalConfig);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects an upload that does not publish every exact route', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-lhci-upload-links-'));
    const directory = join(root, '.lighthouseci');
    const configPath = join(root, 'lighthouserc.json');
    try {
      mkdirSync(directory);
      writeFileSync(configPath, JSON.stringify(configFixture()));
      writeFileSync(
        join(directory, 'lhr-1.json'),
        JSON.stringify(reportFixture(HOME_URL))
      );
      const seal = createLighthouseArtifactSeal(
        readRegularArtifactRecords(directory)
      );
      const spawnImpl = ((_command, _args, options) => {
        const isolatedDirectory = join(options.cwd as string, '.lighthouseci');
        writeFileSync(
          join(isolatedDirectory, 'links.json'),
          JSON.stringify({ [HOME_URL]: 'https://storage.example/home' })
        );
        return { status: 0 };
      }) as unknown as typeof spawnSync;

      expect(() =>
        uploadSealedArtifacts(configPath, directory, seal, [], spawnImpl)
      ).toThrow('did not publish every exact route');
      expect(() => statSync(join(directory, 'links.json'))).toThrow();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
