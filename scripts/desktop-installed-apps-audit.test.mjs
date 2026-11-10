import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  commandExposesRemoteDebugging,
  commandRunsJovieDesktopShell,
  evaluateDesktopInstalledAppsAudit,
  evaluateDesktopUpdateFreshness,
  fetchShippedDesktopVersions,
  KNOWN_DESKTOP_BUNDLE_IDS,
  listRunningJovieProcesses,
  readCodesignMetadata,
  readDesktopBuildIdentity,
} from './desktop-installed-apps-audit.mjs';

test('rolling staging freshness uses the current release update time', async () => {
  /** @type {typeof fetch} */
  const fetchImpl = async input =>
    Response.json(
      String(input).endsWith('/latest')
        ? {
            name: '26.9.15',
            published_at: '2026-09-22T10:00:00Z',
            updated_at: '2026-09-23T10:00:00Z',
          }
        : {
            name: '26.9.16-staging.35887697816.1',
            published_at: '2026-09-09T04:08:01Z',
            updated_at: '2026-09-23T16:29:20Z',
          }
    );
  const shipped = await fetchShippedDesktopVersions(fetchImpl);
  assert.equal(shipped.production.publishedAt, '2026-09-22T10:00:00Z');
  assert.equal(shipped.staging.version, '26.9.16-staging.35887697816.1');
  assert.equal(shipped.staging.publishedAt, '2026-09-23T16:29:20Z');
  const freshness = evaluateDesktopUpdateFreshness({
    channel: 'staging',
    installedVersion: '26.8.3-staging.34309234992.1',
    latestVersion: shipped.staging.version,
    latestPublishedAt: shipped.staging.publishedAt,
    installedSourceRevision: SOURCE_REVISION,
    latestSourceRevision: SOURCE_REVISION,
    publicationIdentityVerified: true,
    now: new Date('2026-09-23T17:00:00Z'),
  });
  assert.equal(freshness.status, 'updating');
});

const SOURCE_REVISION = 'a'.repeat(40);

test('matching version cannot hide a wrong installed source revision', () => {
  const result = evaluateDesktopUpdateFreshness({
    channel: 'production',
    installedVersion: '26.10.3',
    latestVersion: '26.10.3',
    installedSourceRevision: 'b'.repeat(40),
    latestSourceRevision: SOURCE_REVISION,
    publicationIdentityVerified: true,
    latestPublishedAt: '2026-10-13T12:22:16.756Z',
    now: new Date('2026-10-14T12:00:00Z'),
  });
  assert.equal(result.red, true);
  assert.equal(result.status, 'identity-mismatch');
});

test('identity match requires publication, revision, channel and valid publication time', () => {
  const input = {
    channel: 'production',
    installedVersion: '26.10.3',
    latestVersion: '26.10.3',
    installedSourceRevision: SOURCE_REVISION,
    latestSourceRevision: SOURCE_REVISION,
    publicationIdentityVerified: true,
    latestPublishedAt: '2026-10-13T12:22:16.756Z',
    now: new Date('2026-10-14T12:00:00Z'),
  };
  assert.equal(
    evaluateDesktopUpdateFreshness(input).status,
    'identity-matched'
  );
  for (const override of [
    { publicationIdentityVerified: false },
    { publicationIdentityVerified: undefined },
    { installedSourceRevision: null },
    { installedSourceRevision: undefined },
    { latestSourceRevision: null },
    { latestSourceRevision: 'main' },
    { channel: 'staging' },
    { channel: 'local' },
    { channel: null },
    { latestPublishedAt: null },
    { latestPublishedAt: 'invalid' },
    { latestPublishedAt: '2026-10-13' },
    { latestPublishedAt: '2026-02-30T12:00:00Z' },
    { latestPublishedAt: '2026-10-15T12:00:00Z' },
    { now: new Date('invalid') },
  ]) {
    assert.equal(
      evaluateDesktopUpdateFreshness({ ...input, ...override }).red,
      true
    );
  }
});

