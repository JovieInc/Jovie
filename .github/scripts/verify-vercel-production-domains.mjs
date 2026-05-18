#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const PRODUCTION_DOMAIN_EXPECTATIONS = Object.freeze([
  { name: 'jov.ie', redirect: null, redirectStatusCode: null },
  { name: 'www.jov.ie', redirect: 'jov.ie', redirectStatusCode: 301 },
  { name: 'jovie.app', redirect: 'jov.ie', redirectStatusCode: 301 },
  { name: 'meetjovie.com', redirect: 'jov.ie', redirectStatusCode: 301 },
  { name: 'www.meetjovie.com', redirect: 'jov.ie', redirectStatusCode: 301 },
  { name: 'jovie.fm', redirect: 'jov.ie', redirectStatusCode: 308 },
]);

export const VERCEL_DOMAINS_API_TIMEOUT_MS = 10_000;

export function buildProjectDomainsUrl({ projectId, orgId }) {
  const url = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains`
  );

  if (orgId) {
    if (orgId.startsWith('team_')) {
      url.searchParams.set('teamId', orgId);
    } else {
      url.searchParams.set('slug', orgId);
    }
  }

  return url;
}

export async function fetchProjectDomains({
  fetchImpl = fetch,
  orgId,
  projectId,
  timeoutMs = VERCEL_DOMAINS_API_TIMEOUT_MS,
  token,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      buildProjectDomainsUrl({ projectId, orgId }),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Vercel domains API failed: HTTP ${response.status} ${body}`.trim()
      );
    }

    const payload = await response.json();
    return Array.isArray(payload.domains) ? payload.domains : [];
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Vercel domains API timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function validateProductionDomains({
  domains,
  expectedProjectId,
  expectations = PRODUCTION_DOMAIN_EXPECTATIONS,
}) {
  const domainByName = new Map(domains.map(domain => [domain.name, domain]));
  const failures = [];

  for (const expectation of expectations) {
    const domain = domainByName.get(expectation.name);

    if (!domain) {
      failures.push(
        `${expectation.name}: missing from canonical Vercel project ${expectedProjectId}`
      );
      continue;
    }

    if (domain.projectId !== expectedProjectId) {
      failures.push(
        `${expectation.name}: projectId=${domain.projectId ?? '<empty>'}, expected ${expectedProjectId}`
      );
    }

    if (domain.verified !== true) {
      failures.push(`${expectation.name}: domain is not verified`);
    }

    const actualRedirect = domain.redirect ?? null;
    if (actualRedirect !== expectation.redirect) {
      failures.push(
        `${expectation.name}: redirect=${actualRedirect ?? '<none>'}, expected ${
          expectation.redirect ?? '<none>'
        }`
      );
    }

    const actualRedirectStatus =
      domain.redirectStatusCode === null ||
      domain.redirectStatusCode === undefined
        ? null
        : Number(domain.redirectStatusCode);
    if (actualRedirectStatus !== expectation.redirectStatusCode) {
      failures.push(
        `${expectation.name}: redirectStatusCode=${
          actualRedirectStatus ?? '<none>'
        }, expected ${expectation.redirectStatusCode ?? '<none>'}`
      );
    }
  }

  return {
    checked: expectations.map(expectation => expectation.name),
    failures,
    ok: failures.length === 0,
  };
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  const orgId = process.env.VERCEL_ORG_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    throw new Error('VERCEL_TOKEN and VERCEL_PROJECT_ID are required');
  }

  const domains = await fetchProjectDomains({ orgId, projectId, token });
  const result = validateProductionDomains({
    domains,
    expectedProjectId: projectId,
  });

  if (!result.ok) {
    console.error('Production domain guard failed:');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Production domain guard passed for ${result.checked.join(', ')}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(
      `Production domain guard crashed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  });
}
