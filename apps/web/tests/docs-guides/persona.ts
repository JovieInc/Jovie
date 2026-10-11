/**
 * Documentation capture persona (JOV-5900).
 *
 * Help Center screenshots must show stable, non-sensitive example data. This
 * persona is the only identity the docs capture flows are allowed to display;
 * the authenticated session still comes from the shared E2E bootstrap
 * (`tests/e2e/auth.setup.ts`), never from hand-maintained credentials.
 */

export const DOCS_GUIDE_PERSONA = {
  handle: 'docs-example',
  displayName: 'Example Artist',
  email: 'docs-example@example.com',
  linkTitle: 'New Single',
} as const;

/**
 * Selectors whose rendered content is replaced or hidden before capture so
 * tokens, account identifiers, emails, and live timestamps never ship in a
 * Help Center screenshot.
 */
export const SENSITIVE_CAPTURE_SELECTORS = [
  '[data-sensitive]',
  '[data-testid="user-button"]',
  '[data-testid="user-avatar"]',
  '.cl-userButton-root',
  '.cl-avatarBox',
  'time',
  '[data-testid*="timestamp"]',
] as const;

/**
 * Hide persona-identifying widgets and scrub emails/tokens/UUIDs from visible
 * text nodes before a screenshot is taken.
 */
export async function sanitizeDocsCaptureDom(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.evaluate(
    ({ selectors, personaEmail }) => {
      for (const selector of selectors) {
        document
          .querySelectorAll(selector)
          .forEach(el => ((el as HTMLElement).style.display = 'none'));
      }

      const patterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        /\b(?:sk|pk|key|token|secret|bearer)[_-][A-Za-z0-9_-]{8,}\b/gi,
        /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      ];

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      const nodes: Text[] = [];
      let current = walker.nextNode();
      while (current) {
        nodes.push(current as Text);
        current = walker.nextNode();
      }
      for (const node of nodes) {
        const value = node.nodeValue;
        if (!value) continue;
        let next = value;
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          next = next.replace(pattern, match =>
            match.includes('@') ? personaEmail : '[redacted]'
          );
        }
        if (next !== value) node.nodeValue = next;
      }
    },
    {
      selectors: SENSITIVE_CAPTURE_SELECTORS,
      personaEmail: DOCS_GUIDE_PERSONA.email,
    }
  );
}