function publishedFixture(channel = 'production') {
  const version =
    channel === 'production' ? '26.10.3' : '26.10.4-staging.123.1';
  const prefix = `Jovie${channel === 'staging' ? '-Staging' : ''}-${version}-universal`;
  const sha512 = `${'A'.repeat(86)}==`;
  const feed = `version: ${version}\nfiles:\n  - url: ${prefix}.zip\n    sha512: ${sha512}\n    size: 100\n  - url: ${prefix}.dmg\n    sha512: ${sha512}\n    size: 100\npath: ${prefix}.zip\nsha512: ${sha512}\n`;
  const assets = ['.dmg', '.dmg.blockmap', '.zip', '.zip.blockmap'].map(
    (ext, i) => ({
      id: i + 1,
      name: `${prefix}${ext}`,
      size: 100,
      state: 'uploaded',
      digest: `sha256:${'a'.repeat(64)}`,
    })
  );
  assets.push({
    id: 5,
    name: channel === 'production' ? 'latest-mac.yml' : 'staging-mac.yml',
    size: Buffer.byteLength(feed),
    state: 'uploaded',
    digest: `sha256:${createHash('sha256').update(feed).digest('hex')}`,
  });
  return {
    feed,
    release: {
      id: 1,
      name: version,
      target_commitish: SOURCE_REVISION,
      tag_name: channel === 'production' ? `v${version}` : 'desktop-staging',
      draft: false,
      prerelease: channel === 'staging',
      assets,
      published_at: '2026-10-13T12:00:00Z',
      updated_at: '2026-10-14T12:00:00Z',
    },
  };
}

async function observePublication(
  fixture,
  feedResponse = () => new Response(fixture.feed)
) {
  return fetchShippedDesktopVersions(async (url, options) => {
    if (String(url).includes('/commits/tags/'))
      return Response.json({ sha: SOURCE_REVISION });
    if (String(url).includes('/releases/assets/')) {
      assert.equal(
        new Headers(options.headers).get('Accept'),
        'application/octet-stream'
      );
      return feedResponse();
    }
    if (String(url).endsWith('/latest')) return Response.json(fixture.release);
    return Response.json(publishedFixture('staging').release);
  });
}

test('publication identity binds exact assets and feed bytes, without claiming archive integrity', async () => {
  for (const channel of ['production', 'staging']) {
    const fixture = publishedFixture(channel);
    if (channel === 'staging') {
      fixture.release.assets.push({
        ...fixture.release.assets[0],
        id: 6,
        name: 'Jovie-Staging-26.10.3-staging.122.1-universal.dmg',
      });
    }
    const observed = await fetchShippedDesktopVersions(async url => {
      if (String(url).includes('/commits/tags/')) {
        assert.ok(String(url).endsWith(`/tags/${fixture.release.tag_name}`));
        return Response.json({ sha: SOURCE_REVISION });
      }
      if (String(url).includes('/releases/assets/'))
        return new Response(fixture.feed);
      return Response.json(fixture.release);
    });
    assert.equal(observed[channel].publicationIdentityVerified, true);
    assert.equal(observed[channel].sourceRevision, SOURCE_REVISION);
    assert.equal(observed[channel].publicationError, null);
    const freshness = evaluateDesktopUpdateFreshness({
      channel,
      installedVersion: fixture.release.name,
      installedSourceRevision: SOURCE_REVISION,
      latestVersion: observed[channel].version,
      latestSourceRevision: observed[channel].sourceRevision,
      latestPublishedAt: observed[channel].publishedAt,
      publicationIdentityVerified:
        observed[channel].publicationIdentityVerified,
      now: new Date('2026-10-14T13:00:00Z'),
    });
    assert.equal(freshness.status, 'identity-matched');
    assert.equal(freshness.red, false);
    assert.match(freshness.reason, /separate receipts/);
  }
});

test('unpublished, missing, duplicate, empty or undigested assets cannot verify publication', async () => {
  for (const mutate of [
    f => {
      f.release.draft = true;
    },
    f => {
      f.release.assets = [];
    },
    f => {
      f.release.assets.pop();
    },
    f => {
      f.release.assets.push(f.release.assets[0]);
    },
    f => {
      f.release.assets.push({
        ...f.release.assets[0],
        id: 9,
        name: 'unexpected.zip',
      });
    },
    f => {
      f.release.assets[0].size = 0;
    },
    f => {
      f.release.assets[0].digest = null;
    },
    f => {
      f.release.assets[0].state = 'starter';
    },
    f => {
      f.release.target_commitish = 'main';
    },
    f => {
      f.release.assets[4].id = -1;
    },
    f => {
      f.release.target_commitish = null;
    },
    f => {
      f.release.tag_name = 'wrong-channel';
    },
    f => {
      f.release.prerelease = !f.release.prerelease;
    },
    f => {
      f.release.assets[4].name = 'wrong-mac.yml';
    },
    f => {
      f.release.published_at = null;
    },
    f => {
      f.release.published_at = 'invalid';
    },
    f => {
      f.release.published_at = '2026-02-30T12:00:00Z';
    },
  ]) {
    for (const channel of ['production', 'staging']) {
      const fixture = publishedFixture(channel);
      mutate(fixture);
      const observed = await fetchShippedDesktopVersions(async url =>
        String(url).includes('/commits/tags/')
          ? Response.json({ sha: SOURCE_REVISION })
          : String(url).includes('/releases/assets/')
            ? new Response(fixture.feed)
            : Response.json(fixture.release)
      );
      assert.equal(observed[channel].publicationIdentityVerified, false);
      assert.ok(observed[channel].publicationError);
    }
  }
});

