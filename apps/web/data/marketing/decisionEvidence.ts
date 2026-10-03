import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { MarketingDecisionContextInput } from './decision';

export type MarketingJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly MarketingJsonValue[]
  | { readonly [key: string]: MarketingJsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertJsonValue(
  value: unknown,
  path = '$',
  stack = new WeakSet<object>()
): asserts value is MarketingJsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new Error(`${path} must contain a finite number`);
  }
  if (typeof value !== 'object') {
    throw new Error(`${path} must contain JSON values only`);
  }
  if (stack.has(value)) throw new Error(`${path} contains a cycle`);
  stack.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${path}[${index}]`, stack)
    );
    stack.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be a plain JSON object`);
  }
  const objectValue = value as Record<string, unknown>;
  for (const key of Object.keys(objectValue)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new Error(`${path}.${key} is not an allowed JSON key`);
    }
    assertJsonValue(objectValue[key], `${path}.${key}`, stack);
  }
  stack.delete(value);
}

export function cloneMarketingDecisionValue<T>(value: T): T {
  assertJsonValue(value);
  function clone(input: MarketingJsonValue): MarketingJsonValue {
    if (Array.isArray(input)) return input.map(item => clone(item));
    if (isRecord(input)) {
      return Object.fromEntries(
        Object.entries(input).map(([key, child]) => [key, clone(child)])
      );
    }
    return input;
  }
  return clone(value) as T;
}

export function freezeMarketingDecisionValue<T>(value: T): T {
  const cloned = cloneMarketingFrozenValue(value);
  const seen = new WeakSet<object>();
  const freeze = (input: unknown): void => {
    if (typeof input !== 'object' || input === null || seen.has(input)) return;
    seen.add(input);
    if (Array.isArray(input)) input.forEach(item => freeze(item));
    else Object.values(input).forEach(item => freeze(item));
    Object.freeze(input);
  };
  freeze(cloned);
  return cloned;
}

/**
 * Freeze output records without letting optional `undefined` object fields
 * make an otherwise valid record fail JSON validation. Input and digest
 * boundaries continue to use cloneMarketingDecisionValue/assertJsonValue,
 * which reject undefined values and non-JSON objects.
 */
function cloneMarketingFrozenValue<T>(value: T): T {
  const stack = new WeakSet<object>();
  const clone = (input: unknown, path: string): unknown => {
    if (input === undefined) return undefined;
    if (
      input === null ||
      typeof input === 'boolean' ||
      typeof input === 'string'
    ) {
      return input;
    }
    if (typeof input === 'number') {
      if (Number.isFinite(input)) return input;
      throw new Error(`${path} must contain a finite number`);
    }
    if (typeof input !== 'object') {
      throw new Error(`${path} must contain JSON values only`);
    }
    if (stack.has(input)) throw new Error(`${path} contains a cycle`);
    stack.add(input);
    if (Array.isArray(input)) {
      const output = input.map((item, index) => {
        if (item === undefined) {
          throw new Error(`${path}[${index}] must contain JSON values only`);
        }
        return clone(item, `${path}[${index}]`);
      });
      stack.delete(input);
      return output;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must be a plain JSON object`);
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw new Error(`${path}.${key} is not an allowed JSON key`);
      }
      if (child !== undefined) output[key] = clone(child, `${path}.${key}`);
    }
    stack.delete(input);
    return output;
  };
  return clone(value, '$') as T;
}

function stableSerialize(value: MarketingJsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Canonical digest used to bind decision inputs and candidate payloads. */
export function marketingDecisionDigest(value: unknown): string {
  assertJsonValue(value);
  return `sha256:${bytesToHex(
    sha256(new TextEncoder().encode(stableSerialize(value)))
  )}`;
}

export function marketingDecisionContextDigest(
  input: Omit<MarketingDecisionContextInput, 'contextDigest'>
): string {
  return marketingDecisionDigest({
    decisionId: input.decisionId,
    pageId: input.pageId,
    audience: input.audience,
    offer: input.offer,
    conversionObjective: input.conversionObjective,
    claimRevision: input.claimRevision,
    recipeRevision: input.recipeRevision,
    rubricRevision: input.rubricRevision,
    sourceRevision: input.sourceRevision,
    allowedMutationScope: [...input.allowedMutationScope],
    dependencyGraph: input.dependencyGraph ?? {},
  });
}

export function marketingDecisionIncumbentDigest<TValue>(input: {
  readonly id: string;
  readonly sourceRevision: string;
  readonly value: TValue;
  readonly dependencyIds: readonly string[];
}): string {
  return marketingDecisionDigest({
    id: input.id,
    sourceRevision: input.sourceRevision,
    value: input.value,
    dependencyIds: [...input.dependencyIds],
  });
}

export function marketingDecisionCandidateDigest<TValue>(input: {
  readonly id: string;
  readonly value: TValue;
  readonly changedPaths: readonly string[];
  readonly dependencyIds: readonly string[];
}): string {
  return marketingDecisionDigest({
    id: input.id,
    value: input.value,
    changedPaths: [...input.changedPaths],
    dependencyIds: [...input.dependencyIds],
  });
}

function collectChangedLeafPaths(
  incumbent: MarketingJsonValue,
  candidate: MarketingJsonValue,
  prefix: string
): readonly string[] {
  if (
    marketingDecisionDigest(incumbent) === marketingDecisionDigest(candidate)
  ) {
    return [];
  }
  if (Array.isArray(incumbent) !== Array.isArray(candidate)) return [prefix];
  if (Array.isArray(incumbent) && Array.isArray(candidate)) {
    const left = incumbent;
    const right = candidate;
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) => {
      const childPath = `${prefix}[${index}]`;
      if (index >= left.length || index >= right.length) return [childPath];
      return collectChangedLeafPaths(left[index], right[index], childPath);
    }).flat();
  }
  if (!isRecord(incumbent) || !isRecord(candidate)) return [prefix];
  const keys = new Set([...Object.keys(incumbent), ...Object.keys(candidate)]);
  return [...keys]
    .sort((left, right) => left.localeCompare(right))
    .flatMap(key => {
      const childPath = `${prefix}.${key}`;
      if (!Object.hasOwn(incumbent, key) || !Object.hasOwn(candidate, key)) {
        return [childPath];
      }
      return collectChangedLeafPaths(incumbent[key], candidate[key], childPath);
    });
}

export function collectChangedMarketingLeafPaths(
  incumbent: unknown,
  candidate: unknown,
  prefix = '$'
): readonly string[] {
  assertJsonValue(incumbent, 'incumbent');
  assertJsonValue(candidate, 'candidate');
  return collectChangedLeafPaths(incumbent, candidate, prefix);
}

export function marketingPathCovered(
  path: string,
  declaredPath: string
): boolean {
  const normalizedPath = path.startsWith('$.') ? path.slice(2) : path;
  const normalizedDeclared = declaredPath.startsWith('$.')
    ? declaredPath.slice(2)
    : declaredPath;
  return (
    normalizedDeclared === '*' ||
    normalizedPath === normalizedDeclared ||
    (normalizedDeclared.endsWith('.*') &&
      normalizedPath.startsWith(normalizedDeclared.slice(0, -1)))
  );
}
