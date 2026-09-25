import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RUNTIME_CONFIG_SCHEMA } from './contracts.mjs';
import {
  buildRuntimeConfigSnapshot,
  evaluateRuntimeConfigParity,
  runtimeConfigDigest,
  validateRuntimeConfigDefinitions,
  validateRuntimeConfigSnapshot,
} from './runtime-config.mjs';

const DEFINITIONS = Object.freeze([
  Object.freeze({
    name: 'APP_ORIGIN',
    kind: 'semantic',
    required: true,
    material: true,
    allowedValues: ['https://staging.jov.ie', 'https://jov.ie'],
  }),
  Object.freeze({
    name: 'DATABASE_URL',
    kind: 'secret-presence',
    required: true,
    material: true,
  }),
  Object.freeze({
    name: 'OPTIONAL_DIAGNOSTICS',
    kind: 'semantic',
    required: false,
    material: false,
  }),
]);

function snapshot(overrides = {}) {
  return buildRuntimeConfigSnapshot({
    version: 'web-runtime-1',
    environment: 'staging',
    definitions: DEFINITIONS,
    values: {
      APP_ORIGIN: 'https://staging.jov.ie',
      DATABASE_URL: 'postgres://secret-never-emitted',
    },
    ...overrides,
  });
}

describe('runtime config certification contract', () => {
  it('creates a typed value-redacted snapshot and stable digest', () => {
    const value = snapshot();
    assert.equal(value.schema, RUNTIME_CONFIG_SCHEMA);
    assert.deepEqual(value.blockers, []);
    const database = value.entries.find(entry => entry.name === 'DATABASE_URL');
    assert.deepEqual(database, {
      name: 'DATABASE_URL',
      kind: 'secret-presence',
      required: true,
      material: true,
      state: 'present',
      valueDigest: null,
    });
    assert.doesNotMatch(JSON.stringify(value), /postgres:\/\//);
    assert.match(runtimeConfigDigest(value), /^[a-f0-9]{64}$/);
    assert.deepEqual(validateRuntimeConfigSnapshot(value), []);
  });

  it('deliberate red: missing required config blocks certification', () => {
    const value = snapshot({
      values: { APP_ORIGIN: 'https://staging.jov.ie' },
    });
    assert.deepEqual(value.blockers, ['required-config-missing:DATABASE_URL']);
    const parity = evaluateRuntimeConfigParity(value, value);
    assert.equal(parity.certified, false);
    assert.deepEqual(parity.blockers, [
      'candidate:required-config-missing:DATABASE_URL',
      'runtime:required-config-missing:DATABASE_URL',
    ]);
  });

  it('deliberate red: invalid combinations fail closed', () => {
    const value = snapshot({
      values: {
        APP_ORIGIN: 'http://unapproved.invalid',
        DATABASE_URL: 'present',
      },
    });
    assert.deepEqual(value.blockers, ['config-value-invalid:APP_ORIGIN']);
    assert.equal(
      evaluateRuntimeConfigParity(value, snapshot()).certified,
      false
    );
  });

  it('detects material drift but ignores explicitly non-material drift', () => {
    const candidate = snapshot();
    const production = snapshot({
      environment: 'production',
      values: {
        APP_ORIGIN: 'https://jov.ie',
        DATABASE_URL: 'different-secret-still-only-presence',
        OPTIONAL_DIAGNOSTICS: 'enabled',
      },
    });
    const drift = evaluateRuntimeConfigParity(candidate, production);
    assert.equal(drift.certified, false);
    assert.deepEqual(drift.blockers, ['material-config-drift']);

    const diagnosticsOnly = snapshot({
      environment: 'production',
      values: {
        APP_ORIGIN: 'https://staging.jov.ie',
        DATABASE_URL: 'rotated-secret',
        OPTIONAL_DIAGNOSTICS: 'enabled',
      },
    });
    assert.equal(
      evaluateRuntimeConfigParity(candidate, diagnosticsOnly).certified,
      true
    );
  });

  it('detects config contract version drift', () => {
    const result = evaluateRuntimeConfigParity(
      snapshot(),
      snapshot({ version: 'web-runtime-2', environment: 'production' })
    );
    assert.equal(result.certified, false);
    assert.deepEqual(result.blockers, ['config-version-drift']);
  });

  it('rejects malformed definitions and snapshots without exposing values', () => {
    assert.deepEqual(validateRuntimeConfigDefinitions([]), [
      'runtime config definitions must be a non-empty list',
    ]);
    assert.ok(
      validateRuntimeConfigDefinitions([
        {
          name: 'SECRET',
          kind: 'secret-presence',
          required: true,
          material: true,
          allowedValues: ['do-not-inspect'],
        },
      ]).includes('definitions[0].allowedValues cannot inspect a secret')
    );
    assert.deepEqual(validateRuntimeConfigSnapshot(null), [
      `runtime config schema must be ${RUNTIME_CONFIG_SCHEMA}`,
    ]);
    const malformed = structuredClone(snapshot());
    malformed.entries[0].value = 'leak';
    assert.ok(
      validateRuntimeConfigSnapshot(malformed).includes(
        'config entry exposes value:APP_ORIGIN'
      )
    );
    assert.throws(() => runtimeConfigDigest(malformed), /exposes value/);
  });

  it('reports every malformed definition field', () => {
    const errors = validateRuntimeConfigDefinitions([
      null,
      { name: '', kind: 'unknown', required: 'yes', material: null },
      {
        name: 'DUPLICATE',
        kind: 'semantic',
        required: false,
        material: false,
        allowedValues: [],
      },
      {
        name: 'DUPLICATE',
        kind: 'semantic',
        required: false,
        material: false,
        allowedValues: [false],
      },
    ]);
    assert.deepEqual(errors, [
      'definitions[0] must be an object',
      'definitions[1].name is required',
      'definitions[1].kind is invalid',
      'definitions[1].required must be boolean',
      'definitions[1].material must be boolean',
      'definitions[2].allowedValues must be a non-empty string list',
      'definitions[3].name must be unique',
      'definitions[3].allowedValues must be a non-empty string list',
    ]);
    assert.deepEqual(validateRuntimeConfigDefinitions(null), [
      'runtime config definitions must be a non-empty list',
    ]);
  });

  it('rejects invalid snapshot builder inputs', () => {
    assert.throws(
      () => snapshot({ definitions: [null] }),
      /definitions\[0\] must be an object/
    );
    assert.throws(
      () => snapshot({ version: '' }),
      /config version is required/
    );
    assert.throws(
      () => snapshot({ environment: 'preview' }),
      /config environment is invalid/
    );
    assert.throws(
      () => snapshot({ values: null }),
      /config values must be an object/
    );
  });

  it('reports every malformed snapshot field', () => {
    const valid = structuredClone(snapshot());
    const malformed = {
      ...valid,
      version: '',
      environment: 'preview',
      entries: [
        null,
        {
          ...valid.entries[0],
          name: 'BROKEN',
          kind: 'unknown',
          required: 'yes',
          material: null,
          state: 'unknown',
          valueDigest: null,
        },
        {
          ...valid.entries[0],
          name: 'BROKEN',
          state: 'missing',
          valueDigest: 'wrong',
        },
        {
          ...valid.entries[1],
          name: 'SECRET',
          valueDigest: 'd'.repeat(64),
        },
      ],
      blockers: [false],
    };
    assert.deepEqual(validateRuntimeConfigSnapshot(malformed), [
      'config version is required',
      'config environment is invalid',
      'config entry name is required',
      'config entry kind invalid:BROKEN',
      'config entry flags invalid:BROKEN',
      'config entry state invalid:BROKEN',
      'config entry duplicated:BROKEN',
      'config entry digest invalid:SECRET',
      'secret config digest forbidden:SECRET',
      'config blockers must be a string list',
    ]);
    assert.ok(
      validateRuntimeConfigSnapshot({ ...valid, entries: [] }).includes(
        'config entries must be a non-empty list'
      )
    );
    assert.ok(
      validateRuntimeConfigSnapshot({ ...valid, entries: null }).includes(
        'config entries must be a non-empty list'
      )
    );
    assert.ok(
      validateRuntimeConfigSnapshot({ ...valid, blockers: null }).includes(
        'config blockers must be a string list'
      )
    );
  });

  it('fails parity closed for malformed candidate and runtime snapshots', () => {
    assert.deepEqual(evaluateRuntimeConfigParity(null, null), {
      certified: false,
      blockers: [
        `candidate:runtime config schema must be ${RUNTIME_CONFIG_SCHEMA}`,
        `runtime:runtime config schema must be ${RUNTIME_CONFIG_SCHEMA}`,
      ],
    });
  });
});