test('staging requires a valid timestamp for the current rolling publication', async () => {
  for (const updatedAt of [
    null,
    'invalid',
    '2026-02-30T12:00:00Z',
    '2026-10-12T12:00:00Z',
  ]) {
    const fixture = publishedFixture('staging');
    fixture.release.updated_at = updatedAt;
    const observed = await fetchShippedDesktopVersions(async url =>
      String(url).includes('/commits/tags/')
        ? Response.json({ sha: SOURCE_REVISION })
        : String(url).includes('/releases/assets/')
          ? new Response(fixture.feed)
          : Response.json(fixture.release)
    );
    assert.equal(observed.staging.publicationIdentityVerified, false);
  }
});

test('wrong feed bytes, unavailable feed, and wrong feed target cannot verify publication', async () => {
  const fixture = publishedFixture();
  for (const response of [
    () => new Response(fixture.feed.replace('26.10.3', '26.10.4')),
    () => new Response('denied', { status: 403 }),
    () => {
      throw new Error('network unavailable');
    },
  ]) {
    assert.equal(
      (await observePublication(fixture, response)).production
        .publicationIdentityVerified,
      false
    );
  }
  for (const transform of [
    feed => feed.replace('version: 26.10.3', 'version: 26.10.2'),
    feed => feed.replace('path: Jovie', 'path: Wrong'),
    feed => feed.replace('size: 100', 'size: 200'),
    feed => feed.replace('sha512: A', 'sha512: B'),
  ]) {
    const changed = publishedFixture();
    changed.feed = transform(changed.feed);
    const asset = changed.release.assets[4];
    asset.size = Buffer.byteLength(changed.feed);
    asset.digest = `sha256:${createHash('sha256').update(changed.feed).digest('hex')}`;
    assert.equal(
      (await observePublication(changed)).production
        .publicationIdentityVerified,
      false
    );
  }
});

test('malformed channel feeds cannot verify publication even with matching digests', async () => {
  for (const channel of ['production', 'staging']) {
    for (const transform of [
      feed => `${feed}${feed.split('\n')[0]}\n`,
      feed => feed.replace('    size: 100', '   size: 100'),
      feed => feed.replace('    size: 100', '    size: 100\n    size: 100'),
      feed => feed.replace('files:', 'files: |'),
      feed => feed.replace('files:', 'files: >'),
    ]) {
      const fixture = publishedFixture(channel);
      fixture.feed = transform(fixture.feed);
      const asset = fixture.release.assets[4];
      asset.size = Buffer.byteLength(fixture.feed);
      asset.digest = `sha256:${createHash('sha256').update(fixture.feed).digest('hex')}`;
      const observed = await fetchShippedDesktopVersions(async url =>
        String(url).includes('/commits/tags/')
          ? Response.json({ sha: SOURCE_REVISION })
          : String(url).includes('/releases/assets/')
            ? new Response(fixture.feed)
            : Response.json(fixture.release)
      );
      assert.equal(observed[channel].publicationIdentityVerified, false);
      assert.ok(observed[channel].publicationError);
    }
  }
});

test('release metadata cannot hide a mismatched or unavailable published tag', async () => {
  for (const channel of ['production', 'staging']) {
    const fixture = publishedFixture(channel);
    for (const tagResponse of [
      () => Response.json({ sha: 'b'.repeat(40) }),
      () => Response.json({}),
      () => new Response('missing tag', { status: 404 }),
      () => {
        throw new Error('tag lookup unavailable');
      },
    ]) {
      const observed = await fetchShippedDesktopVersions(async url => {
        if (String(url).includes('/commits/tags/')) return tagResponse();
        if (String(url).includes('/releases/assets/'))
          return new Response(fixture.feed);
        return Response.json(fixture.release);
      });
      assert.equal(observed[channel].publicationIdentityVerified, false);
      assert.ok(observed[channel].publicationError);
    }
  }
});

