import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const firstBatchRoutes = [
  'app/(marketing)/voice/page.tsx',
  'app/(marketing)/ai/page.tsx',
  'app/(marketing)/investors/page.tsx',
] as const;

const CANONICAL_CONTAINER = "MarketingContainer width='page'";

const FORBIDDEN_BODY_PATTERNS = [
  'max-w-5xl flex',
  'sectionWrapClassName',
  'transition-all',
] as const;

/**
 * Matches a route-level delegation to a shared page body, e.g.
 * `import { VoicePageContent } from '@/components/organisms/VoicePageContent';`
 * (web-041 voice shared-body extraction, JOV-4908).
 */
const SHARED_BODY_IMPORT =
  /import \{ (\w+PageContent) \} from '@\/(components\/[^']+)';/;

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

/**
 * Resolves the file that owns a route's rendered body: the route itself when
 * the body is inline, or the shared `*PageContent` component when the route
 * delegates. The grid contract applies to whichever file renders the body.
 */
function resolveBodyOwner(route: string): {
  routeSource: string;
  bodyPath: string;
  bodySource: string;
  delegateName: string | null;
} {
  const routeSource = readSource(route);
  const delegation = routeSource.match(SHARED_BODY_IMPORT);
  if (!delegation) {
    return {
      routeSource,
      bodyPath: route,
      bodySource: routeSource,
      delegateName: null,
    };
  }
  const bodyPath = `${delegation[2]}.tsx`;
  return {
    routeSource,
    bodyPath,
    bodySource: readSource(bodyPath),
    delegateName: delegation[1],
  };
}

describe('marketing first-batch grid contract', () => {
  it('uses the canonical public page container without a local shell', () => {
    for (const route of firstBatchRoutes) {
      const { bodyPath, bodySource } = resolveBodyOwner(route);

      expect(bodySource, bodyPath).toContain(CANONICAL_CONTAINER);
      for (const pattern of FORBIDDEN_BODY_PATTERNS) {
        expect(bodySource, bodyPath).not.toContain(pattern);
      }
    }
  });

  it('keeps delegated routes free of a duplicate inline container', () => {
    for (const route of firstBatchRoutes) {
      const { routeSource, delegateName } = resolveBodyOwner(route);
      if (!delegateName) continue;

      // A route that delegates its body must not also carry the canonical
      // container inline — the shared body owns exactly one copy.
      expect(routeSource, route).not.toContain(CANONICAL_CONTAINER);
      expect(routeSource, route).toContain(`return <${delegateName} />;`);
    }
  });
});

describe('voice route shared-body relationship (JOV-4908)', () => {
  const voiceRoute = 'app/(marketing)/voice/page.tsx';
  const voiceSharedBody = 'components/organisms/VoicePageContent.tsx';

  it('keeps exactly one canonical container across route and shared body', () => {
    const routeSource = readSource(voiceRoute);
    const sharedBodyExists = existsSync(
      resolve(process.cwd(), voiceSharedBody)
    );

    if (sharedBodyExists) {
      // Shared-body extraction contract (#15721): the route delegates to
      // VoicePageContent and the shared body retains the canonical container.
      expect(routeSource, voiceRoute).toContain(
        "import { VoicePageContent } from '@/components/organisms/VoicePageContent';"
      );
      expect(routeSource, voiceRoute).toContain('return <VoicePageContent />;');
      expect(routeSource, voiceRoute).not.toContain(CANONICAL_CONTAINER);
      expect(readSource(voiceSharedBody), voiceSharedBody).toContain(
        CANONICAL_CONTAINER
      );
    } else {
      // Pre-extraction state: the route still owns its body inline.
      expect(routeSource, voiceRoute).toContain(CANONICAL_CONTAINER);
    }
  });
});
