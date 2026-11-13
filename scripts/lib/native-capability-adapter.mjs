/** Pure bridge for the native ledger/outbox; stdin cannot supply trusted keys. */
import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  preflightRequiredCapabilities,
  reserveCapabilityResume,
  selectCapabilityDelivery,
  settleCapabilityDelivery,
} from './capability-admission.mjs';
import { renderCapabilityRequest } from './capability-request.mjs';

/** Commissioning keys alone confer NO access-decision authority. */
export function capabilityAuthorities(registry, publicKey) {
  if (!publicKey) return {};
  try {
    const key = createPublicKey(publicKey);
    const fingerprint = createHash('sha256')
      .update(key.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    if (!registry.trustedAttestationKeyFingerprints?.includes(fingerprint))
      return {};
    const authorities = registry.capabilityResolutionAuthorities ?? [];
    const matches = authorities.filter(row => row.keyId === fingerprint);
    if (matches.length !== 1) return {};
    const authority = matches[0];
    if (
      !authority.actor ||
      !authority.owner ||
      !Array.isArray(authority.schemas)
    )
      return {};
    return { [fingerprint]: { ...authority, publicKey: key } };
  } catch {
    return {};
  }
}

function configuredAuthorities() {
  // This is the existing committed trust root. No authority entry or key is installed here.
  const registry = JSON.parse(
    readFileSync(
      new URL('../summer-commissioning/registry.json', import.meta.url),
      'utf8'
    )
  );
  const publicKey =
    process.env.SUMMER_COMMISSIONING_ATTESTATION_PUBLIC_KEY ??
    process.env.RUNTIME_COMMISSIONING_ATTESTATION_PUBLIC_KEY;
  return capabilityAuthorities(registry, publicKey);
}

export async function nativeCapabilityTransition(
  input,
  trustedKeys = configuredAuthorities()
) {
  const { record, op, nowMs } = input;
  if (op === 'render')
    return { messages: record.capabilityRequests.map(renderCapabilityRequest) };
  if (op === 'delivery-select')
    return {
      record,
      result: selectCapabilityDelivery(record, input.requestId, nowMs),
    };
  if (op === 'delivery-settle')
    return {
      record,
      result: settleCapabilityDelivery(
        record,
        input.requestId,
        input.selected,
        input.sent,
        input.receipt,
        nowMs
      ),
    };
  if (op !== 'checkpoint') throw new Error('capability-operation-invalid');
  if (!record.capabilityRequests?.length) {
    const check = await preflightRequiredCapabilities({
      job: record.job,
      requirements: input.requirements,
      probe: requirement => input.observations[requirement.capability],
      nowMs,
      expiresAt: record.custody.expiresAt,
    });
    if (check.ready)
      return { record, result: { allowed: true, reason: 'preflight-passed' } };
    record.capabilityRequests = check.requests;
    record.execution = { outcome: 'not-started' };
  }
  const result = await reserveCapabilityResume({
    job: input.job ?? record.job,
    nowMs,
    transaction: (_id, update) => update(record),
    resolution: input.resolution,
    probe: input.probe,
    trustedKeys,
  });
  return {
    record,
    result,
    messages: record.capabilityRequests.map(renderCapabilityRequest),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const raw = readFileSync(0, 'utf8');
  if (raw.length > 262144) throw new Error('capability-input-too-large');
  process.stdout.write(
    JSON.stringify(await nativeCapabilityTransition(JSON.parse(raw)))
  );
}