function buildIdentity(overrides = {}) {
  return {
    channel: 'production',
    version: '26.6.61',
    sourceRevision: SOURCE_REVISION,
    builtAt: '2026-08-30T12:34:56.789Z',
    ...overrides,
  };
}

test('commandRunsJovieDesktopShell counts app shells but excludes helpers and repo processes', () => {
  assert.equal(
    commandRunsJovieDesktopShell(
      '/Applications/Jovie Staging.app/Contents/MacOS/Jovie Staging'
    ),
    true
  );
  assert.equal(
    commandRunsJovieDesktopShell(
      '/Applications/Jovie.app/Contents/Frameworks/Jovie Helper.app/Contents/MacOS/Jovie Helper --type=gpu-process'
    ),
    false
  );
  assert.equal(
    commandRunsJovieDesktopShell(
      '/opt/homebrew/bin/node /Users/timwhite/Jovie/apps/web/server.js'
    ),
    false
  );
});

test('process inventory failure cannot be reported as no running apps', () => {
  assert.throws(
    () =>
      listRunningJovieProcesses(() => {
        throw new Error('ps denied');
      }),
    /Running process inventory unavailable/
  );
});

test('readCodesignMetadata reads successful codesign output from stderr', () => {
  const result = readCodesignMetadata('/Applications/Jovie.app', {
    runCodesign: () => ({
      error: undefined,
      status: 0,
      stderr:
        'Executable=/Applications/Jovie.app/Contents/MacOS/Jovie\nIdentifier=app.jov.ie\n',
      stdout: '',
    }),
    readVersion: () => '26.8.1',
  });

  assert.deepEqual(result, {
    identifier: 'app.jov.ie',
    version: '26.8.1',
  });
});

test('readCodesignMetadata fails closed when codesign fails', () => {
  const result = readCodesignMetadata('/Applications/Jovie.app', {
    runCodesign: () => ({
      error: undefined,
      status: 1,
      stderr: 'invalid signature',
      stdout: '',
    }),
    readVersion: () => '26.8.1',
  });

  assert.deepEqual(result, {
    identifier: null,
    version: null,
  });
});

test('evaluateDesktopInstalledAppsAudit passes for canonical production only', () => {
  const result = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: buildIdentity(),
        buildIdentityError: null,
      },
    ],
    processes: [
      {
        pid: '100',
        command: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('evaluateDesktopInstalledAppsAudit flags legacy and concurrent shells', () => {
  const result = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: buildIdentity(),
        buildIdentityError: null,
      },
      {
        name: 'Jovie 2.app',
        path: '/Applications/Jovie 2.app',
        identifier: 'ie.jov.Jovie',
        version: '42',
        buildIdentity: null,
        buildIdentityError: 'unavailable',
      },
      {
        name: 'Jovie Staging.app',
        path: '/Applications/Jovie Staging.app',
        identifier: 'app.jov.ie.staging',
        version: '26.6.61',
        buildIdentity: buildIdentity({ channel: 'staging' }),
        buildIdentityError: null,
      },
    ],
    processes: [
      {
        pid: '100',
        command: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      },
      {
        pid: '200',
        command:
          '/Applications/Jovie Staging.app/Contents/MacOS/Jovie Staging --remote-debugging-port=9224',
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some(finding =>
      finding.includes('legacy bundle id ie.jov.Jovie')
    )
  );
  assert.ok(
    result.findings.some(finding =>
      finding.includes('2 Jovie desktop processes')
    )
  );
  assert.ok(
    result.findings.some(finding => finding.includes('--remote-debugging-port'))
  );
});

test('evaluateDesktopInstalledAppsAudit fails closed on missing and mismatched identity', () => {
  const missing = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: null,
        buildIdentityError: 'unavailable',
      },
    ],
    processes: [],
  });
  const mismatch = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: buildIdentity({
          channel: 'staging',
          version: '26.6.60',
        }),
        buildIdentityError: null,
      },
    ],
    processes: [],
  });
  const incomplete = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie Staging.app',
        path: '/Applications/Jovie Staging.app',
        identifier: 'app.jov.ie.staging',
        version: '26.6.61',
        buildIdentity: buildIdentity({
          channel: 'staging',
          sourceRevision: null,
        }),
        buildIdentityError: null,
      },
    ],
    processes: [],
  });

  assert.equal(missing.ok, false);
  assert.ok(
    missing.findings.some(finding =>
      finding.includes('provenance is not verified')
    )
  );
  assert.equal(mismatch.ok, false);
  assert.ok(
    mismatch.findings.some(finding =>
      finding.includes('does not match build identity')
    )
  );
  assert.ok(
    mismatch.findings.some(finding =>
      finding.includes('does not match build identity channel')
    )
  );
  assert.equal(incomplete.ok, false);
  assert.ok(
    incomplete.findings.some(finding =>
      finding.includes('build identity is incomplete')
    )
  );
});

