import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectDomainsUrl,
  PRODUCTION_DOMAIN_EXPECTATIONS,
  validateProductionDomains,
} from './verify-vercel-production-domains.mjs';

const canonicalProjectId = 'prj_canonical';

function buildDomain(overrides) {
  return {
    name: overrides.name,
    projectId: canonicalProjectId,
    redirect: null,
    redirectStatusCode: null,
    verified: true,
    ...overrides,
  };
}

function validDomains() {
  return PRODUCTION_DOMAIN_EXPECTATIONS.map(expectation =>
    buildDomain({
      name: expectation.name,
      redirect: expectation.redirect,
      redirectStatusCode: expectation.redirectStatusCode,
    })
  );
}

test('buildProjectDomainsUrl scopes team ids as teamId', () => {
  const url = buildProjectDomainsUrl({
    orgId: 'team_123',
    projectId: canonicalProjectId,
  });

  assert.equal(
    url.toString(),
    'https://api.vercel.com/v9/projects/prj_canonical/domains?teamId=team_123'
  );
});

test('buildProjectDomainsUrl scopes non-team ids as slugs', () => {
  const url = buildProjectDomainsUrl({
    orgId: 'jovie',
    projectId: canonicalProjectId,
  });

  assert.equal(
    url.toString(),
    'https://api.vercel.com/v9/projects/prj_canonical/domains?slug=jovie'
  );
});

test('validateProductionDomains passes for the canonical public domain set', () => {
  const result = validateProductionDomains({
    domains: validDomains(),
    expectedProjectId: canonicalProjectId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('validateProductionDomains fails when jov.ie is missing from the canonical project', () => {
  const result = validateProductionDomains({
    domains: validDomains().filter(domain => domain.name !== 'jov.ie'),
    expectedProjectId: canonicalProjectId,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join('\n'),
    /jov\.ie: missing from canonical Vercel project prj_canonical/
  );
});

test('validateProductionDomains fails when a public domain belongs to another project', () => {
  const domains = validDomains();
  domains[0] = {
    ...domains[0],
    projectId: 'prj_stale',
  };

  const result = validateProductionDomains({
    domains,
    expectedProjectId: canonicalProjectId,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join('\n'),
    /jov\.ie: projectId=prj_stale, expected prj_canonical/
  );
});

test('validateProductionDomains fails when redirect aliases drift', () => {
  const domains = validDomains();
  domains[1] = {
    ...domains[1],
    redirect: null,
    redirectStatusCode: null,
  };

  const result = validateProductionDomains({
    domains,
    expectedProjectId: canonicalProjectId,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join('\n'),
    /www\.jov\.ie: redirect=<none>, expected jov\.ie/
  );
  assert.match(
    result.failures.join('\n'),
    /www\.jov\.ie: redirectStatusCode=<none>, expected 301/
  );
});
