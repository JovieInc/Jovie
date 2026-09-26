import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';

import { canonical } from '../../lib/canonical-json.mjs';
import {
  requestSummerAssessment,
  summerAssessmentConfig,
  TRIAGE_ASSESSMENT_DOMAIN,
} from '../summer-triage-assessment-client.mjs';

const pair = generateKeyPairSync('ed25519');
const privateKey = pair.privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();
const publicKey = pair.publicKey
  .export({ format: 'pem', type: 'spki' })
  .toString();
const environment = {
  SUMMER_BOTTLENECK_ORIGIN: 'https://summer.example',
  SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY: privateKey,
  SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-outcome',
};
const delivery = {
  issueId: '68b3e8de-588e-46ba-8209-84329d154627',
  identifier: 'JOV-6500',
  deliveryId: 'delivery-1234567890',
};
const receipt = {
  schema: 'summer.linear-triage-assessment/v1',
  issueIdentifier: delivery.identifier,
  issueId: delivery.issueId,
  deliveryId: delivery.deliveryId,
  decision: 'urgent-investigation-required',
  linearUpdatedAt: '2026-09-24T03:59:00.000Z',
  acceptedInvestigation: false,
  authorizesDispatch: false,
};

test('signs a bounded host request and validates Summer identity and authority', async () => {
  const result = await requestSummerAssessment(delivery, {
    environment,
    now: () => Date.parse('2026-09-24T04:00:00Z'),
    fetchImpl: async (url, options) => {
      assert.equal(
        url,
        'https://summer.example/summer/v1/symphony/triage-assessments'
      );
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      if (typeof options.body !== 'string')
        throw new Error('expected-json-body');
      const body = JSON.parse(options.body);
      const { signature, ...unsigned } = body;
      assert.equal(body.schema, TRIAGE_ASSESSMENT_DOMAIN);
      assert.equal(body.issueIdentifier, delivery.identifier);
      assert.equal(body.requestedAt, '2026-09-24T04:00:00.000Z');
      assert.ok(
        verify(
          null,
          Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(unsigned)}`),
          publicKey,
          Buffer.from(signature.slice('ed25519='.length), 'base64url')
        )
      );
      return Response.json(receipt);
    },
  });
  assert.deepEqual(result, receipt);
});

test('rejects non-HTTPS destinations and wrong key types', () => {
  assert.throws(
    () =>
      summerAssessmentConfig({
        ...environment,
        SUMMER_BOTTLENECK_ORIGIN: 'http://summer.example',
      }),
    /origin-invalid/
  );
  assert.throws(
    () =>
      summerAssessmentConfig({
        ...environment,
        SUMMER_BOTTLENECK_ORIGIN: 'https://127.0.0.1',
      }),
    /origin-invalid/
  );
  assert.throws(
    () =>
      summerAssessmentConfig({
        ...environment,
        SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'x',
      }),
    /key-id-invalid/
  );
});

test('fails closed on provider error or a response claiming dispatch authority', async () => {
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () =>
        Response.json({ code: 'unavailable' }, { status: 503 }),
    }),
    /http-503/
  );
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () =>
        Response.json({ ...receipt, authorizesDispatch: true }),
    }),
    /assessment-invalid/
  );
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () => Response.json({ ...receipt, issueId: 'wrong' }),
    }),
    /assessment-invalid/
  );
});