test('readDesktopBuildIdentity exposes the packaged no-login receipt', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'jovie-build-identity-'));
  const resources = path.join(tempRoot, 'Contents', 'Resources');
  mkdirSync(resources, { recursive: true });
  writeFileSync(
    path.join(resources, 'build-identity.json'),
    JSON.stringify(buildIdentity()),
    'utf8'
  );

  try {
    assert.deepEqual(readDesktopBuildIdentity(tempRoot), {
      buildIdentity: buildIdentity(),
      buildIdentityError: null,
    });
    writeFileSync(
      path.join(resources, 'build-identity.json'),
      JSON.stringify({ ...buildIdentity(), secret: 'must-not-surface' }),
      'utf8'
    );
    assert.deepEqual(readDesktopBuildIdentity(tempRoot), {
      buildIdentity: null,
      buildIdentityError: 'invalid',
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('commandExposesRemoteDebugging detects CDP flags', () => {
  assert.equal(
    commandExposesRemoteDebugging(
      '/Applications/Jovie Staging.app/Contents/MacOS/Jovie Staging --remote-debugging-port=9224'
    ),
    true
  );
  assert.equal(
    commandExposesRemoteDebugging(
      '/Applications/Jovie.app/Contents/MacOS/Jovie'
    ),
    false
  );
});

test('KNOWN_DESKTOP_BUNDLE_IDS marks only production as canonical', () => {
  assert.equal(KNOWN_DESKTOP_BUNDLE_IDS['app.jov.ie'].canonical, true);
  assert.equal(KNOWN_DESKTOP_BUNDLE_IDS['app.jov.ie.staging'].canonical, false);
  assert.equal(KNOWN_DESKTOP_BUNDLE_IDS['app.jov.ie.local'].canonical, false);
});

test('readDesktopBuildIdentity accepts exact staging prerelease provenance', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'jovie-staging-identity-'));
  try {
    const resources = path.join(temp, 'Contents', 'Resources');
    mkdirSync(resources, { recursive: true });
    const identity = buildIdentity({
      channel: 'staging',
      version: '26.8.3-staging.34309234992.1',
    });
    writeFileSync(
      path.join(resources, 'build-identity.json'),
      JSON.stringify(identity)
    );
    assert.deepEqual(readDesktopBuildIdentity(temp), {
      buildIdentity: identity,
      buildIdentityError: null,
    });
    const audit = evaluateDesktopInstalledAppsAudit({
      bundles: [
        {
          name: 'Jovie.app',
          path: '/Applications/Jovie.app',
          identifier: 'app.jov.ie',
          version: '26.6.61',
          buildIdentity: buildIdentity(),
          buildIdentityError: null,
        },
        {
          name: 'Jovie Staging.app',
          path: temp,
          identifier: 'app.jov.ie.staging',
          version: identity.version,
          buildIdentity: identity,
          buildIdentityError: null,
        },
      ],
      processes: [],
    });
    assert.equal(audit.ok, true);
    assert.deepEqual(audit.findings, []);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('evaluateDesktopUpdateFreshness is red when installed is behind >24h', () => {
  const now = new Date('2026-08-29T12:00:00Z');
  const sample = (
    installedVersion,
    latestPublishedAt,
    latestVersion = '26.8.1'
  ) =>
    evaluateDesktopUpdateFreshness({
      channel: 'production',
      installedSourceRevision: SOURCE_REVISION,
      latestSourceRevision: SOURCE_REVISION,
      publicationIdentityVerified: true,
      installedVersion,
      latestVersion,
      latestPublishedAt,
      now,
    });
  assert.equal(
    sample('26.8.1', '2026-08-20T00:00:00Z').status,
    'identity-matched'
  );
  assert.equal(sample('26.6.61', '2026-08-29T01:00:00Z').red, true);
  assert.equal(sample('26.6.61', '2026-07-21T00:00:00Z').red, true);
  assert.equal(sample('26.8.1', null, null).red, true);
  assert.equal(sample(null, '2026-07-21T00:00:00Z').status, 'not-installed');
});
