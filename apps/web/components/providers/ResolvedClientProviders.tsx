import { ClientProviders } from '@/components/providers/ClientProviders';
import { getClientAuthBootstrap } from '@/lib/auth/dev-test-auth.server';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import type { ThemeMode } from '@/types';

interface ResolvedClientProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode?: ThemeMode;
  readonly skipCoreProviders?: boolean;
}

export async function ResolvedClientProviders({
  children,
  initialThemeMode,
  skipCoreProviders,
}: ResolvedClientProvidersProps) {
  const [publishableKey, authBootstrap] = await Promise.all([
    resolvePublishableKeyFromHeaders(),
    getClientAuthBootstrap(),
  ]);

  return (
    <ClientProviders
      authBootstrap={authBootstrap}
      initialThemeMode={initialThemeMode}
      publishableKey={publishableKey}
      skipCoreProviders={skipCoreProviders}
    >
      {children}
    </ClientProviders>
  );
}
