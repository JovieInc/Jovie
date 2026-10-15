export const NATIVE_AUTH_PROVENANCE_SCHEMA = 'jovie-native-auth-provenance/v1';

const SHA = /^[0-9a-f]{40}$/u;
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/u;
const STAGING_VERSION = /^(\d+\.\d+\.\d+)-staging\.[1-9]\d*\.[1-9]\d*$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactIsoTimestamp(value) {
  return (
    nonEmptyString(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isReleaseVersion(value) {
  return (
    nonEmptyString(value) && value !== '0.0.0' && RELEASE_VERSION.test(value)
  );
}

function classifyOrigin(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const hostname = new URL(origin).hostname.toLowerCase();
  if (hostname === 'jov.ie') {
    return { channel: 'production', hostedEnvironment: 'production', origin };
  }
  if (hostname === 'staging.jov.ie') {
    return { channel: 'staging', hostedEnvironment: 'preview', origin };
  }
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  ) {
    return { channel: 'local', hostedEnvironment: null, origin };
  }
  return { channel: null, hostedEnvironment: null, origin };
}

function desktopReleaseVersion(desktop) {
  if (!isObject(desktop) || !nonEmptyString(desktop.version)) return null;
  if (desktop.channel === 'staging') {
    return desktop.version.match(STAGING_VERSION)?.[1] ?? null;
  }
  return isReleaseVersion(desktop.version) ? desktop.version : null;
}

export function evaluateNativeAuthProvenance({
  baseUrl,
  capturedAt,
  desktop,
  hosted,
}) {
  const expected = classifyOrigin(baseUrl);
  const violations = [];
  const packaged =
    expected.channel === 'production' || expected.channel === 'staging';
  const releaseVersion = desktopReleaseVersion(desktop);

  if (!exactIsoTimestamp(capturedAt)) {
    violations.push('capture time is not an exact ISO timestamp');
  }

  if (expected.channel === null) {
    violations.push(`unsupported native-auth origin: ${expected.origin}`);
  }
  if (!isObject(desktop)) {
    violations.push('desktop build identity is unavailable');
  } else {
    if (desktop.channel !== expected.channel) {
      violations.push(
        `desktop channel ${String(desktop.channel)} does not match ${String(expected.channel)}`
      );
    }
    if (packaged && desktop.provenance !== 'verified') {
      violations.push('packaged desktop build identity is not verified');
    }
    if (!packaged && desktop.provenance !== 'development') {
      violations.push('local desktop build identity is not development');
    }
    if (releaseVersion === null) {
      violations.push('desktop version does not match its release channel');
    }
    if (
      packaged &&
      (!nonEmptyString(desktop.sourceRevision) ||
        !SHA.test(desktop.sourceRevision))
    ) {
      violations.push('desktop source revision is not an exact commit');
    }
    if (packaged && !exactIsoTimestamp(desktop.builtAt)) {
      violations.push('desktop build time is not an exact ISO timestamp');
    }
  }

  if (!isObject(hosted)) {
    violations.push('hosted route build fingerprint is unavailable');
  } else if (packaged) {
    if (
      !nonEmptyString(hosted.buildId) ||
      hosted.buildId === 'unknown' ||
      hosted.buildId === 'development'
    ) {
      violations.push('hosted route build id is unavailable');
    }
    if (!nonEmptyString(hosted.commitSha) || !SHA.test(hosted.commitSha)) {
      violations.push('hosted route commit is not an exact commit');
    } else if (hosted.commitSha !== desktop?.sourceRevision) {
      violations.push('desktop and hosted route commits do not match');
    }
    if (!nonEmptyString(hosted.deploymentId)) {
      violations.push('hosted route deployment id is unavailable');
    }
    if (hosted.environment !== expected.hostedEnvironment) {
      violations.push(
        `hosted route environment ${String(hosted.environment)} does not match ${expected.hostedEnvironment}`
      );
    }
    if (!isReleaseVersion(hosted.version)) {
      violations.push('hosted route version is not a release version');
    } else if (hosted.version !== releaseVersion) {
      violations.push('desktop and hosted route release versions do not match');
    }
  } else if (!nonEmptyString(hosted?.buildId)) {
    violations.push('local route build id is unavailable');
  }

  return {
    schema: NATIVE_AUTH_PROVENANCE_SCHEMA,
    status:
      violations.length === 0
        ? packaged
          ? 'matched'
          : 'development'
        : 'rejected',
    capturedAt,
    desktop: isObject(desktop)
      ? {
          channel: desktop.channel ?? null,
          version: desktop.version ?? null,
          sourceRevision: desktop.sourceRevision ?? null,
          builtAt: desktop.builtAt ?? null,
          provenance: desktop.provenance ?? null,
        }
      : null,
    hostedRoute: {
      url: new URL('/auth/native-return', expected.origin).toString(),
      buildInfoUrl: new URL(
        '/api/health/build-info',
        expected.origin
      ).toString(),
      buildId: isObject(hosted) ? (hosted.buildId ?? null) : null,
      version: isObject(hosted) ? (hosted.version ?? null) : null,
      commitSha: isObject(hosted) ? (hosted.commitSha ?? null) : null,
      deploymentId: isObject(hosted) ? (hosted.deploymentId ?? null) : null,
      environment: isObject(hosted) ? (hosted.environment ?? null) : null,
      deployedAt: isObject(hosted) ? (hosted.deployedAt ?? null) : null,
    },
    violations,
  };
}

export function assertNativeAuthProvenance(input) {
  const evidence = evaluateNativeAuthProvenance(input);
  if (evidence.status === 'rejected') {
    throw new Error(
      `Native-auth provenance rejected:\n- ${evidence.violations.join('\n- ')}\nEvidence: ${JSON.stringify(evidence)}`
    );
  }
  return evidence;
}
