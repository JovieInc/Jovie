export function shouldBypassPublicProfileQaCache(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.PUBLIC_NOAUTH_SMOKE === '1'
  );
}
