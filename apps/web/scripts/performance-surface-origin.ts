/** Matches canonical and credential-bearing GitHub origin URLs for this repo. */
export function originRepositorySlug(url: string): string | null {
  const sshMatch = url.match(
    /github\.com:(?<owner>[^/]+)\/(?<repo>[^.\n]+)(?:\.git)?$/
  );
  if (sshMatch?.groups?.owner && sshMatch.groups.repo) {
    return `${sshMatch.groups.owner}/${sshMatch.groups.repo}`;
  }
  const httpsMatch = url.match(
    /github\.com\/(?<owner>[^/]+)\/(?<repo>[^.\n/]+)(?:\.git)?$/
  );
  if (httpsMatch?.groups?.owner && httpsMatch.groups.repo) {
    return `${httpsMatch.groups.owner}/${httpsMatch.groups.repo}`;
  }
  return null;
}
