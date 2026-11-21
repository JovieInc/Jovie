import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  githubHttpErrorMessage,
  isPublicationObservationError,
  publishedFeedErrorMessage,
} from './publication-observation.mjs';

test('rate-limit 403/network/5xx are observation errors; bare 403 is not', () => {
  assert.equal(
    isPublicationObservationError(
      new Error(
        publishedFeedErrorMessage(
          403,
          'API rate limit exceeded for installation ID 42'
        )
      )
    ),
    true
  );
  assert.equal(
    isPublicationObservationError(
      new Error(publishedFeedErrorMessage(403, 'denied'))
    ),
    false
  );
  assert.equal(
    isPublicationObservationError(new Error('network unavailable')),
    true
  );
  assert.equal(
    isPublicationObservationError(
      new Error(githubHttpErrorMessage('https://x', 503))
    ),
    true
  );
  assert.equal(
    isPublicationObservationError(
      new Error(githubHttpErrorMessage('https://x', 429))
    ),
    true
  );
});
