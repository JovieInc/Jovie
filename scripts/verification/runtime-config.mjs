import {
  digestObject,
  isNonEmptyString,
  isRecord,
  RUNTIME_CONFIG_SCHEMA,
} from './contracts.mjs';

const CONFIG_KINDS = Object.freeze(['semantic', 'secret-presence']);
const ENVIRONMENTS = Object.freeze(['development', 'staging', 'production']);

function isBoolean(value) {
  return value === true || value === false;
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateRuntimeConfigDefinitions(definitions) {
  const errors = [];
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return ['runtime config definitions must be a non-empty list'];
  }
  const names = new Set();
  for (const [index, definition] of definitions.entries()) {
    const prefix = `definitions[${index}]`;
    if (!isRecord(definition)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!isNonEmptyString(definition.name)) {
      errors.push(`${prefix}.name is required`);
    } else if (names.has(definition.name)) {
      errors.push(`${prefix}.name must be unique`);
    } else {
      names.add(definition.name);
    }
    if (!CONFIG_KINDS.includes(definition.kind)) {
      errors.push(`${prefix}.kind is invalid`);
    }
    if (!isBoolean(definition.required)) {
      errors.push(`${prefix}.required must be boolean`);
    }
    if (!isBoolean(definition.material)) {
      errors.push(`${prefix}.material must be boolean`);
    }
    if (
      definition.allowedValues !== undefined &&
      (!Array.isArray(definition.allowedValues) ||
        definition.allowedValues.length === 0 ||
        !definition.allowedValues.every(isNonEmptyString))
    ) {
      errors.push(`${prefix}.allowedValues must be a non-empty string list`);
    }
    if (
      definition.kind === 'secret-presence' &&
      definition.allowedValues !== undefined
    ) {
      errors.push(`${prefix}.allowedValues cannot inspect a secret`);
    }
  }
  return errors;
}

export function buildRuntimeConfigSnapshot({
  version,
  environment,
  definitions,
  values,
}) {
  const definitionErrors = validateRuntimeConfigDefinitions(definitions);
  if (definitionErrors.length > 0) throw new Error(definitionErrors.join('\n'));
  if (!isNonEmptyString(version)) throw new Error('config version is required');
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error('config environment is invalid');
  }
  if (!isRecord(values)) throw new Error('config values must be an object');

  const blockers = [];
  const entries = definitions
    .map(definition => {
      const isPresent = present(values[definition.name]);
      if (definition.required && !isPresent) {
        blockers.push(`required-config-missing:${definition.name}`);
      }
      if (
        isPresent &&
        definition.allowedValues &&
        !definition.allowedValues.includes(values[definition.name])
      ) {
        blockers.push(`config-value-invalid:${definition.name}`);
      }
      return {
        name: definition.name,
        kind: definition.kind,
        required: definition.required,
        material: definition.material,
        state: isPresent ? 'present' : 'missing',
        valueDigest:
          isPresent && definition.kind === 'semantic'
            ? digestObject(values[definition.name])
            : null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return Object.freeze({
    schema: RUNTIME_CONFIG_SCHEMA,
    version,
    environment,
    entries: Object.freeze(entries.map(entry => Object.freeze(entry))),
    blockers: Object.freeze(blockers.sort()),
  });
}

export function validateRuntimeConfigSnapshot(snapshot) {
  const errors = [];
  if (!isRecord(snapshot) || snapshot.schema !== RUNTIME_CONFIG_SCHEMA) {
    return [`runtime config schema must be ${RUNTIME_CONFIG_SCHEMA}`];
  }
  if (!isNonEmptyString(snapshot.version))
    errors.push('config version is required');
  if (!ENVIRONMENTS.includes(snapshot.environment)) {
    errors.push('config environment is invalid');
  }
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length === 0) {
    errors.push('config entries must be a non-empty list');
  } else {
    const names = new Set();
    for (const entry of snapshot.entries) {
      if (!isRecord(entry) || !isNonEmptyString(entry.name)) {
        errors.push('config entry name is required');
        continue;
      }
      if (names.has(entry.name))
        errors.push(`config entry duplicated:${entry.name}`);
      names.add(entry.name);
      if (!CONFIG_KINDS.includes(entry.kind))
        errors.push(`config entry kind invalid:${entry.name}`);
      if (!isBoolean(entry.required) || !isBoolean(entry.material)) {
        errors.push(`config entry flags invalid:${entry.name}`);
      }
      if (!['present', 'missing'].includes(entry.state)) {
        errors.push(`config entry state invalid:${entry.name}`);
      }
      if (Object.hasOwn(entry, 'value')) {
        errors.push(`config entry exposes value:${entry.name}`);
      }
      const expectsDigest =
        entry.kind === 'semantic' && entry.state === 'present';
      const hasDigest =
        typeof entry.valueDigest === 'string' &&
        /^[a-f0-9]{64}$/.test(entry.valueDigest);
      if (expectsDigest !== hasDigest)
        errors.push(`config entry digest invalid:${entry.name}`);
      if (entry.kind === 'secret-presence' && entry.valueDigest !== null) {
        errors.push(`secret config digest forbidden:${entry.name}`);
      }
    }
  }
  if (
    !Array.isArray(snapshot.blockers) ||
    !snapshot.blockers.every(isNonEmptyString)
  ) {
    errors.push('config blockers must be a string list');
  }
  return errors;
}

export function runtimeConfigDigest(snapshot) {
  const errors = validateRuntimeConfigSnapshot(snapshot);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return digestObject(snapshot);
}

function materialProjection(snapshot) {
  return snapshot.entries
    .filter(entry => entry.material)
    .map(entry => ({
      name: entry.name,
      kind: entry.kind,
      required: entry.required,
      state: entry.state,
      valueDigest: entry.valueDigest,
    }));
}

export function evaluateRuntimeConfigParity(candidate, runtime) {
  const blockers = [
    ...validateRuntimeConfigSnapshot(candidate).map(
      error => `candidate:${error}`
    ),
    ...validateRuntimeConfigSnapshot(runtime).map(error => `runtime:${error}`),
  ];
  if (blockers.length > 0) return { certified: false, blockers };
  blockers.push(...candidate.blockers.map(value => `candidate:${value}`));
  blockers.push(...runtime.blockers.map(value => `runtime:${value}`));
  if (candidate.version !== runtime.version)
    blockers.push('config-version-drift');
  if (
    digestObject(materialProjection(candidate)) !==
    digestObject(materialProjection(runtime))
  ) {
    blockers.push('material-config-drift');
  }
  return {
    certified: blockers.length === 0,
    blockers,
    candidateDigest: runtimeConfigDigest(candidate),
    runtimeDigest: runtimeConfigDigest(runtime),
  };
}
