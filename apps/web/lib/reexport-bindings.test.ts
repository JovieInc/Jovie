import { flexRender as flexRenderFromTable } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { WORKFLOW_CAPTURE_REQUEST_KIND as kindFromSource } from '@/lib/connectors/suggested-action-kinds';
import { PRIMARY_ARTIST_ROLES as rolesFromPolicy } from '@/lib/discography/artist-credit-policy';
import { PRIMARY_ARTIST_ROLES } from '@/lib/discography/release-credits';
import { isRetryableTransportError as fromBounded } from '@/lib/http/bounded-fetch';
import { isRetryableTransportError } from '@/lib/http/server-fetch';
import { flexRender } from '@/lib/tanstack-table';
import { WORKFLOW_CAPTURE_REQUEST_KIND } from '@/lib/workflow-capture/contract';

describe('re-exported bindings', () => {
  it('keeps the primary-artist role list', () => {
    expect(PRIMARY_ARTIST_ROLES).toBe(rolesFromPolicy);
    expect(PRIMARY_ARTIST_ROLES).toContain('main_artist');
  });

  it('keeps the workflow capture request kind', () => {
    expect(WORKFLOW_CAPTURE_REQUEST_KIND).toBe(kindFromSource);
    expect(WORKFLOW_CAPTURE_REQUEST_KIND).toBe('workflow_capture.request');
  });

  it('keeps the transport retry predicate', () => {
    expect(isRetryableTransportError).toBe(fromBounded);
    expect(isRetryableTransportError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableTransportError(new Error('validation failed'))).toBe(
      false
    );
  });

  it('keeps flexRender', () => {
    expect(flexRender).toBe(flexRenderFromTable);
    expect(flexRender('Shown', {})).toBe('Shown');
  });
});
