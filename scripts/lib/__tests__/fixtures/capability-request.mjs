import { generateKeyPairSync, sign } from 'node:crypto';
import {
  canonicalJson,
  digestCanonicalJson,
} from '../../../summer-commissioning/receipt-trust.mjs';
import {
  CAPABILITY_PROBE_SCHEMA,
  CAPABILITY_RESOLUTION_SCHEMA,
  createCapabilityRequest,
} from '../../capability-request.mjs';

const now = Date.parse('2026-11-13T20:00:00Z');
const at = seconds => new Date(now + seconds * 1000).toISOString();
const job = {
  id: 'JOV-12452',
  head: 'a'.repeat(40),
  action: 'open-draft-pr',
  principal: 'codex',
  environment: 'cloud',
  owner: 'environment-access-owner',
};
const blocker = {
  status: 403,
  capability: 'github-graphql',
  scope: 'JovieInc/Jovie',
  source: 'https://api.github.com/graphql?token=never-copy',
};
const pair = generateKeyPairSync('ed25519');
const keys = {
  fixture: {
    publicKey: pair.publicKey,
    actor: 'access-owner',
    owner: job.owner,
    schemas: [CAPABILITY_RESOLUTION_SCHEMA, CAPABILITY_PROBE_SCHEMA],
  },
};
const request = (observation = blocker) =>
  createCapabilityRequest(job, observation, now, at(3600));
function receipt(req, schema = CAPABILITY_RESOLUTION_SCHEMA, extra = {}) {
  const unsigned = {
    schema,
    requestId: req.id,
    bindingDigest: digestCanonicalJson(req.binding),
    receiptId: schema === CAPABILITY_PROBE_SCHEMA ? 'probe-1' : 'resolution-1',
    actor: 'access-owner',
    keyId: 'fixture',
    issuedAt: at(1),
    expiresAt: at(600),
    ...(schema === CAPABILITY_PROBE_SCHEMA
      ? { available: true }
      : { decision: 'approved' }),
    ...extra,
  };
  return {
    ...unsigned,
    signature: sign(
      null,
      Buffer.from(`${schema}\0${canonicalJson(unsigned)}`),
      pair.privateKey
    ).toString('base64'),
  };
}
function store(req = request()) {
  const record = {
    job: structuredClone(job),
    custody: {
      accepted: true,
      owner: job.owner,
      lease: 'accepted-lease',
      head: job.head,
      observedAt: at(0),
      expiresAt: at(300),
    },
    execution: { outcome: 'paused' },
    artifacts: ['artifact://repair/sha256'],
    capabilityRequests: [req],
  };
  let tail = Promise.resolve();
  const transaction = (_jobId, step) => {
    const next = tail.then(() => step(record));
    tail = next.catch(() => {});
    return next;
  };
  return { record, transaction };
}
const resumed = (req, extra = {}) => ({
  job,
  nowMs: now + 2000,
  resolution: { [req.id]: receipt(req) },
  probe: {
    [req.id]: receipt(req, CAPABILITY_PROBE_SCHEMA, { issuedAt: at(2) }),
  },
  trustedKeys: keys,
  ...extra,
});

export { at, blocker, job, keys, now, receipt, request, resumed, store };
