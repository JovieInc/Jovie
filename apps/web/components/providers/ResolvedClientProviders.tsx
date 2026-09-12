import { ClientProviders } from '@/components/providers/ClientProviders';
import { getClientAuthBootstrap } from '@/lib/auth/dev-test-auth.server';
import type { ThemeMode } from '@/types';

interface ResolvedClientProvidersProps {
  readonly children: React.ReactNode;
  readonly forceSignedOutDefaults?: boolean;
  readonly initialThemeMode?: ThemeMode;
  readonly skipCoreProviders?: boolean;
}

export async function ResolvedClientProviders({
  children,
  forceSignedOutDefaults = false,
  initialThemeMode,
  skipCoreProviders,
}: ResolvedClientProvidersProps) {
  const authBootstrap = await getClientAuthBootstrap();

  return (
    <ClientProviders
      authBootstrap={authBootstrap}
      forceSignedOutDefaults={forceSignedOutDefaults}
      initialThemeMode={initialThemeMode}
      skipCoreProviders={skipCoreProviders}
    >
      {children}
    </ClientProviders>
  );
}
