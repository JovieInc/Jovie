const GITHUB_REPOSITORY_NAME = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const VERCEL_PROJECT_NAME = /^[a-z0-9._-]{1,100}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractGithubCreate(
  eventName: string | null,
  payload: unknown
): { kind: 'github-repo'; name: string } | null {
  if (
    eventName !== 'repository' ||
    !isRecord(payload) ||
    typeof payload.action !== 'string' ||
    !['created', 'renamed', 'transferred'].includes(payload.action) ||
    !isRecord(payload.repository)
  ) {
    return null;
  }

  const name = payload.repository.full_name;
  return typeof name === 'string' &&
    name.trim() === name &&
    GITHUB_REPOSITORY_NAME.test(name)
    ? { kind: 'github-repo', name }
    : null;
}

export function extractVercelCreate(
  payload: unknown
): { kind: 'vercel-project'; name: string } | null {
  if (
    !isRecord(payload) ||
    // https://vercel.com/docs/webhooks/webhooks-api#project.renamed
    (payload.type !== 'project.created' &&
      payload.type !== 'project.renamed') ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.project)
  ) {
    return null;
  }

  const name = payload.payload.project.name;
  return typeof name === 'string' &&
    name.trim() === name &&
    VERCEL_PROJECT_NAME.test(name)
    ? { kind: 'vercel-project', name }
    : null;
}
