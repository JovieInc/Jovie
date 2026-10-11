import { describe, expect, it } from 'vitest';
import {
  detectLinktreeBadgeEvidence,
  detectLinktreePaidTier,
  detectLinktreeVerification,
} from '@/lib/ingestion/strategies/linktree/paid-tier';

describe('Linktree public billing and badge evidence', () => {
  it('does not infer paid access when branding is absent', () => {
    expect(
      detectLinktreePaidTier(
        '<html><a href="https://example.com">link</a></html>'
      )
    ).toBeNull();
  });

  it('does not infer free access when branding is enabled on a paid account', () => {
    // Public HTML cannot reveal the account's actual billing state. The
    // detector records only the observed branded presentation.
    expect(detectLinktreePaidTier('<footer>Made with Linktree</footer>')).toBe(
      false
    );
  });

  it('returns unknown for parser and error pages', () => {
    expect(detectLinktreePaidTier('<html>Not found</html>')).toBeNull();
    expect(detectLinktreePaidTier('')).toBeNull();
  });

  it('keeps ambiguous badges unknown and structured identity badges separate', () => {
    expect(
      detectLinktreeVerification('<span class="badge">pro</span>', null)
    ).toBeNull();
    expect(
      detectLinktreeVerification('', {
        props: { pageProps: { user: { isVerified: true } } },
      })
    ).toBe(true);
    expect(
      detectLinktreeBadgeEvidence('<span>Supporter badge</span>', null)
    ).toEqual({ type: 'commerce_or_feature', observed: true });
  });
});
