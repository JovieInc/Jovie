import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  composeCompanyRegistry,
  validateCompanyObservation,
} from './company-registry.mjs';

function fixture() {
  return [
    'architecture-freshness-registry.json',
    'capability-access-registry.json',
    'registry.json',
  ].map(name =>
    JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
  );
}
function withDeployment() {
  const inputs = fixture();
  const company = inputs[0].company;
  company.coverage.find(row => row.type === 'deployment').state = 'partial';
  company.objects.push({
    id: 'deployment.synthetic',
    type: 'deployment',
    owner: 'fixture',
    purpose: 'synthetic only',
    authority: { ...company.objects[1].authority },
    dependencies: ['company.summer'],
    capabilities: [],
    attributes: {
      serviceId: 'company.summer',
      environment: 'production',
      projectId: 'fixture-project',
      endpoint: 'https://summer.example.test',
      role: 'canonical',
    },
  });
  return inputs;
}

test('composes canonical sources without claiming completeness, readiness or live deployment', () => {
  const inputs = fixture();
  const projection = composeCompanyRegistry(...inputs);
  assert.equal(projection.complete, false);
  assert.equal(projection.certificationContract, 'jovie.certification/v1');
  assert.equal(projection.certificationState, 'not-evaluated');
  assert.equal(
    projection.coverage.find(row => row.type === 'deployment').enumeratedCount,
    0
  );
  assert.ok(projection.coverage.every(row => row.totalCount === null));
  assert.equal(
    projection.revision,
    composeCompanyRegistry(...fixture()).revision
  );
  inputs[1].auditVersion = 'new-source';
  assert.notEqual(
    projection.revision,
    composeCompanyRegistry(...inputs).revision
  );
});

function setField(value, field, replacement) {
  const parts = field.split('.');
  const key = parts.pop();
  parts.reduce((row, part) => row[part], value)[key] = replacement;
}
/** @type {Array<[string, unknown, RegExp]>} */
const invalidFields = [
  ['objects.2.id', undefined, /string|stable ID/],
  ['objects.0.type', 'credential', /type/],
  ['objects.0.secret', 'fixture', /fields/],
  ['objects.0.owner', '', /owner/],
  ['objects.0.authority.repository', '', /repository/],
  ['objects.0.authority.path', '../private', /relative/],
  ['objects.1.capabilities', ['missing'], /capability/],
  ['objects.1.dependencies', null, /array/],
  ['objects.0.attributes.slug', 'Other/Repo', /authority mismatch/],
  ['objects.1.authority.repository', 'Other/Repo', /repository mismatch/],
  ['objects.1.attributes.identityPath', 'other.ts', /identity authority/],
  ['objects.2.attributes.serviceId', 'missing', /service reference/],
  ['objects.2.attributes.issue', 'JOV-0', /work reference/],
  ['coverage.0.state', 'complete', /completeness/],
  ['coverage.0.state', 'unenumerated', /contains objects/],
  ['coverage.0.sourceRefs', [], /source required/],
  ['schema', 'future', /schema/],
  ['objects', null, /arrays/],
];
for (const [field, value, error] of invalidFields)
  test(`rejects invalid company ${field}: ${JSON.stringify(value)}`, () => {
    const inputs = fixture();
    setField(inputs[0].company, field, value);
    assert.throws(() => composeCompanyRegistry(...inputs), error);
  });
/** @type {Array<[string, (company: ReturnType<typeof fixture>[number]['company']) => void, RegExp]>} */
const invalidCases = [
  ['missing repository', c => c.objects.splice(0, 1), /dependency|repository/],
  ['duplicate identity', c => c.objects.push(c.objects[0]), /duplicate/],
  [
    'duplicate dependency',
    c => c.objects[1].dependencies.push('repository.summer-config'),
    /duplicate/,
  ],
  ['cycle', c => c.objects[0].dependencies.push('company.summer'), /cycle/],
  [
    'self dependency',
    c => c.objects[0].dependencies.push(c.objects[0].id),
    /self dependency/,
  ],
  ['missing coverage', c => c.coverage.pop(), /coverage domain/],
  ['duplicate coverage', c => c.coverage.push(c.coverage[0]), /coverage type/],
];
for (const [name, mutate, error] of invalidCases) {
  test(`rejects ${name}`, () => {
    const inputs = fixture();
    mutate(inputs[0].company);
    assert.throws(() => composeCompanyRegistry(...inputs), error);
  });
}

test('registry links must identify the same service and retain certification authority', () => {
  const inputs = fixture();
  inputs[1].companyServiceId = 'missing';
  assert.throws(() => composeCompanyRegistry(...inputs), /service reference/);
  inputs[1].companyServiceId = 'company.summer';
  inputs[2].certificationContract = 'replacement';
  assert.throws(() => composeCompanyRegistry(...inputs), /certification/);
});

