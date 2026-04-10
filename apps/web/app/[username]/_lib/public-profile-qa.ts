export function shouldBypassPublicProfileQaCache(): boolean {
  return process.env.PUBLIC_NOAUTH_SMOKE === '1';
}
