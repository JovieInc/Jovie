export function isMissingPromoDownloadsRelation(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  const code =
    typeof error === 'object' && error !== null
      ? ((error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;

  return (
    (code === '42P01' && message.includes('promo_downloads')) ||
    /relation ["']?promo_downloads["']? does not exist/.test(message)
  );
}
