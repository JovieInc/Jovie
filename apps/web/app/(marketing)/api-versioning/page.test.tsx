import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ARTIST_API_OPENAPI_URL,
  PUBLIC_ARTIST_API_POLICY_LINK,
  PUBLIC_ARTIST_API_POLICY_URL,
} from '@/lib/api/v1/contract';
import {
  API_VERSIONING_POLICY,
  ARTIST_OPENAPI_DOCUMENT,
} from '@/lib/api/v1/openapi';
import ApiVersioningPage from './page';

describe('ApiVersioningPage', () => {
  it('publishes the canonical lifecycle policy and machine-readable contract links', () => {
    render(<ApiVersioningPage />);

    expect(
      screen.getByRole('heading', {
        name: 'API Versioning And Deprecation Policy',
      })
    ).toBeInTheDocument();
    const lifecycleSection = screen
      .getByRole('heading', { name: 'Deprecation And Sunset Signals' })
      .closest('section');
    expect(lifecycleSection).toHaveTextContent(
      /Version v1 is active and is not deprecated/i
    );
    expect(lifecycleSection).toHaveTextContent(
      /omit Deprecation and Sunset headers/i
    );
    expect(
      screen.getByRole('link', { name: 'OpenAPI 3.1 contract' })
    ).toHaveAttribute('href', PUBLIC_ARTIST_API_OPENAPI_URL);
    expect(PUBLIC_ARTIST_API_POLICY_URL).toBe('https://jov.ie/api-versioning');
  });

  it('keeps active v1 truthful while exposing future lifecycle signals', () => {
    expect(PUBLIC_ARTIST_API_POLICY_LINK).toBe(
      '<https://jov.ie/api-versioning>; rel="deprecation"; type="text/html"'
    );
    expect(API_VERSIONING_POLICY).toEqual(
      ARTIST_OPENAPI_DOCUMENT['x-jovie-versioning']
    );
    expect(API_VERSIONING_POLICY.policyUrl).toBe(PUBLIC_ARTIST_API_POLICY_URL);
    expect(API_VERSIONING_POLICY.activeVersion).toBe('v1');
    expect(API_VERSIONING_POLICY.lifecycle.deprecation.active).toBe(false);
    expect(API_VERSIONING_POLICY.lifecycle.sunset.active).toBe(false);

    for (const operation of Object.values(ARTIST_OPENAPI_DOCUMENT.paths)) {
      for (const response of Object.values(operation.get.responses)) {
        expect(response.headers?.Deprecation).toBeUndefined();
        expect(response.headers?.Sunset).toBeUndefined();
      }
    }
  });
});
