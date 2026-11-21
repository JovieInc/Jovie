import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Allowlist of modules `apps/web/next.config.js` may require while the
 * tracing test evaluates it in a vm. A new runtime dependency fails the
 * test until it is stubbed here.
 */
export function createNextConfigTestRequire(input: {
  readonly configDirectory: string;
  readonly repoRequire: (specifier: string) => unknown;
  readonly identityConfig: (config: unknown) => unknown;
}): (specifier: string) => unknown {
  const { configDirectory, repoRequire, identityConfig } = input;
  return (specifier: string): unknown => {
    switch (specifier) {
      case 'path':
        return repoRequire('node:path');
      case '../../version.json':
        return JSON.parse(
          readFileSync(resolve(configDirectory, specifier), 'utf8')
        );
      case '@next/bundle-analyzer':
        return () => identityConfig;
      case 'workflow/next':
        return { withWorkflow: identityConfig };
      case '@vercel/toolbar/plugins/next':
        return () => identityConfig;
      case '@sentry/nextjs/config':
        return { withSentryConfig: identityConfig };
      case './lib/routing/legacy-profile-alias-redirects':
        return repoRequire(resolve(configDirectory, specifier));
      case './scripts/write-build-deployed-at.cjs':
        return { writeBuildDeployedAt() {} };
      default:
        throw new Error(`Unexpected next.config.js dependency: ${specifier}`);
    }
  };
}
