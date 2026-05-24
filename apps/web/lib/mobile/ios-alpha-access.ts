export interface IOSAlphaAccessInput {
  readonly isAuthenticated: boolean;
  readonly isAdmin: boolean;
  readonly flagEnabled: boolean;
  readonly installUrl: string | null | undefined;
}

export interface IOSAlphaAccess {
  readonly hasAccess: boolean;
  readonly installUrl: string | null;
}

export function resolveIOSAlphaAccess({
  isAuthenticated,
  isAdmin,
  flagEnabled,
  installUrl,
}: IOSAlphaAccessInput): IOSAlphaAccess {
  const hasAccess = isAuthenticated && (isAdmin || flagEnabled);
  const trimmedInstallUrl = installUrl?.trim() ?? '';

  return {
    hasAccess,
    installUrl: hasAccess && trimmedInstallUrl ? trimmedInstallUrl : null,
  };
}
