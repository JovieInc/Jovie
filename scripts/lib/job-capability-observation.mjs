/** Adapters for existing jobs; emitted requests use their existing journals/artifacts. */
// api-budget: github-user-graphql 0/hr - pure evidence formatting; no network calls
import { GITHUB_API } from '../../packages/api-client/github.ts';
import {
  classifyCapabilityFailure,
  createCapabilityRequest,
} from './capability-request.mjs';

export function publicationCapabilityRequest({
  head,
  branch,
  result,
  nowMs,
  identity = undefined,
}) {
  const diagnostic = `${result?.stderr ?? ''}\n${result?.stdout ?? ''}`;
  const httpStatus = /\bHTTP(?:\/[\d.]+)?\s+(401|403|429)\b/i.exec(
    diagnostic
  )?.[1];
  const graphForbidden =
    /Post ["']?https:\/\/api\.github\.com\/graphql["']?: Forbidden/i.test(
      diagnostic
    );
  const status = httpStatus ? Number(httpStatus) : graphForbidden ? 403 : null;
  const observation = classifyCapabilityFailure({
    status,
    code:
      result?.error?.code === 'ENOENT'
        ? 'ENOENT'
        : 'publication-route-unavailable',
    ...(['ENETUNREACH', 'EAI_AGAIN', 'ECONNREFUSED'].includes(
      result?.error?.code
    )
      ? { kind: 'network-route' }
      : {}),
    capability: 'github-graphql',
    scope: 'JovieInc/Jovie:pull-request-create',
    source: `${GITHUB_API}/graphql`,
  });
  if (!observation) return null;
  return createCapabilityRequest(
    {
      id: `publication:${branch}`,
      head,
      action: 'open-draft-pr',
      principal: identity?.principal ?? 'unverified-principal',
      environment: identity?.environment ?? 'unverified-executor',
      bindingVerified: Boolean(identity?.principal && identity?.environment),
      owner: 'environment-access-owner',
    },
    observation,
    nowMs,
    new Date(nowMs + 3_600_000).toISOString()
  );
}

export function spendCredentialRequest(env, nowMs) {
  if (env.VERCEL_TOKEN) return null;
  return createCapabilityRequest(
    {
      id: 'spend-guard',
      head: env.GITHUB_SHA,
      action: 'read-vercel-usage',
      principal: 'spend-guard',
      environment: 'github-actions',
      owner: 'vercel-credential-owner',
    },
    {
      kind: 'credential',
      capability: 'VERCEL_READONLY_TOKEN',
      scope: 'vercel-team-usage-read-only',
      code: 'credential-unavailable',
      source:
        env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY
          ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : null,
    },
    nowMs,
    new Date(nowMs + 3_600_000).toISOString()
  );
}
