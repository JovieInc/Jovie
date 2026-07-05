import {
  developmentOnlyForbiddenJson,
  isExplicitDevelopmentEnvironment,
} from '@/lib/security/development-only';

export async function GET() {
  if (!isExplicitDevelopmentEnvironment()) {
    return developmentOnlyForbiddenJson();
  }

  throw new Error('Intentional Sentry example API error');
}
