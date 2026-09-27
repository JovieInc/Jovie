import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateArticleStructure } from './article-structure.mjs';

const METADATA = { id: 'connect-spotify' };

const VALID_GUIDE = `
<HelpArticle id="connect-spotify">

# Connect Spotify to Jovie

<HelpOutcome>
Link your Spotify artist account so Jovie imports your releases.
</HelpOutcome>

<HelpPrerequisites>

- A Jovie account
- Your Spotify login

</HelpPrerequisites>

<HelpSteps>
<HelpStep title="Open Library">Go to **Library**.</HelpStep>
<HelpStep title="Select Connect Spotify">Authorize access.</HelpStep>
<HelpStep title="Confirm the import">Releases appear.</HelpStep>
</HelpSteps>

<HelpScreenshot src="/proof/connect-spotify.png" alt="Library with the Connect Spotify action" />

## What happens next

Imported releases appear in **Library**.

<HelpTroubleshooting>

### Authorization failed

Use your artist account, not a listener account.

### Releases are missing

Wait 24 hours and retry.

</HelpTroubleshooting>

<HelpRelatedGuides articleId="connect-spotify" />

<HelpContactPanel />

<HelpFeedback articleId="connect-spotify" />

</HelpArticle>
`;

function errors(body, metadata = METADATA) {
  try {
    validateArticleStructure(body, metadata, { sourcePath: 'test.mdx' });
    return [];
  } catch (error) {
    return error.message.split('\n').slice(1);
  }
}

describe('validateArticleStructure', () => {
  it('accepts the canonical guide anatomy', () => {
    validateArticleStructure(VALID_GUIDE, METADATA);
  });

  it('requires the HelpArticle wrapper and matching id', () => {
    const withoutWrapper = errors(
      VALID_GUIDE.replace('<HelpArticle id="connect-spotify">', '')
    );
    assert.ok(
      withoutWrapper.some(line => line.includes('must open with <HelpArticle'))
    );
    const mismatched = errors(
      VALID_GUIDE.replace(
        '<HelpArticle id="connect-spotify">',
        '<HelpArticle id="other-guide">'
      )
    );
    assert.ok(mismatched.some(line => line.includes('must match frontmatter')));
  });

  it('requires the outcome, steps, next section, related guides, and feedback', () => {
    for (const token of [
      '<HelpOutcome>',
      '<HelpSteps>',
      '## What happens next',
      '<HelpRelatedGuides',
      '<HelpFeedback',
    ]) {
      const broken = VALID_GUIDE.replace(token, token.replace('Help', 'Xelp'));
      const lines = errors(
        token === '## What happens next'
          ? VALID_GUIDE.replace(token, '## Afterward')
          : broken
      );
      assert.ok(lines.length > 0, `expected failure removing ${token}`);
    }
  });

  it('enforces the 3-7 step range', () => {
    const twoSteps = VALID_GUIDE.replace(
      '<HelpStep title="Confirm the import">Releases appear.</HelpStep>',
      ''
    );
    assert.ok(
      errors(twoSteps).some(line => line.includes('3-7 HelpStep entries'))
    );

    let manySteps = VALID_GUIDE;
    for (let i = 0; i < 5; i += 1) {
      manySteps = manySteps.replace(
        '</HelpSteps>',
        `<HelpStep title="Extra ${i}">More.</HelpStep>\n</HelpSteps>`
      );
    }
    assert.ok(
      errors(manySteps).some(line => line.includes('3-7 HelpStep entries'))
    );
  });

  it('requires visual proof', () => {
    const noMedia = errors(VALID_GUIDE.replace(/<HelpScreenshot[^>]*\/>/, ''));
    assert.ok(noMedia.some(line => line.includes('visual proof')));
  });

  it('enforces 2-3 troubleshooting cases', () => {
    const oneCase = VALID_GUIDE.replace(
      /### Releases are missing\n\nWait 24 hours and retry\.\n/,
      ''
    );
    assert.ok(errors(oneCase).some(line => line.includes('2-3 failure cases')));
  });

  it('requires closing the article wrapper', () => {
    const unclosed = errors(VALID_GUIDE.replace('</HelpArticle>', ''));
    assert.ok(unclosed.some(line => line.includes('</HelpArticle>')));
  });
});
