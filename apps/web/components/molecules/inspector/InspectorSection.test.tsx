import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import { InspectorSection } from './InspectorSection';

describe('InspectorSection', () => {
  it('renders a non-collapsible section with an optional heading', () => {
    render(
      <InspectorSection title='Assets'>
        <p>Body copy</p>
      </InspectorSection>
    );

    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('Body copy')).toBeInTheDocument();
  });
});
