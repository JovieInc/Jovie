import { verify } from 'node:crypto';
import {
  canonicalJson,
  digestCanonicalJson,
  isRecord,
} from './receipt-trust.mjs';

export const IMPACT_FORECAST_SCHEMA = 'jovie.impact-forecast/v1';
export const IMPACT_FORECAST_AUTHORITY = 'predictive-impact-forecaster';
export const IMPACT_OBSERVATION_AUTHORITY = 'impact-telemetry';
const IMPACT_ATTESTATION_SCHEMA = 'jovie.impact-producer-attestation/v1';

function need(value, message) {
  if (!value) throw new Error(message);
}

function text(value, field) {
  need(typeof value === 'string' && value.trim(), `${field} is required`);
}

function receiptPayloadDigest(receipt) {
  const { receiptDigest: _receiptDigest, ...payload } = receipt;
  return digestCanonicalJson(payload);
}

export function impactProducerAttestationPayload(authority, digest, immutable) {
  return canonicalJson({
    schema: IMPACT_ATTESTATION_SCHEMA,
    authority,
    digest,
    immutable,
  });
}

function producerSignatureValid(entry, authority, publicKey) {
  if (
    !publicKey ||
    entry?.attestation?.algorithm !== 'ed25519' ||
    typeof entry.attestation.signature !== 'string'
  )
    return false;
  try {
    const signature = Buffer.from(entry.attestation.signature, 'base64');
    return (
      signature.length > 0 &&
      verify(
        null,
        Buffer.from(
          impactProducerAttestationPayload(
            authority,
            entry.digest,
            entry.immutable
          )
        ),
        publicKey,
        signature
      )
    );
  } catch {
    return false;
  }
}

export function resolveTrustedForecast(entry, publicKey) {
  need(
    isRecord(entry) &&
      entry.authority === IMPACT_FORECAST_AUTHORITY &&
      entry.immutable === true &&
      isRecord(entry.receipt) &&
      entry.receipt.schema === IMPACT_FORECAST_SCHEMA &&
      entry.receipt.receiptDigest === receiptPayloadDigest(entry.receipt) &&
      entry.digest === digestCanonicalJson(entry.receipt) &&
      producerSignatureValid(entry, IMPACT_FORECAST_AUTHORITY, publicKey),
    'forecast must resolve from its trusted producer store'
  );
  return entry.receipt;
}

export function resolveTrustedObservation(
  observationId,
  trustedObservations,
  publicKey
) {
  text(observationId, 'observationId');
  const entry = trustedObservations?.[observationId];
  need(
    isRecord(entry) &&
      entry.authority === IMPACT_OBSERVATION_AUTHORITY &&
      entry.immutable === true &&
      isRecord(entry.observation) &&
      entry.observation.observationId === observationId &&
      entry.digest === digestCanonicalJson(entry.observation) &&
      producerSignatureValid(entry, IMPACT_OBSERVATION_AUTHORITY, publicKey),
    'observation must resolve from its trusted telemetry store'
  );
  return entry.observation;
}