test('rejects conflicting canonical production, while permitting explicitly noncanonical candidates', () => {
  const inputs = withDeployment();
  const c = inputs[0].company;
  const first = c.objects.at(-1);
  const second = structuredClone(first);
  second.id = 'deployment.candidate';
  c.objects.push(second);
  assert.throws(
    () => composeCompanyRegistry(...inputs),
    /conflicting production/
  );
  second.attributes.role = 'candidate';
  assert.equal(composeCompanyRegistry(...inputs).objects.length, 5);
  second.attributes.role = 'canonical';
  second.attributes.environment = 'staging';
  assert.equal(composeCompanyRegistry(...inputs).objects.length, 5);
});

const credentialFixture = new URL('https://example.test');
credentialFixture.username = 'synthetic-test-user';
credentialFixture.password = 'synthetic-test-password';
/** @type {Array<[string, string, RegExp]>} */
const invalidDeployments = [
  ['endpoint', credentialFixture.href, /without credentials/],
  ['endpoint', 'https://example.test?token=fixture', /without credentials/],
  ['endpoint', 'http://example.test', /HTTPS/],
  ['environment', 'unknown', /scope/],
  ['role', 'active', /scope/],
];
for (const [field, value, error] of invalidDeployments)
  test(`rejects deployment ${field} ${value}`, () => {
    const inputs = withDeployment();
    inputs[0].company.objects.at(-1).attributes[field] = value;
    assert.throws(() => composeCompanyRegistry(...inputs), error);
  });
test('rejects deployment authority drift', () => {
  const inputs = withDeployment();
  inputs[0].company.objects.at(-1).authority.path = 'other.ts';
  assert.throws(
    () => composeCompanyRegistry(...inputs),
    /deployment authority/
  );
});

function observations() {
  const projection = composeCompanyRegistry(...withDeployment());
  const expected = {
    objectId: 'deployment.synthetic',
    projectionRevision: projection.revision,
    repository: 'JovieInc/summer-config',
    sourceRevision: 'a'.repeat(40),
    artifactDigest: 'b'.repeat(64),
    deploymentId: 'dpl_fixture',
  };
  const observation = {
    ...expected,
    observedAt: '2026-09-19T23:00:00Z',
    expiresAt: '2026-09-19T23:10:00Z',
    evidenceRef: 'record://synthetic/fixture',
  };
  return /** @type {[typeof projection, typeof expected, typeof observation, number]} */ ([
    projection,
    expected,
    observation,
    Date.parse('2026-09-19T23:05:00Z'),
  ]);
}
test('fresh exact observation proves binding only, never certification', () => {
  assert.deepEqual(validateCompanyObservation(...observations()), {
    status: 'bound-observation',
    certified: false,
    evidenceRef: 'record://synthetic/fixture',
  });
});
test('caller cannot stretch freshness using a distant expiry', () => {
  const args = observations();
  args[2].expiresAt = '2026-09-20T23:00:00Z';
  assert.throws(() => validateCompanyObservation(...args), /stale/);
  args[3] = Date.parse('2026-09-20T22:00:00Z');
  assert.throws(() => validateCompanyObservation(...args), /stale/);
});
for (const field of [
  'objectId',
  'projectionRevision',
  'repository',
  'sourceRevision',
  'artifactDigest',
  'deploymentId',
]) {
  test(`rejects observed ${field} mismatch`, () => {
    const args = observations();
    args[2][field] = 'different';
    assert.throws(
      () => validateCompanyObservation(...args),
      /mismatched artifact/
    );
  });
}
/** @type {Array<[string, (args: ReturnType<typeof observations>) => void, RegExp]>} */
const invalidObservations = [
  [
    'stale',
    a => {
      a[3] = Date.parse(a[2].expiresAt);
    },
    /stale/,
  ],
  [
    'future',
    a => {
      a[3] = Date.parse(a[2].observedAt) - 1;
    },
    /future/,
  ],
  [
    'bad clock',
    a => {
      a[3] = NaN;
    },
    /clock/,
  ],
  [
    'invalid date',
    a => {
      a[2].observedAt = '2026-02-30T23:00:00Z';
    },
    /timestamp/,
  ],
  [
    'wrong target',
    a => {
      a[1].objectId = 'company.summer';
    },
    /target/,
  ],
  [
    'stale projection',
    a => {
      a[1].projectionRevision = 'old';
    },
    /authority/,
  ],
  [
    'wrong repository',
    a => {
      a[1].repository = 'Other/Repo';
    },
    /authority/,
  ],
  [
    'short SHA',
    a => {
      a[1].sourceRevision = 'abc123';
    },
    /revision/,
  ],
  [
    'short digest',
    a => {
      a[1].artifactDigest = 'abc123';
    },
    /revision/,
  ],
  [
    'missing evidence',
    a => {
      a[2].evidenceRef = '';
    },
    /evidence/,
  ],
];
for (const [name, mutate, error] of invalidObservations)
  test(`rejects ${name} observation`, () => {
    const args = observations();
    mutate(args);
    assert.throws(() => validateCompanyObservation(...args), error);
  });
