export interface IOSAlphaAccessInput {
  readonly isAuthenticated: boolean;
  readonly installUrl: string | null | undefined;
}

export interface IOSAlphaAccess {
  readonly hasAccess: boolean;
  readonly installUrl: string | null;
}

export function resolveIOSAlphaAccess({
  isAuthenticated,
  installUrl,
}: IOSAlphaAccessInput): IOSAlphaAccess {
  const hasAccess = isAuthenticated;
  const trimmedInstallUrl = installUrl?.trim() ?? '';

  return {
    hasAccess,
    installUrl: hasAccess && trimmedInstallUrl ? trimmedInstallUrl : null,
  };
}
